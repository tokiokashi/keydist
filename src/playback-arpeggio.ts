import { resolveKeyId, type Finger } from './geometry.ts';
import type { Stroke } from './evaluate.ts';

export type ArpeggioHand = 'left' | 'right';

export interface ArpeggioConditions {
  minHorizontalSpread: number;
  maxRowReversal: number | null;
  maxRowStep: number | null;
  includeThumb: boolean;
  breakOnOppositeHand: boolean;
}

export const DEFAULT_ARPEGGIO_CONDITIONS: ArpeggioConditions = {
  minHorizontalSpread: 1,
  maxRowReversal: 1,
  maxRowStep: null,
  includeThumb: false,
  breakOnOppositeHand: false,
};

export const ARPEGGIO_PRESETS: Readonly<Record<string, ArpeggioConditions>> = {
  standard: DEFAULT_ARPEGGIO_CONDITIONS,
  strict: {
    ...DEFAULT_ARPEGGIO_CONDITIONS,
    minHorizontalSpread: 1.5,
    maxRowStep: 1,
  },
  loose: {
    ...DEFAULT_ARPEGGIO_CONDITIONS,
    minHorizontalSpread: 0.5,
    maxRowReversal: 2,
  },
};

export function sameArpeggioConditions(left: ArpeggioConditions, right: ArpeggioConditions): boolean {
  return left.minHorizontalSpread === right.minHorizontalSpread
    && left.maxRowReversal === right.maxRowReversal
    && left.maxRowStep === right.maxRowStep
    && left.includeThumb === right.includeThumb
    && left.breakOnOppositeHand === right.breakOnOppositeHand;
}

export interface ArpeggioSpan {
  start: number;
  end: number;
  hand: ArpeggioHand;
}

interface Candidate {
  finger: Finger;
  x: number;
  row: number;
  keyId: string;
}

function handOf(finger: Finger): ArpeggioHand {
  return finger.startsWith('L') ? 'left' : 'right';
}

function isThumb(finger: Finger): boolean {
  return finger === 'LT' || finger === 'RT';
}

function fingerOrder(finger: Finger): number {
  return ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'].indexOf(finger);
}

function outputCandidates(
  stroke: Stroke,
  hand: ArpeggioHand,
  includeThumb: boolean,
): Candidate[] {
  const triggers = new Set(stroke.triggerKeys.map(resolveKeyId));
  const candidates = stroke.presses.flatMap((press) => {
    if (handOf(press.finger) !== hand) return [];
    const keys = press.keys.filter((key) => !triggers.has(resolveKeyId(key.id)));
    if (!includeThumb && isThumb(press.finger)) return [];
    return keys.map((key) => ({
      finger: press.finger,
      x: key.x,
      row: key.row,
      keyId: resolveKeyId(key.id),
    }));
  });
  // 親指だけのステップは既存の片手チェーンを切るため、ここでは出力候補にしない。
  if (includeThumb && candidates.every((candidate) => isThumb(candidate.finger))) return [];
  return candidates;
}

function hasOppositeHandOutput(stroke: Stroke, hand: ArpeggioHand, includeThumb: boolean): boolean {
  return outputCandidates(stroke, hand === 'left' ? 'right' : 'left', includeThumb).length > 0;
}

function pairForStep(
  previous: Stroke,
  current: Stroke,
  hand: ArpeggioHand,
  conditions: ArpeggioConditions,
): { previous: Candidate; current: Candidate } | undefined {
  const previousCandidates = outputCandidates(previous, hand, conditions.includeThumb);
  const currentCandidates = outputCandidates(current, hand, conditions.includeThumb);
  if (previousCandidates.length === 0 || currentCandidates.length === 0) return undefined;
  if (conditions.breakOnOppositeHand
    && (hasOppositeHandOutput(previous, hand, conditions.includeThumb)
      || hasOppositeHandOutput(current, hand, conditions.includeThumb))) return undefined;

  for (const from of previousCandidates) {
    for (const to of currentCandidates) {
      const fromOrder = fingerOrder(from.finger);
      const toOrder = fingerOrder(to.finger);
      if (fromOrder < 0 || toOrder < 0 || fromOrder === toOrder) continue;
      const horizontal = to.x - from.x;
      if (Math.abs(horizontal) < conditions.minHorizontalSpread) continue;
      if (Math.sign(horizontal) !== Math.sign(toOrder - fromOrder)) continue;
      const rowStep = Math.abs(to.row - from.row);
      if (conditions.maxRowStep !== null && rowStep > conditions.maxRowStep) continue;
      return { previous: from, current: to };
    }
  }
  return undefined;
}

function violatesRowReversal(
  rows: readonly number[],
  maxRowReversal: number | null,
): boolean {
  if (maxRowReversal === null || rows.length < 3) return false;
  for (let i = 2; i < rows.length; i++) {
    const first = rows[i - 1] - rows[i - 2];
    const second = rows[i] - rows[i - 1];
    if (first !== 0 && second !== 0 && Math.sign(first) !== Math.sign(second)
      && Math.max(Math.abs(first), Math.abs(second)) > maxRowReversal) return true;
  }
  return false;
}

/** チェーンを幾何条件で分割し、2打以上のアルペジオ区間だけを返す。 */
export function playbackArpeggioSpans(
  strokes: readonly Stroke[],
  conditions: ArpeggioConditions = DEFAULT_ARPEGGIO_CONDITIONS,
): ArpeggioSpan[] {
  const spans: ArpeggioSpan[] = [];
  for (const hand of ['left', 'right'] as const) {
    let start: number | undefined;
    let rows: number[] = [];
    let previousOutputIndex: number | undefined;
    const flush = (end: number) => {
      if (start !== undefined && end - start >= 2) spans.push({ start, end, hand });
      start = undefined;
      rows = [];
      previousOutputIndex = undefined;
    };
    for (let index = 0; index < strokes.length; index++) {
      // 親指だけのステップは、既存の片手チェーンどおり区切る。
      const currentCandidates = outputCandidates(strokes[index], hand, false);
      if (currentCandidates.length === 0) {
        flush(index);
        continue;
      }
      if (previousOutputIndex === undefined) {
        previousOutputIndex = index;
        continue;
      }
      const pair = pairForStep(strokes[previousOutputIndex], strokes[index], hand, conditions);
      if (!pair) {
        flush(index);
        previousOutputIndex = index;
        continue;
      }
      if (start === undefined) {
        start = previousOutputIndex;
        rows = [pair.previous.row, pair.current.row];
        previousOutputIndex = index;
        continue;
      }
      const nextRows = [...rows, pair.current.row];
      if (violatesRowReversal(nextRows, conditions.maxRowReversal)) {
        // 折り返しを含む塊は、直前の2連だけを残さず区間全体を不採用にする。
        // これで「下→上→下」のような振幅超過を2つの2連へ分割しない。
        start = undefined;
        rows = [];
        previousOutputIndex = index;
      } else {
        rows = nextRows;
        previousOutputIndex = index;
      }
    }
    flush(strokes.length);
  }
  return spans.sort((a, b) => a.start - b.start || a.hand.localeCompare(b.hand));
}

/** 現在位置を含むアルペジオ区間に、盤面上の表示順を割り当てる。 */
export function playbackArpeggioOrders(
  strokes: readonly Stroke[],
  cursor: number,
  conditions: ArpeggioConditions = DEFAULT_ARPEGGIO_CONDITIONS,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const orders = new Map<string, number>();
  if (end === 0) return orders;
  for (const span of playbackArpeggioSpans(strokes, conditions)) {
    if (end - 1 < span.start || end - 1 >= span.end) continue;
    // 1つのキーを区間の中で何度も踏むことがある。単純に上書きすると後の番号だけが
    // 残り、手前の番号が見えなくなる。カーソルが今いる位置から見て次に踏む番号を
    // 出す（通り過ぎた番号は出さない）。playbackChainOrdersと同じ考え方。
    const visits = new Map<string, number[]>();
    for (let index = span.start; index < span.end; index++) {
      const order = index - span.start + 1;
      for (const press of strokes[index].presses) {
        if (handOf(press.finger) !== span.hand
          || (!conditions.includeThumb && isThumb(press.finger))) continue;
        const triggers = new Set(strokes[index].triggerKeys.map(resolveKeyId));
        for (const key of press.keys) {
          const id = resolveKeyId(key.id);
          if (triggers.has(id)) continue;
          const seen = visits.get(id);
          if (!seen) visits.set(id, [order]);
          else if (seen[seen.length - 1] !== order) seen.push(order);
        }
      }
    }
    const position = end - span.start;
    for (const [id, list] of visits) {
      // 全部通り過ぎていれば最後の番号を残す。踏んだ実績まで消す必要はない
      orders.set(id, list.find((order) => order >= position) ?? list[list.length - 1]);
    }
  }
  return orders;
}

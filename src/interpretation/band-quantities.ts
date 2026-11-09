import { ALL_FINGERS, type Finger, type Key } from '#input/shapes/geometry.ts';
import type { Press, Stroke, Trace } from '#trace/generate.ts';

/**
 * 帯グラフが区分に分けて数える7つの量（定義は `docs/segment-metrics.md`「帯グラフの量」）。
 * 距離モデルの値は変えない。Traceのステップ・押下・指・キー・距離を、区分に振り分けて数えるだけにする。
 */

export const BAND_QUANTITY_IDS = ['distance', 'action', 'presses', 'hand', 'row', 'fingerPresses', 'fingerDistance'] as const;
export type BandQuantityId = (typeof BAND_QUANTITY_IDS)[number];

/**
 * 距離の区分の境目 [u]。1キー分の距離の半分の刻みで、どの物理配列でも同じ値を使う。
 * 距離 `d` は、`d < 0.5`、`0.5 ≤ d < 1.5`、`1.5 ≤ d < 2.5`、`2.5 ≤ d` の4つに分かれる。境目ちょうどの値は上の区分に入る。
 */
export const DISTANCE_BAND_EDGES = [0.5, 1.5, 2.5] as const;

/** 量ごとの区分の数。 */
export const BAND_COUNT_OF: Readonly<Record<BandQuantityId, number>> = {
  distance: DISTANCE_BAND_EDGES.length + 1,
  action: 4,
  presses: 3,
  hand: 4,
  row: 5,
  fingerPresses: ALL_FINGERS.length,
  fingerDistance: ALL_FINGERS.length,
};

/** 段の区分の番号。数字段・上段・中段・下段の4つは `Key.row` の0〜3で、親指が押したキーは4に入れる。 */
export const ROW_BAND_THUMB = 4;

/** 距離 `d` [u] の区分の番号（0が最も小さい区分）。 */
export function distanceBandOf(distance: number): number {
  let band = 0;
  for (const edge of DISTANCE_BAND_EDGES) if (distance >= edge) band++;
  return band;
}

/** 打ち方の区分の番号。単打0・同時押し1・2アクション2・3アクション以上3。 */
export function actionBandOf(steps: number, presses: number): number {
  if (steps >= 3) return 3;
  if (steps === 2) return 2;
  return presses >= 2 ? 1 : 0;
}

/** 押下数の区分の番号。1キー0・2キー1・3キー以上2。 */
export function pressesBandOf(presses: number): number {
  return Math.min(Math.max(presses, 1), 3) - 1;
}

/**
 * 手の区分の番号。左手0・両手順次1・両手同時2・右手3。
 * `left` と `right` は、打鍵のまとまりの押下に左手・右手の指があるか。`simultaneous` は、1つのステップの中に左右両方の手の押下があるか。
 */
export function handBandOf(left: boolean, right: boolean, simultaneous: boolean): number {
  if (left && right) return simultaneous ? 2 : 1;
  return right ? 3 : 0;
}

/** 押下の段の区分の番号。親指が押したキーは親指、それ以外はキーの段（物理配列が4段より多い時は下段に寄せる）。 */
export function rowBandOf(finger: Finger, key: Pick<Key, 'row'>): number {
  if (finger === 'LT' || finger === 'RT') return ROW_BAND_THUMB;
  return Math.min(Math.max(key.row, 0), ROW_BAND_THUMB - 1);
}

/** 指が左手のものか。親指は、その親指の手に数える。 */
export function isLeftFinger(finger: Finger): boolean {
  return finger.startsWith('L');
}

// ---------------------------------------------------------------------------
// 打鍵のまとまり
// ---------------------------------------------------------------------------

/** 数え上げが読むステップの部分。 */
export type CountedPress = Pick<Press, 'finger' | 'distance'> & { readonly keys: readonly Pick<Key, 'row'>[] };
export type CountedStroke = Pick<Stroke, 'kanaStart' | 'kanaEnd'> & { readonly presses: readonly CountedPress[] };

/**
 * 打鍵のまとまり。覆うかなの範囲 `[start, end]`（両端を含む）と、それを打つステップ `strokes[from, to)`。
 * ステップを順に見て、`kanaStart` から `kanaEnd` の範囲が前のまとまりの範囲と重なるステップは前のまとまりに入れ、
 * 重ならないステップから新しいまとまりを始める。`Stroke.inputIndex` の組とは別の分け方で、範囲の重なりだけで決める。
 * 確定の打鍵（`Stroke.commit`）も、他のステップと同じく範囲の重なりで入れる。
 */
export interface StrokeGroup {
  readonly start: number;
  readonly end: number;
  readonly from: number;
  readonly to: number;
}

export function strokeGroups(strokes: readonly CountedStroke[], inputChars: number): readonly StrokeGroup[] {
  const groups: StrokeGroup[] = [];
  const last = inputChars - 1;
  let current: { start: number; end: number; from: number } | undefined;
  strokes.forEach((stroke, index) => {
    // 範囲外の値は端の文字に寄せる（`SpanIndex` と同じ）
    const start = Math.min(Math.max(0, stroke.kanaStart), last);
    const end = Math.min(Math.max(start, stroke.kanaEnd), last);
    if (current !== undefined && start <= current.end && end >= current.start) {
      current.start = Math.min(current.start, start);
      current.end = Math.max(current.end, end);
      return;
    }
    if (current !== undefined) groups.push({ ...current, to: index });
    current = { start, end, from: index };
  });
  if (current !== undefined) groups.push({ ...current, to: strokes.length });
  return groups;
}

// ---------------------------------------------------------------------------
// 数え上げ
// ---------------------------------------------------------------------------

export interface BandQuantityCounts {
  /** 区分ごとの標本の量（距離・打ち方・押下数・手は数えたかなの数、段・指ごとの押下は押下の数、指ごとの移動距離は移動距離 [u]） */
  readonly counts: readonly number[];
  /** 割合の分母。`counts` の和 */
  readonly total: number;
}

export interface BandCounts {
  readonly byQuantity: Readonly<Record<BandQuantityId, BandQuantityCounts>>;
  /** 打てない文字の数（数えていない） */
  readonly skipped: number;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * 7つの量を一度に数える。打てない文字（`Trace.skippedPositions`）を1つでも覆う打鍵のまとまりは、かなもステップも数えない。
 * ローマ字入力で一部の英字だけ打てたかなは、打てなかった英字の分の値を持たないため。
 */
export function countBandQuantities(strokes: readonly CountedStroke[], inputChars: number, skippedPositions: readonly number[]): BandCounts {
  const skippedSet = new Set(skippedPositions.filter((position) => position >= 0 && position < inputChars));
  const counts = {
    distance: new Array<number>(BAND_COUNT_OF.distance).fill(0),
    action: new Array<number>(BAND_COUNT_OF.action).fill(0),
    presses: new Array<number>(BAND_COUNT_OF.presses).fill(0),
    hand: new Array<number>(BAND_COUNT_OF.hand).fill(0),
    row: new Array<number>(BAND_COUNT_OF.row).fill(0),
    fingerPresses: new Array<number>(BAND_COUNT_OF.fingerPresses).fill(0),
    fingerDistance: new Array<number>(BAND_COUNT_OF.fingerDistance).fill(0),
  };
  const fingerIndex = new Map<Finger, number>(ALL_FINGERS.map((finger, index) => [finger, index]));
  for (const group of strokeGroups(strokes, inputChars)) {
    let skippedInGroup = false;
    for (let position = group.start; position <= group.end; position++) {
      if (skippedSet.has(position)) {
        skippedInGroup = true;
        break;
      }
    }
    if (skippedInGroup) continue;

    const kanaCount = group.end - group.start + 1;
    let distance = 0;
    let pressCount = 0;
    let left = false;
    let right = false;
    let simultaneous = false;
    for (let index = group.from; index < group.to; index++) {
      let strokeLeft = false;
      let strokeRight = false;
      for (const press of strokes[index]!.presses) {
        distance += press.distance;
        pressCount += press.keys.length;
        if (isLeftFinger(press.finger)) strokeLeft = true;
        else strokeRight = true;
        const finger = fingerIndex.get(press.finger)!;
        counts.fingerDistance[finger]! += press.distance;
        for (const key of press.keys) {
          counts.fingerPresses[finger]!++;
          counts.row[rowBandOf(press.finger, key)]!++;
        }
      }
      if (strokeLeft && strokeRight) simultaneous = true;
      left ||= strokeLeft;
      right ||= strokeRight;
    }
    const steps = group.to - group.from;
    counts.distance[distanceBandOf(distance / kanaCount)]! += kanaCount;
    counts.action[actionBandOf(steps, pressCount)]! += kanaCount;
    counts.presses[pressesBandOf(pressCount)]! += kanaCount;
    if (left || right) counts.hand[handBandOf(left, right, simultaneous)]! += kanaCount;
  }
  const summarize = (values: number[]): BandQuantityCounts => ({ counts: values, total: sum(values) });
  const byQuantity: Record<BandQuantityId, BandQuantityCounts> = {
    distance: summarize(counts.distance),
    action: summarize(counts.action),
    presses: summarize(counts.presses),
    hand: summarize(counts.hand),
    row: summarize(counts.row),
    fingerPresses: summarize(counts.fingerPresses),
    fingerDistance: summarize(counts.fingerDistance),
  };
  return { byQuantity, skipped: skippedSet.size };
}

export function traceBandCounts(trace: Pick<Trace, 'strokes' | 'inputChars' | 'skippedPositions'>): BandCounts {
  return countBandQuantities(trace.strokes, trace.inputChars, trace.skippedPositions);
}

/** 区分ごとの割合（0〜1）。分母が0なら `undefined`（0として扱わない）。 */
export function bandShares(counted: BandQuantityCounts): readonly number[] | undefined {
  return counted.total <= 0 ? undefined : counted.counts.map((count) => count / counted.total);
}

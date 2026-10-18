import { resolveKeyId } from '#input/shapes/geometry.ts';
import type { Stroke, Trace } from '#trace/generate.ts';

/**
 * Bigramの組の種類数（仕様 §11.12）。
 *
 * Traceの隣り合うStrokeをそのまま組にせず、文字を出さないStroke（前置・後置シフトなど、層の操作のトリガーだけのStroke）を
 * 文字を出すStrokeに束ねて1打にしてから、隣り合う2打の異なる組を数える。Traceと他の指標は変えない。
 */
export interface BigramCombinationCounts {
  /** 物理キーの要素（文字を出したキーの集合）で数えた、異なる組の数 */
  readonly physical: number;
  /** シフトを含む要素（文字を出したキーの集合とトリガーのキーの集合）で数えた、異なる組の数 */
  readonly withTriggers: number;
}

/** 束ねた後の1打。キーはキーのidで持つ。 */
interface Hit {
  readonly outputKeys: Set<string>;
  readonly triggerKeys: Set<string>;
}

const emitsChar = (stroke: Stroke): boolean => stroke.participations.some((participation) => participation.roles.includes('output'));

/**
 * 1本の指が文字を出すキーとトリガーのキーを同時に押す参加があるので、役はキーごとに分ける。
 * Strokeの `triggerKeys` に挙がったキーはトリガー、それ以外は参加の役が文字を出すならそのキー、そうでなければ（押しっぱなしのトリガーだけ）トリガーとして数える。
 */
function addKeys(hit: Hit, stroke: Stroke): void {
  const triggers = new Set(stroke.triggerKeys.map(resolveKeyId));
  for (const participation of stroke.participations) {
    const emits = participation.roles.includes('output');
    for (const key of participation.keys) {
      const isOutput = emits && !triggers.has(key.id);
      (isOutput ? hit.outputKeys : hit.triggerKeys).add(key.id);
    }
  }
}

/** `from` より後ろに、同じ入力の選択の中で文字を出すStrokeがあるか。 */
function hasLaterOutputInSelection(strokes: readonly Stroke[], from: number): boolean {
  const { selectionIndex } = strokes[from];
  for (let i = from + 1; i < strokes.length && strokes[i].selectionIndex === selectionIndex; i++) {
    if (emitsChar(strokes[i])) return true;
  }
  return false;
}

/**
 * Traceのstroke列を1打の列にする。文字を出さないStrokeは、同じ入力の選択の中に後から文字を出すStrokeがあれば
 * その最初のものに（前置）、無ければ直前の文字を出すStrokeに（後置）束ねる。束ね先が無ければ単独で1打にする。
 */
function bundleHits(strokes: readonly Stroke[]): Hit[] {
  const hits: Hit[] = [];
  const newHit = (): Hit => ({ outputKeys: new Set(), triggerKeys: new Set() });
  let pending: Hit | undefined;
  let last: { hit: Hit; selectionIndex: number } | undefined;

  strokes.forEach((stroke, i) => {
    if (emitsChar(stroke)) {
      const hit = pending ?? newHit();
      pending = undefined;
      addKeys(hit, stroke);
      hits.push(hit);
      last = { hit, selectionIndex: stroke.selectionIndex };
    } else if (hasLaterOutputInSelection(strokes, i)) {
      pending ??= newHit();
      addKeys(pending, stroke);
    } else if (last !== undefined && last.selectionIndex === stroke.selectionIndex) {
      addKeys(last.hit, stroke);
    } else {
      const hit = newHit();
      addKeys(hit, stroke);
      hits.push(hit);
    }
  });
  return hits;
}

const sortedKey = (keys: ReadonlySet<string>): string => [...keys].sort().join('+');

export function countBigramCombinations(trace: Trace): BigramCombinationCounts {
  const hits = bundleHits(trace.strokes);
  const physical = new Set<string>();
  const withTriggers = new Set<string>();
  const physicalOf = hits.map((hit) => sortedKey(hit.outputKeys));
  const logicalOf = hits.map((hit) => `${sortedKey(hit.outputKeys)}|${sortedKey(hit.triggerKeys)}`);
  for (let i = 1; i < hits.length; i++) {
    physical.add(`${physicalOf[i - 1]}>${physicalOf[i]}`);
    withTriggers.add(`${logicalOf[i - 1]}>${logicalOf[i]}`);
  }
  return { physical: physical.size, withTriggers: withTriggers.size };
}

import type { Stroke } from '#trace/generate.ts';
import { textCoverage } from './text-coverage.ts';

/**
 * 文節の区切りの待機（`spec/playback-timing.md` §3.9）。
 * 評価に渡すテキストの文節の区切りから、ステップの間ごとに足す待機の時間を決める。
 * 打鍵の時間・構造解析は参照しない。
 */

export const BUNSETSU_WAIT_MS_MIN = 0;
export const BUNSETSU_WAIT_MS_MAX = 10000;

export interface BunsetsuWaitPlan {
  /**
   * ステップの間ごとの待機 [ミリ秒]。長さはステップ数+1で、`gapMs[i]` はステップ`i`の前、
   * 最後の要素は最後のステップの後。待機が無い間は0。
   */
  readonly gapMs: readonly number[];
  /** 待機を足す位置（区切り）が1つ以上あるか。画面が既定と違う設定を示す判定に使う */
  readonly hasBoundary: boolean;
}

type StrokeRange = Pick<Stroke, 'kanaStart' | 'kanaEnd'>;

/**
 * 待機を足す位置を決める。`textLength`は評価に渡したテキストの文字数、`boundaries`はその文字位置の区切り
 * （位置`b`の文字が次の文節の最初の文字。0と末尾を含まない）。
 * `boundaries`が`undefined`（区切りを受け取っていない）か`waitMs`が0の時は何も足さない。
 * 配列がその文字を打てるかには依らず、打てない文字の位置にはテキストのその位置に足す。
 */
export function planBunsetsuWaits(
  textLength: number,
  strokes: readonly StrokeRange[],
  boundaries: readonly number[] | undefined,
  waitMs: number,
): BunsetsuWaitPlan {
  const gapMs = new Array<number>(strokes.length + 1).fill(0);
  if (boundaries === undefined || waitMs <= 0) return { gapMs, hasBoundary: false };
  const { firstCovering, nextStarting } = textCoverage(textLength, strokes);
  let hasBoundary = false;
  for (const at of new Set(boundaries)) {
    if (!Number.isInteger(at) || at <= 0 || at >= textLength) continue;
    hasBoundary = true;
    gapMs[firstCovering[at] >= 0 ? firstCovering[at] : nextStarting[at]] += waitMs;
  }
  return { gapMs, hasBoundary };
}

/** 同じ長さの待機の列を、間ごとに合計する（連続する2つのステップの間に足す待機は、すべて合計して1つの間として扱う）。 */
export function sumWaitGaps(first: readonly number[], second: readonly number[]): number[] {
  return first.map((ms, index) => ms + (second[index] ?? 0));
}

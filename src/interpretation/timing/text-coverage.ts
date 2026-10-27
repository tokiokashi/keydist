import type { Stroke } from '#trace/generate.ts';

/**
 * 待機（`spec/playback-timing.md` §3.9）を足す位置を、テキストの文字位置から求めるための、文字とステップの対応。
 * 読点・句点の待機と文節の区切りの待機が同じ規則で位置を決めるので、ここに1つだけ置く。
 */

type StrokeRange = Pick<Stroke, 'kanaStart' | 'kanaEnd'>;

export interface TextCoverage {
  /** 文字ごとに、その文字を覆う最初のステップ。覆うステップが無い文字は-1 */
  readonly firstCovering: readonly number[];
  /** 文字ごとに、その文字を覆う最後のステップ。覆うステップが無い文字は-1 */
  readonly lastCovering: readonly number[];
  /**
   * 文字の位置より後ろで最初に始まるステップ。無ければステップ数（最後のステップの後）。
   * 文字を覆うステップが無い時に、待機をテキストのその位置（直前の入力単位と直後の入力単位の間）へ置くために使う
   */
  readonly nextStarting: readonly number[];
}

export function textCoverage(charCount: number, strokes: readonly StrokeRange[]): TextCoverage {
  const firstCovering = new Array<number>(charCount).fill(-1);
  const lastCovering = new Array<number>(charCount).fill(-1);
  const firstStartingAt = new Array<number>(charCount).fill(-1);
  for (const [index, stroke] of strokes.entries()) {
    const from = Math.max(0, stroke.kanaStart);
    const to = Math.min(charCount - 1, stroke.kanaEnd);
    if (from < charCount && firstStartingAt[from] < 0) firstStartingAt[from] = index;
    for (let at = from; at <= to; at++) {
      if (firstCovering[at] < 0) firstCovering[at] = index;
      lastCovering[at] = index;
    }
  }
  const nextStarting = new Array<number>(charCount).fill(strokes.length);
  let next = strokes.length;
  for (let at = charCount - 1; at >= 0; at--) {
    nextStarting[at] = next;
    if (firstStartingAt[at] >= 0) next = Math.min(next, firstStartingAt[at]);
  }
  return { firstCovering, lastCovering, nextStarting };
}

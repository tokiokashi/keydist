import type { Stroke } from '#trace/generate.ts';

/**
 * 読点・句点の前後の待機（`spec/playback-timing.md` §3.9）。
 * 評価に渡すテキストの読点・句点から、ステップの間ごとに足す待機の時間を決める。
 * 打鍵の時間・構造解析は参照しない。
 */

/** 読点・句点の前後の待機 [ミリ秒]。 */
export interface PunctuationWaitMs {
  readonly commaBeforeMs: number;
  readonly commaAfterMs: number;
  readonly periodBeforeMs: number;
  readonly periodAfterMs: number;
}

export const PUNCTUATION_WAIT_MS_MIN = 0;
export const PUNCTUATION_WAIT_MS_MAX = 10000;

export const NO_PUNCTUATION_WAIT: PunctuationWaitMs = {
  commaBeforeMs: 0,
  commaAfterMs: 0,
  periodBeforeMs: 0,
  periodAfterMs: 0,
};

/** 待機の対象の読点・句点。文章を打つ測定で数えない文字の集合（§6.4）とは別の集合として持つ。 */
const COMMA_CHARS: ReadonlySet<string> = new Set(['、', '，', ',']);
const PERIOD_CHARS: ReadonlySet<string> = new Set(['。', '．', '.']);

/** 待機の4項目それぞれが、0でなく、かつテキストに足す位置を持つか。画面が既定と違う設定を示す判定に使う。 */
export type PunctuationWaitUse = { readonly [K in keyof PunctuationWaitMs]: boolean };

export interface PunctuationWaitPlan {
  /**
   * ステップの間ごとの待機の合計 [ミリ秒]。長さはステップ数+1で、`gapMs[i]` はステップ`i`の前、
   * 最後の要素は最後のステップの後。待機が無い間は0。
   */
  readonly gapMs: readonly number[];
  readonly use: PunctuationWaitUse;
}

type StrokeRange = Pick<Stroke, 'kanaStart' | 'kanaEnd'>;

/**
 * 待機を足す位置を決める。`text`は評価に渡したテキスト、`strokes`はそのTraceの打鍵。
 * `applies`が偽（日本語でないテキスト）の時は何も足さない。
 * 配列がその文字を打てるかには依らず、打てない文字はテキストの位置に前後の待機を続けて足す。
 */
export function planPunctuationWaits(text: string, strokes: readonly StrokeRange[], waits: PunctuationWaitMs, applies: boolean): PunctuationWaitPlan {
  const gapMs = new Array<number>(strokes.length + 1).fill(0);
  const use = { commaBeforeMs: false, commaAfterMs: false, periodBeforeMs: false, periodAfterMs: false };
  if (!applies) return { gapMs, use };

  const chars = [...text];
  // 文字ごとに、それを覆う最初と最後のステップ。覆うステップが無い文字は、後ろで最初に始まるステップの前に置く
  const firstCovering = new Array<number>(chars.length).fill(-1);
  const lastCovering = new Array<number>(chars.length).fill(-1);
  const firstStartingAt = new Array<number>(chars.length).fill(-1);
  for (const [index, stroke] of strokes.entries()) {
    const from = Math.max(0, stroke.kanaStart);
    const to = Math.min(chars.length - 1, stroke.kanaEnd);
    if (from < chars.length && firstStartingAt[from] < 0) firstStartingAt[from] = index;
    for (let at = from; at <= to; at++) {
      if (firstCovering[at] < 0) firstCovering[at] = index;
      lastCovering[at] = index;
    }
  }
  // 文字の位置より後ろで最初に始まるステップ。無ければステップ数（最後のステップの後）
  const nextStarting = new Array<number>(chars.length).fill(strokes.length);
  let next = strokes.length;
  for (let at = chars.length - 1; at >= 0; at--) {
    nextStarting[at] = next;
    if (firstStartingAt[at] >= 0) next = Math.min(next, firstStartingAt[at]);
  }

  for (const [at, char] of chars.entries()) {
    const kind = COMMA_CHARS.has(char) ? 'comma' : PERIOD_CHARS.has(char) ? 'period' : undefined;
    if (kind === undefined) continue;
    const beforeKey = kind === 'comma' ? 'commaBeforeMs' : 'periodBeforeMs';
    const afterKey = kind === 'comma' ? 'commaAfterMs' : 'periodAfterMs';
    const before = waits[beforeKey];
    const after = waits[afterKey];
    if (before > 0) use[beforeKey] = true;
    if (after > 0) use[afterKey] = true;
    if (firstCovering[at] >= 0) {
      gapMs[firstCovering[at]] += before;
      gapMs[lastCovering[at] + 1] += after;
    } else {
      gapMs[nextStarting[at]] += before + after;
    }
  }
  return { gapMs, use };
}

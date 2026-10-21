import type { Trace } from '#trace/generate.ts';

/**
 * テキストの任意の文字範囲について、指標の分子と分母を返す集計（定義は `docs/span-metrics.md`）。
 *
 * 距離モデルの値は変えない。`computeTraceScalars` と同じ分子・分母の定義を、文字範囲に区切って足し直すだけにする。
 * テキストを重ならない範囲に分けて分子と分母をそれぞれ足すと、全体の分子と分母に戻る。
 *
 * 範囲は評価に渡したテキストの文字位置の半開区間 `[from, to)`。文字位置は `Stroke.kanaStart` と同じ数え方で、
 * 打鍵できなかった文字も1文字に数える。
 */

/** 範囲で集計できる指標。どれも「範囲の分子の和 / 範囲の分母の和」で書け、全範囲を合わせると全体の値に戻る。 */
export const SPAN_METRIC_IDS = ['perCharUnits', 'meanPerStroke', 'sameFingerRate', 'perCharSteps'] as const;
export type SpanMetricId = (typeof SPAN_METRIC_IDS)[number];

type Numerator = 'distance' | 'steps' | 'sameFinger';
type Denominator = 'chars' | 'strokes';

/**
 * 指標ごとの分子と分母。
 * - `perCharUnits`: ステップの距離の和 / 文字数（`computeTraceScalars` の `totalUnits / inputChars`）
 * - `perCharSteps`: ステップ数 / 文字数（`actions / inputChars`）
 * - `meanPerStroke`: ステップの距離の和 / ステップ数（`totalUnits / strokes`）
 * - `sameFingerRate`: 同指の押下の数 / ステップ数（`sameFinger / strokes`。割合のまま持ち、%への換算は表示が行う）
 */
const SPAN_METRIC_DEFS: Readonly<Record<SpanMetricId, { readonly numerator: Numerator; readonly denominator: Denominator }>> = {
  perCharUnits: { numerator: 'distance', denominator: 'chars' },
  meanPerStroke: { numerator: 'distance', denominator: 'strokes' },
  sameFingerRate: { numerator: 'sameFinger', denominator: 'strokes' },
  perCharSteps: { numerator: 'steps', denominator: 'chars' },
};

/** 分母が文字数の指標か（そうでなければステップ数）。 */
export function isPerCharMetric(metric: SpanMetricId): boolean {
  return SPAN_METRIC_DEFS[metric].denominator === 'chars';
}

/**
 * Traceを範囲で集計するための索引。ステップは `kanaEnd` の文字位置に帰属させる。
 * 区間の境目をまたぐ入力は `kanaEnd` を含む範囲にだけ入り、ローマ字配列で別の選択どうしの
 * `kanaStart` から `kanaEnd` が重なっても、各ステップは1か所にしか入らないので二重に数えない。
 * 文字位置ごとの累積和を持つので、範囲の集計は範囲の長さによらず一定の時間で求まる。
 */
export interface SpanIndex {
  readonly inputChars: number;
  readonly strokeCount: number;
  /** 文字位置ごとに帰属したステップの距離の和（長さ `inputChars`） */
  readonly distanceAt: Float64Array;
  readonly stepsAt: Float64Array;
  readonly sameFingerAt: Float64Array;
  /** `[0, i)` の累積和（長さ `inputChars + 1`） */
  readonly distanceUpTo: Float64Array;
  readonly stepsUpTo: Float64Array;
  readonly sameFingerUpTo: Float64Array;
  /** ステップごとの値（長さ `strokeCount`）。打鍵の指標のばらつきに使う */
  readonly strokeDistance: Float64Array;
  readonly strokeSameFinger: Float64Array;
}

/** ステップの `kanaEnd` を文字位置の範囲 `[0, inputChars)` に収める。範囲外の値は端の文字へ帰属させる。 */
function charPositionOf(kanaEnd: number, inputChars: number): number {
  return Math.min(Math.max(0, kanaEnd), inputChars - 1);
}

function prefixSums(values: Float64Array): Float64Array {
  const sums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) sums[i + 1] = sums[i]! + values[i]!;
  return sums;
}

export function buildSpanIndex(trace: Trace): SpanIndex {
  const { inputChars } = trace;
  const strokeCount = trace.strokes.length;
  const distanceAt = new Float64Array(inputChars);
  const stepsAt = new Float64Array(inputChars);
  const sameFingerAt = new Float64Array(inputChars);
  const strokeDistance = new Float64Array(strokeCount);
  const strokeSameFinger = new Float64Array(strokeCount);
  trace.strokes.forEach((stroke, index) => {
    let sameFinger = 0;
    for (const press of stroke.presses) if (press.sfb) sameFinger++;
    strokeDistance[index] = stroke.distance;
    strokeSameFinger[index] = sameFinger;
    if (inputChars === 0) return;
    const at = charPositionOf(stroke.kanaEnd, inputChars);
    distanceAt[at] = distanceAt[at]! + stroke.distance;
    stepsAt[at] = stepsAt[at]! + 1;
    sameFingerAt[at] = sameFingerAt[at]! + sameFinger;
  });
  return {
    inputChars,
    strokeCount,
    distanceAt,
    stepsAt,
    sameFingerAt,
    distanceUpTo: prefixSums(distanceAt),
    stepsUpTo: prefixSums(stepsAt),
    sameFingerUpTo: prefixSums(sameFingerAt),
    strokeDistance,
    strokeSameFinger,
  };
}

export interface SpanTotals {
  readonly numerator: number;
  readonly denominator: number;
}

/** 範囲 `[from, to)` の分子と分母。範囲はテキストの両端に収める。 */
export function spanTotals(index: SpanIndex, metric: SpanMetricId, from: number, to: number): SpanTotals {
  const start = Math.min(Math.max(0, from), index.inputChars);
  const end = Math.min(Math.max(start, to), index.inputChars);
  const def = SPAN_METRIC_DEFS[metric];
  const upTo = def.numerator === 'distance' ? index.distanceUpTo : def.numerator === 'steps' ? index.stepsUpTo : index.sameFingerUpTo;
  const denominator = def.denominator === 'chars' ? end - start : index.stepsUpTo[end]! - index.stepsUpTo[start]!;
  return { numerator: upTo[end]! - upTo[start]!, denominator };
}

/** 分母が0の範囲は値が決まらないので `undefined`（0として扱わない）。 */
export function spanValue(totals: SpanTotals): number | undefined {
  return totals.denominator === 0 ? undefined : totals.numerator / totals.denominator;
}

/** テキスト全体の分子と分母。 */
export function wholeTotals(index: SpanIndex, metric: SpanMetricId): SpanTotals {
  return spanTotals(index, metric, 0, index.inputChars);
}

export interface SpanSpread {
  /** テキスト全体の値（中心線）。分母が0なら0 */
  readonly center: number;
  /** 分母1つあたりの分子のばらつき `s`（`s² = Σ(x_i − c)² / n`）。`n` は文字の指標なら文字数、打鍵の指標ならステップ数 */
  readonly deviation: number;
}

/**
 * 目安線の幅に使う、テキスト全体の中心と分母1つあたりのばらつき。
 * 文字の指標の `x_i` は文字位置 `i` に帰属した分子（打鍵できなかった文字では0）、
 * 打鍵の指標の `x_i` はステップ `i` の分子。
 */
export function spanSpread(index: SpanIndex, metric: SpanMetricId): SpanSpread {
  const def = SPAN_METRIC_DEFS[metric];
  let values: Float64Array;
  if (def.denominator === 'chars') {
    values = def.numerator === 'distance' ? index.distanceAt : def.numerator === 'steps' ? index.stepsAt : index.sameFingerAt;
  } else {
    values = def.numerator === 'distance' ? index.strokeDistance : index.strokeSameFinger;
  }
  const n = values.length;
  if (n === 0) return { center: 0, deviation: 0 };
  let sum = 0;
  for (const value of values) sum += value;
  const center = sum / n;
  let squares = 0;
  for (const value of values) squares += (value - center) ** 2;
  return { center, deviation: Math.sqrt(squares / n) };
}

/** 目安線の係数。中心線から上下に `GUIDE_SIGMA · s / √D` の位置に引く（`D` は範囲の分母）。 */
export const GUIDE_SIGMA = 3;

/** 目安線の幅を決める係数 `3·s`（`s` は `spanSpread` のばらつき）。 */
export function guideScaleOf(deviation: number): number {
  return GUIDE_SIGMA * deviation;
}

/** 分母 `D` の範囲に引く目安線の、中心線からの幅 `guideScale / √D`。分母が0の範囲には引かないので0。 */
export function guideHalfWidth(guideScale: number, denominator: number): number {
  return denominator <= 0 ? 0 : guideScale / Math.sqrt(denominator);
}

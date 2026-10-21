import { shuffledText, uniformText } from './control-texts.ts';
import { generateMarkovText, type MarkovChain } from './markov-text.ts';
import { median, quantileNearestRank, rankAmong, SEGMENT_SEED_COUNT, type RankAmongRandom } from './segments.ts';
import { spanTotals, spanValue, type SpanIndex, type SpanMetricId } from './span-metrics.ts';

/**
 * 文章の中の指標の変動が、かな3文字までの並びの統計で説明できるかを比べる（定義は `docs/kana-chain-comparison.md`）。
 * 元のテキスト、2次マルコフ連鎖の生成文、対照テキストを同じ指標で評価し、元のテキストの値が生成文の中で何番目かを出す。
 * 評価（Traceの生成）は呼び出し側が渡す関数で行う。距離モデルの値は変えない。
 */

/** 判定に使う指標。1文字あたりの距離。 */
export const CHAIN_METRIC: SpanMetricId = 'perCharUnits';
/** 区間の長さ [文字]。Run Chartの集計窓の既定と同じ値で固定する。 */
export const CHAIN_SPAN_LENGTH = 50;
/** 判定に使う分位点。補間しない最近順位。 */
export const CHAIN_QUANTILE = 0.9;
/** 候補が1つしか無かった段の割合の上限。超えたら判定を出さない。 */
export const CHAIN_SINGLE_RATIO_LIMIT = 0.1;
/** 生成文と対照テキストの数。種は始まりの値から連続する。 */
export const CHAIN_SEED_COUNT = SEGMENT_SEED_COUNT;

/** 重ならない固定長の区間。 */
export interface FixedSpan {
  readonly from: number;
  readonly to: number;
  /** 指定の長さに満たない末尾の区間なら `false` */
  readonly full: boolean;
}

/** テキストを先頭から `length` 文字ずつに区切る。最後に残った `length` 文字に満たない区間も `full: false` で含める。 */
export function fixedSpans(total: number, length: number): FixedSpan[] {
  const spans: FixedSpan[] = [];
  for (let from = 0; from < total; from += length) {
    const to = Math.min(total, from + length);
    spans.push({ from, to, full: to - from === length });
  }
  return spans;
}

/** 末尾の `length` 文字に満たない区間を除いた、区間ごとの値（値が決まらない区間は除く）。小さい順。 */
export function fullSpanValues(index: SpanIndex, metric: SpanMetricId, length: number): Float64Array {
  const values: number[] = [];
  for (const span of fixedSpans(index.inputChars, length)) {
    if (!span.full) continue;
    const value = spanValue(spanTotals(index, metric, span.from, span.to));
    if (value !== undefined) values.push(value);
  }
  return Float64Array.from(values).sort();
}

/** 1つのテキストの、区間ごとの値の量。 */
export interface SpanQuantities {
  /** 値が決まった区間の数 */
  readonly count: number;
  readonly p90: number | undefined;
  readonly median: number | undefined;
  readonly max: number | undefined;
}

export function spanQuantities(index: SpanIndex, metric: SpanMetricId, length: number): SpanQuantities {
  const sorted = fullSpanValues(index, metric, length);
  return {
    count: sorted.length,
    p90: quantileNearestRank(sorted, CHAIN_QUANTILE),
    median: median(sorted),
    max: sorted[sorted.length - 1],
  };
}

/** 生成文20個を合わせた、連鎖の統計が足りているかの量。 */
export interface ChainSupport {
  readonly steps: number;
  readonly singleCandidateSteps: number;
  /** `singleCandidateSteps / steps`。段が無ければ `undefined` */
  readonly singleRatio: number | undefined;
  readonly continuedByLastChar: number;
  readonly continuedFromWhole: number;
}

export type ChainVerdict =
  /** 元の値が生成文のどれよりも厳密に大きいか小さい */
  | { readonly kind: 'unexplained'; readonly side: 'lowest' | 'highest' }
  | { readonly kind: 'not-ruled-out' }
  /** 判定を出さない。候補が1つしか無かった段の割合が上限を超えた、または区間の値が決まらない */
  | { readonly kind: 'withheld'; readonly reason: 'single-ratio' | 'no-span' }
  /** 判定の対象でないテキスト（コーパスから抜き出したテキスト以外） */
  | { readonly kind: 'not-judged' };

export interface ChainComparisonInput {
  /** 評価に渡すテキスト（前処理の後） */
  readonly text: string;
  readonly chain: MarkovChain;
  /** 評価に渡すテキストを評価して、文字位置ごとの索引を返す */
  readonly evaluate: (text: string) => SpanIndex;
  /** 生成文と対照テキストの種の始まりの値 `s`。種は `s, s+1, …, s+19` */
  readonly seedStart: number;
  /** 判定を出すか。コーパスから抜き出したテキストだけ `true` にする */
  readonly judge: boolean;
  readonly spanLength?: number;
  readonly singleRatioLimit?: number;
}

export interface ChainComparison {
  readonly textChars: number;
  readonly seeds: readonly number[];
  readonly spanLength: number;
  readonly singleRatioLimit: number;
  readonly original: SpanQuantities;
  readonly generated: readonly SpanQuantities[];
  readonly shuffled: readonly SpanQuantities[];
  readonly uniform: readonly SpanQuantities[];
  readonly support: ChainSupport;
  /** 90%点の、元の値の生成文20個と合わせた21個の中の順位。判定を出さない時も、値が決まれば付ける */
  readonly rank: RankAmongRandom | undefined;
  readonly verdict: ChainVerdict;
}

/**
 * 元のテキストと同じ文字数・同じ最初の2文字の生成文を、種ごとに作る。
 * 統計が足りているかの量は、生成文を合わせた全部の段で数える。
 */
export function generateFromChain(chain: MarkovChain, text: string, seeds: readonly number[]): { texts: string[]; support: ChainSupport } {
  const chars = [...text];
  const start = chars.slice(0, 2).join('');
  let steps = 0;
  let singleCandidateSteps = 0;
  let continuedByLastChar = 0;
  let continuedFromWhole = 0;
  const texts = seeds.map((seed) => {
    const result = generateMarkovText(chain, start, chars.length, seed);
    steps += result.steps;
    singleCandidateSteps += result.singleCandidateSteps;
    continuedByLastChar += result.continuedByLastChar;
    continuedFromWhole += result.continuedFromWhole;
    return result.text;
  });
  return {
    texts,
    support: {
      steps,
      singleCandidateSteps,
      singleRatio: steps === 0 ? undefined : singleCandidateSteps / steps,
      continuedByLastChar,
      continuedFromWhole,
    },
  };
}

/** 順位から判定を決める。 */
export function verdictOf(rank: RankAmongRandom | undefined, support: ChainSupport, judge: boolean, singleRatioLimit: number): ChainVerdict {
  if (!judge) return { kind: 'not-judged' };
  if (support.singleRatio === undefined || support.singleRatio > singleRatioLimit) return { kind: 'withheld', reason: 'single-ratio' };
  if (rank === undefined) return { kind: 'withheld', reason: 'no-span' };
  return rank.extreme === null ? { kind: 'not-ruled-out' } : { kind: 'unexplained', side: rank.extreme };
}

/**
 * 元のテキスト、生成文20個、対照テキスト（順序破壊・一様ランダム）20個ずつを評価し、区間の値の量と順位・判定を返す。
 * 生成文と対照テキストの種は同じ `seedStart` から連続する。
 */
export function compareWithChain(input: ChainComparisonInput): ChainComparison {
  const spanLength = input.spanLength ?? CHAIN_SPAN_LENGTH;
  const singleRatioLimit = input.singleRatioLimit ?? CHAIN_SINGLE_RATIO_LIMIT;
  const chars = [...input.text];
  const seeds = Array.from({ length: CHAIN_SEED_COUNT }, (_, offset) => input.seedStart + offset);
  const quantitiesOf = (text: string): SpanQuantities => spanQuantities(input.evaluate(text), CHAIN_METRIC, spanLength);

  const original = quantitiesOf(input.text);
  const { texts, support } = generateFromChain(input.chain, input.text, seeds);
  const generated = texts.map(quantitiesOf);
  const shuffled = seeds.map((seed) => quantitiesOf(shuffledText(input.text, seed).text));
  const uniform = seeds.map((seed) => quantitiesOf(uniformText(input.text, seed).text));

  const generatedP90 = generated.map((quantities) => quantities.p90);
  const rank =
    original.p90 === undefined || generatedP90.some((value) => value === undefined) ? undefined : rankAmong(original.p90, generatedP90 as number[]);
  return {
    textChars: chars.length,
    seeds,
    spanLength,
    singleRatioLimit,
    original,
    generated,
    shuffled,
    uniform,
    support,
    rank,
    verdict: verdictOf(rank, support, input.judge, singleRatioLimit),
  };
}

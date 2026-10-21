import { createMulberry32 } from './prng.ts';
import { SPAN_METRIC_IDS, spanTotals, spanValue, type SpanIndex, type SpanMetricId } from './span-metrics.ts';

/**
 * テキストを区間に区切り、区間ごとの値と区切りの前後の値を求める（定義は `docs/segment-metrics.md`）。
 * 距離モデルの値は変えない。区間の集計は `span-metrics.ts` の `spanTotals` をそのまま使う。
 *
 * 区切りは、評価に渡したテキストの文字位置の昇順の列（0とテキストの長さを含まない）。位置 `b` の区切りは、
 * 文字 `b − 1` と文字 `b` の間を指し、区間は `[0, b₁)`, `[b₁, b₂)`, …, `[bₖ, 末尾)` になる。
 * 区間はテキスト全体を重ならずに覆うので、区間ごとの分子と分母を足すと全体に戻る。
 */

/** ランダムな区切りの種の数。設定にしない。 */
export const SEGMENT_SEED_COUNT = 20;

/** 区間の長さの列。区切りが無ければテキスト全体の1区間。 */
export function segmentLengths(boundaries: readonly number[], total: number): number[] {
  const lengths: number[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    lengths.push(boundary - start);
    start = boundary;
  }
  lengths.push(total - start);
  return lengths;
}

/**
 * 固定長の区切り。文節の区間の長さの平均を丸めた長さで、テキストの先頭から区切る。
 * 最後の区間は残りの長さになる。区間が1つ以下の文節の区切りからは、固定長の区切りを作らない。
 */
export function fixedBoundaries(bunsetsu: readonly number[], total: number): number[] {
  if (bunsetsu.length === 0 || total <= 0) return [];
  const length = Math.max(1, Math.round(total / (bunsetsu.length + 1)));
  const boundaries: number[] = [];
  for (let position = length; position < total; position += length) boundaries.push(position);
  return boundaries;
}

/**
 * ランダムな区切り。文節の区間の長さの列を、種から作る乱数で並べ替え（Fisher-Yates）、その順に区切りを置く。
 * 区切りの数も区間の長さの分布も文節と同じになる。
 */
export function randomBoundaries(bunsetsu: readonly number[], total: number, seed: number): number[] {
  const lengths = segmentLengths(bunsetsu, total);
  const random = createMulberry32(seed);
  for (let i = lengths.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const held = lengths[i]!;
    lengths[i] = lengths[j]!;
    lengths[j] = held;
  }
  const boundaries: number[] = [];
  let position = 0;
  for (let i = 0; i < lengths.length - 1; i++) {
    position += lengths[i]!;
    boundaries.push(position);
  }
  return boundaries;
}

/** 区間ごとの値（値が決まらない区間は除く）を、小さい順に並べて返す。 */
export function segmentValues(index: SpanIndex, metric: SpanMetricId, boundaries: readonly number[]): Float64Array {
  const values = new Float64Array(boundaries.length + 1);
  let count = 0;
  let start = 0;
  for (let i = 0; i <= boundaries.length; i++) {
    const end = i < boundaries.length ? boundaries[i]! : index.inputChars;
    const value = spanValue(spanTotals(index, metric, start, end));
    if (value !== undefined) values[count++] = value;
    start = end;
  }
  // 型付き配列の並べ替えは数値の昇順
  return values.subarray(0, count).sort();
}

/** 補間しない分位点（小さい方から `⌈qn⌉` 番目の値）。`values` は昇順。空なら `undefined`。 */
export function quantileNearestRank(sorted: ArrayLike<number>, q: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)));
  return sorted[rank - 1];
}

/** 中央値。個数が偶数の時は、中央の2つの平均。 */
export function median(sorted: ArrayLike<number>): number | undefined {
  if (sorted.length === 0) return undefined;
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export interface SegmentMetricStats {
  /** 値が決まった区間の数 */
  readonly count: number;
  readonly median: number | undefined;
  /** 区間ごとの値の90%点（補間しない） */
  readonly p90: number | undefined;
  readonly max: number | undefined;
  /** 全区切りの直前の1文字（前の区間の最後の文字）に帰属したステップの値。分子の和 / 分母の和 */
  readonly before: number | undefined;
  /** 全区切りの直後の1文字（次の区間の最初の文字）に帰属したステップの値。分子の和 / 分母の和 */
  readonly after: number | undefined;
}

export interface SegmentStats {
  readonly segmentCount: number;
  readonly byMetric: Readonly<Record<SpanMetricId, SegmentMetricStats>>;
}

/** 全区切りについて、1文字の範囲 `[at, at + 1)` の分子と分母を足した値。 */
function boundaryCharValue(index: SpanIndex, metric: SpanMetricId, boundaries: readonly number[], offset: number): number | undefined {
  let numerator = 0;
  let denominator = 0;
  for (const boundary of boundaries) {
    const at = boundary + offset;
    const totals = spanTotals(index, metric, at, at + 1);
    numerator += totals.numerator;
    denominator += totals.denominator;
  }
  return denominator === 0 ? undefined : numerator / denominator;
}

export function segmentStats(index: SpanIndex, boundaries: readonly number[]): SegmentStats {
  const byMetric = {} as Record<SpanMetricId, SegmentMetricStats>;
  for (const metric of SPAN_METRIC_IDS) {
    const sorted = segmentValues(index, metric, boundaries);
    byMetric[metric] = {
      count: sorted.length,
      median: median(sorted),
      p90: quantileNearestRank(sorted, 0.9),
      max: sorted[sorted.length - 1],
      before: boundaryCharValue(index, metric, boundaries, -1),
      after: boundaryCharValue(index, metric, boundaries, 0),
    };
  }
  return { segmentCount: boundaries.length + 1, byMetric };
}

/** 文節の値が、ランダムの値と合わせた中で何番目か。 */
export interface RankAmongRandom {
  /** 同じ値を小さい方から数えた最初の順位（1から） */
  readonly low: number;
  /** 同じ値を数えた最後の順位。同点が無ければ `low` と同じ */
  readonly high: number;
  /** 順位を付けた値の総数（文節の1つ + ランダムの値） */
  readonly of: number;
  /** ランダムのどの値よりも厳密に小さい（`lowest`）か大きい（`highest`）時だけ、端に数える */
  readonly extreme: 'lowest' | 'highest' | null;
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * `value` を `others` と合わせて小さい方から並べた時の順位。同じ値がある時は幅で返す。
 * `others` に値が決まらないもの（`undefined`）は含めない。
 */
export function rankAmong(value: number, others: readonly number[]): RankAmongRandom {
  let smaller = 0;
  let equal = 0;
  for (const other of others) {
    if (sameValue(other, value)) equal++;
    else if (other < value) smaller++;
  }
  const larger = others.length - smaller - equal;
  return {
    low: smaller + 1,
    high: smaller + equal + 1,
    of: others.length + 1,
    extreme: smaller + equal === 0 ? 'lowest' : larger + equal === 0 ? 'highest' : null,
  };
}

/** 判定の順位を付ける量。どちらも1文字あたりの距離で求める。 */
export const SEGMENT_VERDICT_QUANTITIES = ['p90', 'after'] as const;
export type SegmentVerdictQuantity = (typeof SEGMENT_VERDICT_QUANTITIES)[number];

/** 判定の量を求める指標。 */
export const SEGMENT_VERDICT_METRIC: SpanMetricId = 'perCharUnits';

export interface SegmentationReport {
  readonly textChars: number;
  /** 固定長の区間の長さ [文字] */
  readonly fixedLength: number;
  /** ランダムの種（始まりの値から連続した `SEGMENT_SEED_COUNT` 個） */
  readonly seeds: readonly number[];
  readonly bunsetsu: SegmentStats;
  readonly fixed: SegmentStats;
  /** 種ごとの値（`seeds` と同じ並び） */
  readonly random: readonly SegmentStats[];
  /** 図に重ねる区切りの位置。ランダムは最初の種のもの */
  readonly overlay: {
    readonly bunsetsu: readonly number[];
    readonly fixed: readonly number[];
    readonly random: readonly number[];
  };
  /** 文節の値の順位。量の値が決まらない時は `undefined` */
  readonly rank: Readonly<Record<SegmentVerdictQuantity, RankAmongRandom | undefined>>;
}

/**
 * 文節の区切りから、固定長・ランダムの区切りを作り、区間ごとの値と区切りの前後の値、判定の順位を求める。
 * 文節の区切りが無い（区間が1つ）時は `undefined`。
 */
export function buildSegmentationReport(index: SpanIndex, bunsetsu: readonly number[], seedStart: number): SegmentationReport | undefined {
  const total = index.inputChars;
  if (bunsetsu.length === 0 || total <= 1) return undefined;
  const fixed = fixedBoundaries(bunsetsu, total);
  const seeds = Array.from({ length: SEGMENT_SEED_COUNT }, (_, offset) => seedStart + offset);
  const randomBoundariesBySeed = seeds.map((seed) => randomBoundaries(bunsetsu, total, seed));
  const bunsetsuStats = segmentStats(index, bunsetsu);
  const random = randomBoundariesBySeed.map((boundaries) => segmentStats(index, boundaries));
  const rankOf = (quantity: SegmentVerdictQuantity): RankAmongRandom | undefined => {
    const own = bunsetsuStats.byMetric[SEGMENT_VERDICT_METRIC][quantity];
    if (own === undefined) return undefined;
    const others = random.flatMap((stats) => {
      const value = stats.byMetric[SEGMENT_VERDICT_METRIC][quantity];
      return value === undefined ? [] : [value];
    });
    return others.length === 0 ? undefined : rankAmong(own, others);
  };
  return {
    textChars: total,
    fixedLength: Math.max(1, Math.round(total / (bunsetsu.length + 1))),
    seeds,
    bunsetsu: bunsetsuStats,
    fixed: segmentStats(index, fixed),
    random,
    overlay: { bunsetsu, fixed, random: randomBoundariesBySeed[0]! },
    rank: { p90: rankOf('p90'), after: rankOf('after') },
  };
}

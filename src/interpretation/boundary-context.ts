import { createMulberry32 } from './prng.ts';
import { boundaryCharValue, rankAmong, SEGMENT_SEED_COUNT, type RankAmongRandom } from './segments.ts';
import { spanTotals, wholeTotals, type SpanIndex, type SpanMetricId } from './span-metrics.ts';

/**
 * 文節の区切りの直後の1文字の量が、区切りのまわりの1〜3文字の並びだけで説明できるかを比べる
 * （定義は `docs/boundary-context-comparison.md`）。距離モデルの値は変えない。
 *
 * 区切りの位置 `p` ごとに、文字 `p` までの末尾 `length` 文字を並びの型とする。
 * ランダムな区切りは、型ごとの区切りの数を文節と同じにして、その型が現れる位置から選ぶ。
 */

/** 並びの長さ [文字]。 */
export const BOUNDARY_CONTEXT_LENGTHS = [1, 2, 3] as const;
export type BoundaryContextLength = (typeof BOUNDARY_CONTEXT_LENGTHS)[number];

/** 比べる指標。1文字あたりの距離。 */
export const BOUNDARY_CONTEXT_METRIC: SpanMetricId = 'perCharUnits';

/** 選ぶ余地が無い区切りの割合の上限。超えたら判定を出さない。順位を見る前に固定した値で、結果に合わせて動かさない。 */
export const BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT = 0.1;

/** ランダムな区切りの種の数。 */
export const BOUNDARY_CONTEXT_SEED_COUNT = SEGMENT_SEED_COUNT;

/** 位置 `position` の文字で終わる、長さ `length` の並びの文字列。前の文字が足りなければ `undefined`。 */
export function contextKey(chars: readonly string[], position: number, length: number): string | undefined {
  if (position - length + 1 < 0 || position >= chars.length) return undefined;
  return chars.slice(position - length + 1, position + 1).join('');
}

/** 前の文字が足りない区切り（`position < length − 1`）を除く。区切りが先頭（0）にある場合も除く。 */
export function comparableBoundaries(boundaries: readonly number[], length: number): number[] {
  const first = Math.max(1, length - 1);
  return boundaries.filter((boundary) => boundary >= first);
}

export interface ContextMatchedBoundaries {
  /** ランダムな区切り。昇順 */
  readonly boundaries: number[];
  /** 比べる文節の区切り（前の文字が足りない区切りを除いたもの）の数 */
  readonly comparedCount: number;
  /** 比べる文節の区切りのうち、型の出現位置の数と区切りの数が等しい（選ぶ余地が無い）型に入るものの数 */
  readonly forcedCount: number;
}

/**
 * 並びの型ごとの区切りの数を文節と揃えたランダムな区切り。
 * 型ごとに、文節の区切りのうちその型を持つ数 `k` と、テキストの中でその型が現れる位置の数 `m` を数え、
 * `m` 個の位置から `k` 個を重複なしに一様に選ぶ（部分的な Fisher-Yates）。型は文字列の昇順に辿るので、同じ種からは同じ区切りが出る。
 */
export function contextMatchedBoundaries(chars: readonly string[], bunsetsu: readonly number[], length: number, seed: number): ContextMatchedBoundaries {
  const compared = comparableBoundaries(bunsetsu, length).filter((boundary) => boundary < chars.length);
  const wanted = new Map<string, number>();
  for (const boundary of compared) {
    const key = contextKey(chars, boundary, length)!;
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }
  // 区切りは0にも末尾にも置かれないので、候補は [max(1, length − 1), 末尾) の位置
  const positionsByKey = new Map<string, number[]>();
  for (let position = Math.max(1, length - 1); position < chars.length; position++) {
    const key = contextKey(chars, position, length)!;
    if (!wanted.has(key)) continue;
    const positions = positionsByKey.get(key);
    if (positions === undefined) positionsByKey.set(key, [position]);
    else positions.push(position);
  }
  const random = createMulberry32(seed);
  const chosen: number[] = [];
  let forcedCount = 0;
  for (const key of [...wanted.keys()].sort()) {
    const k = wanted.get(key)!;
    const positions = positionsByKey.get(key)!;
    if (positions.length === k) {
      forcedCount += k;
      chosen.push(...positions);
      continue;
    }
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(random() * (positions.length - i));
      const held = positions[i]!;
      positions[i] = positions[j]!;
      positions[j] = held;
      chosen.push(positions[i]!);
    }
  }
  return { boundaries: chosen.sort((a, b) => a - b), comparedCount: compared.length, forcedCount };
}

export type BoundaryContextVerdict =
  | { readonly kind: 'unexplained' }
  | { readonly kind: 'not-ruled-out' }
  | { readonly kind: 'withheld'; readonly reason: 'forced-ratio' | 'undefined-value' };

/**
 * 順位から判定を出す。選ぶ余地が無い区切りの割合が上限を超えたら出さない。
 * 端に来た時だけ「説明できなかった」とし、それ以外は「説明できなかったとは言えない」とする。
 */
export function boundaryContextVerdict(rank: RankAmongRandom | undefined, forcedRatio: number | undefined): BoundaryContextVerdict {
  if (forcedRatio === undefined || rank === undefined) return { kind: 'withheld', reason: 'undefined-value' };
  if (forcedRatio > BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT) return { kind: 'withheld', reason: 'forced-ratio' };
  return rank.extreme === null ? { kind: 'not-ruled-out' } : { kind: 'unexplained' };
}

export interface BoundaryContextResult {
  readonly length: number;
  readonly comparedCount: number;
  readonly forcedCount: number;
  /** `forcedCount / comparedCount`。比べる区切りが無ければ `undefined` */
  readonly forcedRatio: number | undefined;
  /** 文節の区切りの直後の1文字の量 */
  readonly own: number | undefined;
  /** 種ごとの、ランダムな区切りの直後の1文字の量 */
  readonly random: readonly (number | undefined)[];
  readonly rank: RankAmongRandom | undefined;
  readonly verdict: BoundaryContextVerdict;
}

/**
 * 並びの長さ `length` について、文節の区切りの直後の1文字の量を、並びを揃えたランダムな区切り20個と比べる。
 * `chars` は評価に渡したテキストの文字の列で、`index` と同じ長さでなければならない。
 */
export function compareBoundaryContext(
  index: SpanIndex,
  chars: readonly string[],
  bunsetsu: readonly number[],
  length: number,
  seedStart: number,
): BoundaryContextResult {
  if (chars.length !== index.inputChars) throw new Error(`文字の列の長さ${chars.length}が評価に渡したテキストの文字数${index.inputChars}と違う`);
  const sets = Array.from({ length: BOUNDARY_CONTEXT_SEED_COUNT }, (_, offset) => contextMatchedBoundaries(chars, bunsetsu, length, seedStart + offset));
  // 比べる区切りの数と選ぶ余地が無い区切りの数は、種によらず同じ
  const { comparedCount, forcedCount } = sets[0]!;
  const forcedRatio = comparedCount === 0 ? undefined : forcedCount / comparedCount;
  const own = comparedCount === 0 ? undefined : boundaryCharValue(index, BOUNDARY_CONTEXT_METRIC, comparableBoundaries(bunsetsu, length), 0);
  const random = sets.map((set) => (comparedCount === 0 ? undefined : boundaryCharValue(index, BOUNDARY_CONTEXT_METRIC, set.boundaries, 0)));
  const defined = random.filter((value): value is number => value !== undefined);
  const rank = own === undefined || defined.length === 0 ? undefined : rankAmong(own, defined);
  return { length, comparedCount, forcedCount, forcedRatio, own, random, rank, verdict: boundaryContextVerdict(rank, forcedRatio) };
}

export interface BoundaryShare {
  /** 区切りの直後の1文字に帰属した距離の和 / 全文の距離の和。全文の距離の和が0なら `undefined` */
  readonly distanceShare: number | undefined;
  /** 区切りの直後の1文字の数 / 全文の文字数 */
  readonly charShare: number | undefined;
}

/** 文節の区切りの直後の1文字が、全文の距離と文字数に占める割合。順位・判定は付けない。 */
export function boundaryShare(index: SpanIndex, bunsetsu: readonly number[]): BoundaryShare {
  let numerator = 0;
  for (const boundary of bunsetsu) numerator += spanTotals(index, BOUNDARY_CONTEXT_METRIC, boundary, boundary + 1).numerator;
  const whole = wholeTotals(index, BOUNDARY_CONTEXT_METRIC);
  return {
    distanceShare: whole.numerator === 0 ? undefined : numerator / whole.numerator,
    charShare: whole.denominator === 0 ? undefined : bunsetsu.length / whole.denominator,
  };
}

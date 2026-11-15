import { createMulberry32 } from './prng.ts';

/**
 * コーパスの系列で、距離を置いた2単位の相互情報量から、依存を検出できた文脈の長さを推定する（定義は`docs/corpus-ngram.md`の「文脈の長さの推定」）。
 * 配列の定義と品詞を参照しない。
 */

/** 並べ替えの基準を作る回数。種は`1`から`PERMUTATION_COUNT`まで。 */
export const PERMUTATION_COUNT = 20;

/** 走りを選ぶ乱数生成器の種に足す数。並べ替えの種（1〜20）と同じ種から、同じ乱数の列が出ないようにする。 */
export const SELECTION_SEED_OFFSET = 1000;

/** 調べる距離の上限。かなの系列と文節の系列で別の値を持つ。 */
export const MAX_DISTANCE = { kana: 64, bunsetsu: 32 } as const;

/** 単位を整数の番号にした走りの集まり。`units`は全走りを順に並べた列で、`lengths`は走りごとの長さ。 */
export interface EncodedRuns {
  readonly units: Int32Array;
  readonly lengths: readonly number[];
  /** 単位の種類の数。`units`の値は`0`以上`alphabet`未満 */
  readonly alphabet: number;
}

/** 走りごとの単位の列を、単位ごとに番号を振った形へ直す。番号は最初に出た順。 */
export function encodeRuns(runs: readonly (readonly string[])[]): EncodedRuns {
  const ids = new Map<string, number>();
  const lengths: number[] = [];
  let total = 0;
  for (const run of runs) total += run.length;
  const units = new Int32Array(total);
  let index = 0;
  for (const run of runs) {
    lengths.push(run.length);
    for (const unit of run) {
      let id = ids.get(unit);
      if (id === undefined) {
        id = ids.size;
        ids.set(unit, id);
      }
      units[index++] = id;
    }
  }
  return { units, lengths, alphabet: ids.size };
}

/** 密な表で数える時の、組の種類の上限（`alphabet`の2乗）。超える時は疎な表で数える。 */
const DENSE_PAIR_LIMIT = 1 << 22;

/**
 * 距離`distance`だけ離れた2単位の相互情報量（ビット）。位置`t`の単位と`t + distance`の単位の組を、1つの走りの中だけで数える。
 * 組の同時分布と、組の1つ目・2つ目それぞれの周辺分布を、出現回数の比で求めて計算する。組が1つも無い時はundefined。
 */
export function mutualInformation(runs: EncodedRuns, distance: number): number | undefined {
  const { units, lengths, alphabet } = runs;
  const first = new Int32Array(alphabet);
  const second = new Int32Array(alphabet);
  const dense = alphabet * alphabet <= DENSE_PAIR_LIMIT;
  const denseCounts = dense ? new Int32Array(alphabet * alphabet) : undefined;
  const sparseCounts = dense ? undefined : new Map<number, number>();
  let pairs = 0;
  let start = 0;
  for (const length of lengths) {
    const end = start + length - distance;
    for (let t = start; t < end; t++) {
      const a = units[t]!;
      const b = units[t + distance]!;
      first[a]!++;
      second[b]!++;
      const key = a * alphabet + b;
      if (denseCounts !== undefined) denseCounts[key]!++;
      else sparseCounts!.set(key, (sparseCounts!.get(key) ?? 0) + 1);
      pairs++;
    }
    start += length;
  }
  if (pairs === 0) return undefined;
  let sum = 0;
  const add = (key: number, count: number): void => {
    const a = Math.floor(key / alphabet);
    const b = key - a * alphabet;
    sum += count * Math.log2((count * pairs) / (first[a]! * second[b]!));
  };
  if (denseCounts !== undefined) {
    for (let key = 0; key < denseCounts.length; key++) {
      const count = denseCounts[key]!;
      if (count > 0) add(key, count);
    }
  } else {
    for (const [key, count] of sparseCounts!) add(key, count);
  }
  return sum / pairs;
}

/**
 * 並べ替えた系列。全走りの単位を1列に並べて、`createMulberry32(seed)`の乱数でFisher-Yatesに並べ替え、元の走りの長さで切り直す。
 * 単位ごとの出現回数と、走りの長さ（つまり距離ごとの組の数）は元と同じで、単位の間の依存だけが無い。
 */
export function permuteRuns(runs: EncodedRuns, seed: number): EncodedRuns {
  const units = Int32Array.from(runs.units);
  const random = createMulberry32(seed);
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = units[i]!;
    units[i] = units[j]!;
    units[j] = swap;
  }
  return { units, lengths: runs.lengths, alphabet: runs.alphabet };
}

/** 距離ごとの結果。 */
export interface ContextDistanceRow {
  readonly distance: number;
  /** 元の系列の相互情報量（ビット）。組が無ければundefined */
  readonly mutualInformation: number | undefined;
  /** 並べ替えた系列の相互情報量の平均 */
  readonly permutedMean: number | undefined;
  /** 並べ替えた系列の相互情報量の最大 */
  readonly permutedMax: number | undefined;
  /** 元の相互情報量 − 並べ替えた系列の平均 */
  readonly excess: number | undefined;
  /** 元の相互情報量が、並べ替えた系列すべての値より大きい */
  readonly detected: boolean;
}

export interface ContextLength {
  /** 検出できた距離が`distance = 1`から途切れずに続く最大の距離。`distance = 1`で検出できなければ0 */
  readonly length: number;
  /** 調べる距離の上限まで検出が続いた */
  readonly reachedLimit: boolean;
  /** `distance = 1`から、最初に検出できなかった距離（または上限）までの行 */
  readonly rows: readonly ContextDistanceRow[];
}

/**
 * 検出できた文脈の長さ。`distance = 1`から順に見て、最初に検出できなかった距離で止める。
 * 並べ替えの種は`1`から`permutations`まで。
 */
export function detectContextLength(runs: readonly (readonly string[])[], maxDistance: number, permutations = PERMUTATION_COUNT): ContextLength {
  const original = encodeRuns(runs);
  const permuted = Array.from({ length: permutations }, (_, index) => permuteRuns(original, index + 1));
  const rows: ContextDistanceRow[] = [];
  let length = 0;
  for (let distance = 1; distance <= maxDistance; distance++) {
    const value = mutualInformation(original, distance);
    const baseline: number[] = [];
    for (const sequence of permuted) {
      const baselineValue = mutualInformation(sequence, distance);
      if (baselineValue !== undefined) baseline.push(baselineValue);
    }
    const permutedMax = baseline.length === 0 ? undefined : Math.max(...baseline);
    const permutedMean = baseline.length === 0 ? undefined : baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
    const detected = value !== undefined && permutedMax !== undefined && value > permutedMax;
    rows.push({
      distance,
      mutualInformation: value,
      permutedMean,
      permutedMax,
      excess: value === undefined || permutedMean === undefined ? undefined : value - permutedMean,
      detected,
    });
    if (!detected) break;
    length = distance;
  }
  return { length, reachedLimit: length === maxDistance, rows };
}

/**
 * コーパスの大きさを変える。走りを単位に、`createMulberry32(SELECTION_SEED_OFFSET + seed)`の乱数で無作為な順に並べ、
 * 選んだ走りの長さの合計が`target`に達するまで足す。走りの途中では切らない。選んだ走りの番号を昇順で返す。
 */
export function selectRunsUpTo(lengths: readonly number[], target: number, seed: number): number[] {
  const order = lengths.map((_, index) => index);
  const random = createMulberry32(SELECTION_SEED_OFFSET + seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  const chosen: number[] = [];
  let total = 0;
  for (const index of order) {
    if (total >= target) break;
    chosen.push(index);
    total += lengths[index]!;
  }
  return chosen.sort((a, b) => a - b);
}

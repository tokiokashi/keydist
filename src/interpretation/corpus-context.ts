import { createMulberry32 } from './prng.ts';

/**
 * コーパスの系列で、距離を置いた2単位の組の依存を検出し、検出できた文脈の長さを求める（定義は`docs/corpus-ngram.md`の「文脈の長さの推定」）。
 * 配列の定義と品詞を参照しない。
 */

/** 全体の表で並べ替える通り数。種は`1`から`PERMUTATIONS_FULL`まで。 */
export const PERMUTATIONS_FULL = 199;

/** コーパスの大きさを変えた表で並べ替える通り数。種は`1`から`PERMUTATIONS_SIZED`まで。 */
export const PERMUTATIONS_SIZED = 99;

/** 依存を検出できたとするp値の上限。 */
export const P_VALUE_LIMIT = 0.05;

/** 走りを選ぶ乱数生成器の種に足す数。並べ替えの種（1〜199）と同じ種から、同じ乱数の列が出ないようにする。 */
export const SELECTION_SEED_OFFSET = 1000;

/** 調べる距離の格子。`1`〜`8`の全部と、12・16・24・32・48・64。 */
export const DISTANCE_GRID: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32, 48, 64];

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

/** 距離`d`の組の列。`first[i]`と`second[i]`が、1つの走りの中の位置`t`と`t + d`の単位。 */
export interface DistancePairs {
  readonly first: Int32Array;
  readonly second: Int32Array;
  readonly alphabet: number;
}

/** 距離`distance`の組を、1つの走りの中だけで作る。走りをまたぐ組は作らない。組が無ければundefined。 */
export function pairsAtDistance(runs: EncodedRuns, distance: number): DistancePairs | undefined {
  let count = 0;
  for (const length of runs.lengths) count += Math.max(0, length - distance);
  if (count === 0) return undefined;
  const first = new Int32Array(count);
  const second = new Int32Array(count);
  let index = 0;
  let start = 0;
  for (const length of runs.lengths) {
    const end = start + length - distance;
    for (let t = start; t < end; t++) {
      first[index] = runs.units[t]!;
      second[index] = runs.units[t + distance]!;
      index++;
    }
    start += length;
  }
  return { first, second, alphabet: runs.alphabet };
}

/** 密な表で数える時の、組の種類の上限（`alphabet`の2乗）。超える時は疎な表で数える。 */
const DENSE_PAIR_LIMIT = 1 << 22;

function marginals(units: Int32Array, alphabet: number): Int32Array {
  const counts = new Int32Array(alphabet);
  for (const unit of units) counts[unit]!++;
  return counts;
}

/** 組`(first[i], second[i])`ごとの出現回数を、`visit(組の鍵, 出現回数)`へ渡す。鍵は`first * alphabet + second`。 */
function forEachJoint(first: Int32Array, second: Int32Array, alphabet: number, visit: (key: number, count: number) => void): void {
  if (alphabet * alphabet <= DENSE_PAIR_LIMIT) {
    const counts = new Int32Array(alphabet * alphabet);
    for (let i = 0; i < first.length; i++) counts[first[i]! * alphabet + second[i]!]!++;
    for (let key = 0; key < counts.length; key++) {
      const count = counts[key]!;
      if (count > 0) visit(key, count);
    }
    return;
  }
  const counts = new Map<number, number>();
  for (let i = 0; i < first.length; i++) {
    const key = first[i]! * alphabet + second[i]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) visit(key, count);
}

/**
 * 組の相互情報量（ビット）。組の同時分布と、組の1つ目・2つ目それぞれの周辺分布を、出現回数の比で求めて計算する。
 * `firstMarginal`と`secondMarginal`は、組の1つ目と2つ目の出現回数。
 */
function pluginMutualInformation(first: Int32Array, second: Int32Array, alphabet: number, firstMarginal: Int32Array, secondMarginal: Int32Array): number {
  const pairs = first.length;
  let sum = 0;
  forEachJoint(first, second, alphabet, (key, count) => {
    const a = Math.floor(key / alphabet);
    const b = key - a * alphabet;
    sum += count * Math.log2((count * pairs) / (firstMarginal[a]! * secondMarginal[b]!));
  });
  return sum / pairs;
}

/** 組の相互情報量（ビット。出現回数の比で求める）。 */
export function mutualInformation(pairs: DistancePairs): number {
  return pluginMutualInformation(
    pairs.first,
    pairs.second,
    pairs.alphabet,
    marginals(pairs.first, pairs.alphabet),
    marginals(pairs.second, pairs.alphabet),
  );
}

const EULER_GAMMA = 0.5772156649015329;

/** 正の整数`n`のディガンマ関数 ψ(n) = −γ + Σ(k=1..n−1) 1/k の表。 */
function digammaTable(max: number): Float64Array {
  const table = new Float64Array(max + 1);
  table[1] = -EULER_GAMMA;
  for (let n = 2; n <= max; n++) table[n] = table[n - 1]! + 1 / (n - 1);
  return table;
}

/**
 * Grassbergerの推定量で偏りを補正した組の相互情報量（ビット）。
 * Ŝ = ln N − (1/N) Σ N_i ψ(N_i)として、I = Ŝ(1つ目) + Ŝ(2つ目) − Ŝ(組)。検出には使わず、参考の列として出す。
 */
export function grassbergerMutualInformation(pairs: DistancePairs): number {
  return grassberger(pairs.first, pairs.second, pairs.alphabet, marginals(pairs.first, pairs.alphabet), marginals(pairs.second, pairs.alphabet));
}

function grassberger(first: Int32Array, second: Int32Array, alphabet: number, firstMarginal: Int32Array, secondMarginal: Int32Array): number {
  const n = first.length;
  const psi = digammaTable(n);
  const entropy = (counts: Iterable<number>): number => {
    let sum = 0;
    for (const count of counts) if (count > 0) sum += count * psi[count]!;
    return Math.log(n) - sum / n;
  };
  const joint: number[] = [];
  forEachJoint(first, second, alphabet, (_key, count) => joint.push(count));
  return (entropy(firstMarginal) + entropy(secondMarginal) - entropy(joint)) / Math.LN2;
}

function shuffleInPlace(values: Int32Array, seed: number): void {
  const random = createMulberry32(seed);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = values[i]!;
    values[i] = values[j]!;
    values[j] = swap;
  }
}

/** 組の2つ目だけを`createMulberry32(seed)`の乱数でFisher-Yatesに並べ替えた列。1つ目と2つ目の周辺分布と組の数は元と同じで、対応だけが無い。 */
export function permuteSecond(pairs: DistancePairs, seed: number): Int32Array {
  const shuffled = Int32Array.from(pairs.second);
  shuffleInPlace(shuffled, seed);
  return shuffled;
}

/** 距離ごとの結果。 */
export interface ContextDistanceRow {
  readonly distance: number;
  /** 組の数 */
  readonly pairs: number;
  /** 元の組の相互情報量（ビット。出現回数の比で求める） */
  readonly mutualInformation: number;
  /** 並べ替えた組の相互情報量の平均 */
  readonly permutedMean: number;
  /** 元の相互情報量 − 並べ替えた組の平均 */
  readonly excess: number;
  /** 超過量 / `distance = 1`の超過量。`distance = 1`の超過量が0以下ならundefined */
  readonly excessRatio: number | undefined;
  /** `(1 + 元以上になった通りの数) / (通り数 + 1)` */
  readonly pValue: number;
  /** p値が`P_VALUE_LIMIT`以下 */
  readonly detected: boolean;
  /** 参考。Grassbergerの推定量で出した、元の組の相互情報量（ビット）。`withGrassberger`の時だけ */
  readonly grassberger?: number | undefined;
  /** 参考。Grassbergerの推定量で出した、種1で並べ替えた組の相互情報量（ビット）。`withGrassberger`の時だけ */
  readonly grassbergerPermuted?: number | undefined;
}

export interface ContextLength {
  /** 格子の点について、小さい方から見て検出できた距離が途切れずに続く最大の格子点。`distance = 1`で検出できなければ0 */
  readonly length: number;
  /** 調べた格子の最後の点まで検出が続いた */
  readonly reachedLimit: boolean;
  /** 格子の全点の行 */
  readonly rows: readonly ContextDistanceRow[];
}

export interface ContextOptions {
  /** 並べ替える通り数。種は`1`から通り数まで */
  readonly permutations: number;
  readonly withGrassberger?: boolean;
}

/**
 * 距離の格子（`DISTANCE_GRID`のうち`maxDistance`以下）の全点で、組の依存を並べ替え検定で調べる。
 * 並べ替えは、距離ごとに組の2つ目だけを全組の間で並べ替える。
 */
export function detectContextLength(runs: readonly (readonly string[])[], maxDistance: number, options: ContextOptions): ContextLength {
  const encoded = encodeRuns(runs);
  const grid = DISTANCE_GRID.filter((distance) => distance <= maxDistance);
  const rows: ContextDistanceRow[] = [];
  const buffer = new Int32Array(encoded.units.length);
  for (const distance of grid) {
    const pairs = pairsAtDistance(encoded, distance);
    if (pairs === undefined) {
      rows.push({
        distance,
        pairs: 0,
        mutualInformation: Number.NaN,
        permutedMean: Number.NaN,
        excess: Number.NaN,
        excessRatio: undefined,
        pValue: 1,
        detected: false,
      });
      continue;
    }
    const firstMarginal = marginals(pairs.first, pairs.alphabet);
    const secondMarginal = marginals(pairs.second, pairs.alphabet);
    const observed = pluginMutualInformation(pairs.first, pairs.second, pairs.alphabet, firstMarginal, secondMarginal);
    const shuffled = buffer.subarray(0, pairs.second.length);
    let sum = 0;
    let atLeast = 0;
    let grassbergerPermuted: number | undefined;
    for (let seed = 1; seed <= options.permutations; seed++) {
      shuffled.set(pairs.second);
      shuffleInPlace(shuffled, seed);
      const value = pluginMutualInformation(pairs.first, shuffled, pairs.alphabet, firstMarginal, secondMarginal);
      sum += value;
      if (value >= observed) atLeast++;
      if (seed === 1 && options.withGrassberger) grassbergerPermuted = grassberger(pairs.first, shuffled, pairs.alphabet, firstMarginal, secondMarginal);
    }
    const permutedMean = sum / options.permutations;
    const pValue = (1 + atLeast) / (options.permutations + 1);
    rows.push({
      distance,
      pairs: pairs.first.length,
      mutualInformation: observed,
      permutedMean,
      excess: observed - permutedMean,
      excessRatio: undefined,
      pValue,
      detected: pValue <= P_VALUE_LIMIT,
      ...(options.withGrassberger
        ? { grassberger: grassberger(pairs.first, pairs.second, pairs.alphabet, firstMarginal, secondMarginal), grassbergerPermuted }
        : {}),
    });
  }
  const firstExcess = rows[0]?.excess;
  const withRatio = rows.map((row) => ({ ...row, excessRatio: firstExcess !== undefined && firstExcess > 0 ? row.excess / firstExcess : undefined }));
  let length = 0;
  for (const row of withRatio) {
    if (!row.detected) break;
    length = row.distance;
  }
  return { length, reachedLimit: withRatio.length > 0 && length === withRatio.at(-1)!.distance, rows: withRatio };
}

/**
 * コーパスの大きさを変える。走りを単位に、`createMulberry32(SELECTION_SEED_OFFSET + seed)`の乱数で無作為な順に並べ、
 * 選んだ走りの長さの合計が`target`に達するまで足す。走りの途中では切らない。選んだ走りの番号を昇順で返す。
 */
export function selectRunsUpTo(lengths: readonly number[], target: number, seed: number): number[] {
  const chosen: number[] = [];
  let total = 0;
  for (const index of runSelectionOrder(lengths.length, seed)) {
    if (total >= target) break;
    chosen.push(index);
    total += lengths[index]!;
  }
  return chosen.sort((a, b) => a - b);
}

/** 走りを選ぶ順。走りの番号を、`createMulberry32(SELECTION_SEED_OFFSET + seed)`の乱数でFisher-Yatesに並べ替えた列。 */
export function runSelectionOrder(runCount: number, seed: number): number[] {
  const order = Array.from({ length: runCount }, (_, index) => index);
  const random = createMulberry32(SELECTION_SEED_OFFSET + seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  return order;
}

import { ADJACENT_PAIRS, ALL_FINGERS, dist, type Finger, type Geometry } from './geometry.ts';
import type { Trace } from './evaluate.ts';

export interface PairStat {
  pair: [Finger, Finger];
  mean: number;
  stdDev: number;
}

export interface Metrics {
  /**
   * 使用した物理形状の id と名前。形状が変わると距離の絶対値が変わるため、
   * 配列間の比較はここが揃っている場合のみ成立する（仕様 §3）。
   */
  geometryId: string;
  geometryName: string;
  /**
   * 使用した指割り当ての id と名前。割り当てが変わると同指連続の数も距離も変わるため、
   * 配列間の比較はここが揃っている場合のみ成立する（仕様 §4.2）。
   */
  fingerAssignmentId: string;
  fingerAssignmentName: string;
  /** 打鍵ステップ数。同時押しは 1 と数える */
  strokes: number;
  /** キー押下数。同時押しは押したキーの数だけ数える */
  presses: number;
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /** 入力文字数（展開前。仕様 §11.3 の分母） */
  inputChars: number;
  /** 指ごとの総移動距離 [u] */
  perFinger: Record<Finger, number>;
  /** 指ごとの押下数 */
  perFingerPresses: Record<Finger, number>;
  /** 総移動距離 [u] */
  totalUnits: number;
  /** 総移動距離 [mm] */
  totalMm: number;
  /** 1 打鍵あたりの平均移動距離 [u] */
  meanPerStroke: number;
  /**
   * 入力 1 文字あたりの平均移動距離 [u]。
   * 打鍵数はコンボ・かな直接入力で配列ごとに変わるため、`meanPerStroke` では
   * 打鍵数削減の効果が相殺されて消える。分母を展開前の文字数に固定するとここに出る。
   */
  perCharUnits: number;
  /**
   * 入力 1 文字あたりのアクション（ステップ）数（仕様 §11.4）。
   * コンボ・かな直接入力による打鍵数削減の効果はここに直接出る。
   */
  perCharSteps: number;
  /**
   * 入力 1 文字あたりの押下キー数（仕様 §11.4）。
   * コンボは複数キーを 1 ステップにまとめても押すキー自体は減らさないため、
   * `perCharSteps` が下がっても `perCharPresses` は下がらない場合がある。
   */
  perCharPresses: number;
  /** 隣接指間距離の統計 */
  adjacent: PairStat[];
  /** 同指連続回数。同じ指で異なる位置を続けて打った数 */
  sameFinger: number;
  /** キー id → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** キー id → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
}

export function computeMetrics(trace: Trace, geometry: Geometry): Metrics {
  const perFinger = {} as Record<Finger, number>;
  const perFingerPresses = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    perFinger[finger] = 0;
    perFingerPresses[finger] = 0;
  }

  let totalUnits = 0;
  let sameFinger = 0;
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const pairSamples: number[][] = ADJACENT_PAIRS.map(() => []);

  let presses = 0;
  for (const stroke of trace.strokes) {
    totalUnits += stroke.distance;
    for (const press of stroke.presses) {
      presses += press.keys.length;
      perFinger[press.finger] += press.distance;
      perFingerPresses[press.finger] += press.keys.length;
      if (press.sfb) sameFinger++;
      // 1 本の指で複数キーを押した場合、距離はキーへ均等に按分する
      const share = press.distance / press.keys.length;
      for (const key of press.keys) {
        keyCounts.set(key.id, (keyCounts.get(key.id) ?? 0) + 1);
        keyDistance.set(key.id, (keyDistance.get(key.id) ?? 0) + share);
      }
    }

    ADJACENT_PAIRS.forEach((pair, i) => {
      pairSamples[i].push(dist(stroke.positions[pair[0]], stroke.positions[pair[1]]));
    });
  }

  const adjacent = ADJACENT_PAIRS.map((pair, i) => ({
    pair,
    ...meanStdDev(pairSamples[i]),
  }));

  const n = trace.strokes.length;
  const { inputChars } = trace;
  return {
    geometryId: geometry.id,
    geometryName: geometry.name,
    fingerAssignmentId: geometry.assignment.id,
    fingerAssignmentName: geometry.assignment.name,
    strokes: n,
    presses,
    skipped: trace.skipped,
    inputChars,
    perFinger,
    perFingerPresses,
    totalUnits,
    totalMm: totalUnits * geometry.pitchMm,
    meanPerStroke: n ? totalUnits / n : 0,
    perCharUnits: inputChars ? totalUnits / inputChars : 0,
    perCharSteps: inputChars ? n / inputChars : 0,
    perCharPresses: inputChars ? presses / inputChars : 0,
    adjacent,
    sameFinger,
    keyCounts,
    keyDistance,
  };
}

function meanStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

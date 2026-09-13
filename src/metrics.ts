import { ADJACENT_PAIRS, ALL_FINGERS, dist, type Finger, type Geometry } from './geometry.ts';
import type { Trace } from './evaluate.ts';

export interface PairStat {
  pair: [Finger, Finger];
  mean: number;
  variance: number;
}

export interface Metrics {
  /** 打鍵数 */
  strokes: number;
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /** 指ごとの総移動距離 [u] */
  perFinger: Record<Finger, number>;
  /** 総移動距離 [u] */
  totalUnits: number;
  /** 総移動距離 [mm] */
  totalMm: number;
  /** 1 打鍵あたりの平均移動距離 [u] */
  meanPerStroke: number;
  /** 隣接指間距離の統計 */
  adjacent: PairStat[];
  /** 同指連続回数（g = 0） */
  sameFinger: number;
  /** キー id → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** キー id → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
}

export function computeMetrics(trace: Trace, geometry: Geometry): Metrics {
  const perFinger = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) perFinger[finger] = 0;

  let totalUnits = 0;
  let sameFinger = 0;
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const pairSamples: number[][] = ADJACENT_PAIRS.map(() => []);

  for (const stroke of trace.strokes) {
    perFinger[stroke.finger] += stroke.distance;
    totalUnits += stroke.distance;
    if (stroke.gap === 0) sameFinger++;
    keyCounts.set(stroke.key.id, (keyCounts.get(stroke.key.id) ?? 0) + 1);
    keyDistance.set(stroke.key.id, (keyDistance.get(stroke.key.id) ?? 0) + stroke.distance);

    ADJACENT_PAIRS.forEach((pair, i) => {
      pairSamples[i].push(dist(stroke.positions[pair[0]], stroke.positions[pair[1]]));
    });
  }

  const adjacent = ADJACENT_PAIRS.map((pair, i) => ({
    pair,
    ...meanVariance(pairSamples[i]),
  }));

  const n = trace.strokes.length;
  return {
    strokes: n,
    skipped: trace.skipped,
    perFinger,
    totalUnits,
    totalMm: totalUnits * geometry.pitchMm,
    meanPerStroke: n ? totalUnits / n : 0,
    adjacent,
    sameFinger,
    keyCounts,
    keyDistance,
  };
}

function meanVariance(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, variance };
}

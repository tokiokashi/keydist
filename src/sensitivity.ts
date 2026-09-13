import { evaluate, type Options } from './evaluate.ts';
import { computeMetrics } from './metrics.ts';
import type { Geometry } from './geometry.ts';
import type { Layout } from './layouts/index.ts';

export interface SensitivityPoint {
  windowSize: number;
  totalUnits: number;
  totalMm: number;
}

/**
 * 仕様 §11.7。N を振って総移動距離の変化を見る。
 * 傾きが小さい配列ほど、指を残したまま打てる配列。
 */
export function nSensitivity(
  text: string,
  layout: Layout,
  geometry: Geometry,
  options: Options,
  range: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
): SensitivityPoint[] {
  return range.map((windowSize) => {
    const trace = evaluate(text, layout, geometry, { ...options, windowSize });
    const m = computeMetrics(trace, geometry);
    return { windowSize, totalUnits: m.totalUnits, totalMm: m.totalMm };
  });
}

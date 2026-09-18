import { evaluate, type Options } from './evaluate.ts';
import { computeMetrics } from './metrics.ts';
import type { Geometry } from './geometry.ts';
import type { Layout } from './layouts/index.ts';
import { DEFAULT_CHAIN_POLICY, type ChainPolicy } from './analysis-chain.ts';
import { DEFAULT_ARPEGGIO_POLICY, type ArpeggioPolicy } from './analysis-arpeggio.ts';
import { DEFAULT_TRIGGER_REALIZATION_POLICY } from './trigger-realization.ts';

export interface SensitivityPoint {
  windowSize: number;
  totalUnits: number;
  totalMm: number;
}

/**
 * 仕様 §11.9。Nを振って総移動距離の変化を見る。
 * 傾きが小さい配列ほど、指を残したまま打てる配列。
 */
export function nSensitivity(
  text: string,
  layout: Layout,
  geometry: Geometry,
  options: Options,
  range: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  romajiRuleId: string | null = null,
  chainPolicy: Readonly<ChainPolicy> = DEFAULT_CHAIN_POLICY,
  arpeggioPolicy: Readonly<ArpeggioPolicy> = DEFAULT_ARPEGGIO_POLICY,
): SensitivityPoint[] {
  return range.map((windowSize) => {
    const trace = evaluate(text, layout, geometry, { ...options, windowSize });
    const m = computeMetrics(trace, geometry, {
      windowSize,
      sfbHomeCost: options.sfbHomeCost,
      preferOppositeThumb: options.preferOppositeThumb ?? false,
      chainPolicy: { ...chainPolicy },
      arpeggioPolicy: { ...arpeggioPolicy },
      triggerRealizationPolicy: {
        ...(options.triggerRealizationPolicy ?? DEFAULT_TRIGGER_REALIZATION_POLICY),
      },
      romajiRuleId,
    });
    return { windowSize, totalUnits: m.totalUnits, totalMm: m.totalMm };
  });
}

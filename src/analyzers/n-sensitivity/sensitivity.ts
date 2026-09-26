import { generateTrace, type TracePolicy } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/index.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION, type ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
} from '#input/semantics/index.ts';

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
  options: TracePolicy,
  range: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  romajiRuleId: string | null = null,
  chainInterpretation: Readonly<ChainInterpretation> = DEFAULT_CHAIN_INTERPRETATION,
  arpeggioInterpretation: Readonly<ArpeggioInterpretation> = DEFAULT_ARPEGGIO_INTERPRETATION,
): SensitivityPoint[] {
  return range.map((windowSize) => {
    const trace = generateTrace(text, layout, geometry, { ...options, windowSize });
    const m = computeMetrics(trace, geometry, {
      windowSize,
      sfbHomeCost: options.sfbHomeCost,
      preferOppositeThumb: options.preferOppositeThumb ?? false,
      chainInterpretation: { ...chainInterpretation },
      arpeggioInterpretation: { ...arpeggioInterpretation },
      triggerRealizationPolicy: {
        ...(options.triggerRealizationPolicy ?? DEFAULT_TRIGGER_REALIZATION_POLICY),
      },
      actionRealizationPolicy: {
        ...(options.actionRealizationPolicy ?? DEFAULT_ACTION_REALIZATION_POLICY),
      },
      romajiRuleId,
    });
    return { windowSize, totalUnits: m.totalUnits, totalMm: m.totalMm };
  });
}

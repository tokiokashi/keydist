import type { ModeId } from '#legacy/layout-selection.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { ResolvedConditions } from '#engine/condition-resolution.ts';
import { evaluate, type Trace } from '#trace/generate.ts';
import {
  analyzeStrokeStructure,
  type AggregatedAnalysisResult,
} from '#interpretation/structure/aggregate.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';

export interface ResolvedAnalysisInput {
  mode: ModeId;
  text: string;
  layout: Layout;
  geometry: Geometry;
  conditions: ResolvedConditions;
  romajiRuleId: string | null;
}

export interface AnalysisSnapshot {
  mode: ModeId;
  layout: Layout;
  geometry: Geometry;
  trace: Trace;
  analysis: AggregatedAnalysisResult;
  metrics: Metrics;
  conditions: ResolvedConditions;
  romajiRuleId: string | null;
}

export function computeAnalysisSnapshot(
  input: ResolvedAnalysisInput,
): AnalysisSnapshot {
  const trace = evaluate(
    input.text,
    input.layout,
    input.geometry,
    input.conditions.options,
  );
  const analysis = analyzeStrokeStructure(
    trace.strokes,
    input.conditions.chainPolicy,
    input.conditions.arpeggioPolicy,
    input.conditions.triggerRealizationPolicy,
    input.conditions.actionRealizationPolicy,
  );
  const metrics = computeMetrics(trace, input.geometry, {
    windowSize: input.conditions.options.windowSize,
    sfbHomeCost: input.conditions.options.sfbHomeCost,
    preferOppositeThumb: input.conditions.options.preferOppositeThumb ?? false,
    chainPolicy: input.conditions.chainPolicy,
    arpeggioPolicy: input.conditions.arpeggioPolicy,
    triggerRealizationPolicy: input.conditions.triggerRealizationPolicy,
    actionRealizationPolicy: input.conditions.actionRealizationPolicy,
    romajiRuleId: input.romajiRuleId,
  });
  return {
    mode: input.mode,
    layout: input.layout,
    geometry: input.geometry,
    trace,
    analysis,
    metrics,
    conditions: input.conditions,
    romajiRuleId: input.romajiRuleId,
  };
}

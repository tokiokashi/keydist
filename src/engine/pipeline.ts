import { generateTrace, type Trace } from '#trace/generate.ts';
import { analyzeStrokeStructure, type AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';
import { MODEL_VERSION } from './model-version.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * 計算パイプライン（同期。#544 §8-1）。
 *
 * Trace生成段と解釈段（構造 + 共通指標）を別関数に分ける（#544 §7「Trace生成 → 構造 →
 * 指標の流れ」を、段を分けたまま引き継ぐ）。今回は非同期API・古い計算の打ち切りは作らない。
 * 次の作業単位で非同期化する時、この2関数はそのままWorkerや`requestIdleCallback`越しに
 * 呼べる形にしてある（DOM・Reactに依存しない純粋関数。入力と出力がどちらも値で、
 * 呼び出し側の状態を参照しない）。`#engine/cache.ts` がこの2関数をキャッシュ付きで束ねる。
 */

export interface EngineTraceResult {
  readonly modelVersion: number;
  readonly trace: Trace;
}

/** Trace生成段。`trace.errors`（配列定義の不備）も例外にせず結果の値として返す（#544 §8-5）。 */
export function generateEngineTrace(input: ResolvedInput): EngineTraceResult {
  const trace = generateTrace(input.text, input.layout, input.geometry, input.tracePolicy);
  return { modelVersion: MODEL_VERSION, trace };
}

export interface EngineInterpretationResult {
  readonly modelVersion: number;
  readonly analysis: AggregatedAnalysisResult;
  readonly metrics: Metrics;
}

/** 解釈段（構造 + 共通指標）。Traceは変えず、数値の定義（解釈）だけを適用する。 */
export function interpretEngineTrace(
  traceResult: EngineTraceResult,
  input: ResolvedInput,
): EngineInterpretationResult {
  const { trace } = traceResult;
  const analysis = analyzeStrokeStructure(
    trace.strokes,
    input.chainInterpretation,
    input.arpeggioInterpretation,
    input.tracePolicy.triggerRealizationPolicy,
    input.tracePolicy.actionRealizationPolicy,
  );
  const metrics = computeMetrics(trace, input.geometry, {
    windowSize: input.tracePolicy.windowSize,
    sfbHomeCost: input.tracePolicy.sfbHomeCost,
    preferOppositeThumb: input.tracePolicy.preferOppositeThumb ?? false,
    chainInterpretation: input.chainInterpretation,
    arpeggioInterpretation: input.arpeggioInterpretation,
    triggerRealizationPolicy: input.tracePolicy.triggerRealizationPolicy!,
    actionRealizationPolicy: input.tracePolicy.actionRealizationPolicy!,
    romajiRuleId: input.romajiRuleId,
  });
  return { modelVersion: MODEL_VERSION, analysis, metrics };
}

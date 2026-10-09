import { generateTrace, type Trace } from '#trace/generate.ts';
import { analyzeStrokeStructure, type AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';
import { computeKeyDetails, type KeyDetails } from '#interpretation/key-detail.ts';
import type {
  AnalyzerSetMember,
  AnalyzerSetMemberFailure,
  SetAnalyzerDefinition,
  SingleAnalyzerDefinition,
  TraceRequester,
} from '#analyzers/contract.ts';
import { MODEL_VERSION } from './model-version.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * 計算パイプライン（同期）。
 *
 * Trace生成段と解釈段（構造 + 共通指標）を別関数に分ける（Trace生成 → 構造 →
 * 指標の流れを、段を分けたまま持つ）。ここでは非同期API・古い計算の打ち切りは作らない。
 * 次の作業単位で非同期化する時、この2関数はそのままWorkerや`requestIdleCallback`越しに
 * 呼べる形にしてある（DOM・Reactに依存しない純粋関数。入力と出力がどちらも値で、
 * 呼び出し側の状態を参照しない）。`#engine/cache.ts` がこの2関数をキャッシュ付きで束ねる。
 */

export interface EngineTraceResult {
  readonly modelVersion: number;
  readonly trace: Trace;
}

/** Trace生成段。`trace.errors`（配列定義の不備）も例外にせず結果の値として返す。 */
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

export interface EngineKeyDetailsResult {
  readonly modelVersion: number;
  readonly keyDetails: KeyDetails;
}

/** キーの詳細の計算（仕様 §11.11）。Traceと物理配列だけで決まり、解釈の値には依らない。 */
export function computeEngineKeyDetails(traceResult: EngineTraceResult, input: ResolvedInput): EngineKeyDetailsResult {
  return { modelVersion: MODEL_VERSION, keyDetails: computeKeyDetails(traceResult.trace, input.geometry) };
}

export interface EngineExtractionResult<Extracted> {
  readonly modelVersion: number;
  readonly extracted: Extracted;
}

/**
 * 抽出段（単一Setup対象のAnalyzerのみ）。
 *
 * Trace・解釈はすでに計算済みのものを受け取るだけで、ここでは計算し直さない
 * （`EngineCache.getExtraction`が「無ければ計算する」判断を持ち、この関数は
 * 「渡された結果からAnalyzerのextractを1回呼ぶ」ことだけを担う純関数）。
 * `definition.extract`が例外を投げた場合、ここでは捕まえない
 * （`request.ts`の`createEngineRequest`がcompute呼び出し全体を包んでいるので、
 * そこで`failed`という値に変換される）。
 */
export function extractSingle<Options, Extracted>(
  definition: SingleAnalyzerDefinition<Options, Extracted>,
  options: Options,
  traceResult: EngineTraceResult,
  interpretationResult: EngineInterpretationResult,
  requestTrace: TraceRequester,
  keyDetails: () => KeyDetails,
): EngineExtractionResult<Extracted> {
  const extracted = definition.extract({
    trace: traceResult.trace,
    analysis: interpretationResult.analysis,
    metrics: interpretationResult.metrics,
    options,
    requestTrace,
    keyDetails,
  });
  return { modelVersion: MODEL_VERSION, extracted };
}

/**
 * 抽出段（集合対象のAnalyzerのみ）。
 *
 * `extractSingle`と同じく「渡された結果からAnalyzerのextractを1回呼ぶ」ことだけを担う
 * 純関数。メンバーごとのTrace・解釈・`TraceRequester`はすでに計算済みのものを受け取る
 * だけ（`EngineCache.getSetExtraction`が「解決できたメンバーだけ計算し、失敗したメンバーは
 * `failures`へ回す」「メンバーごとに`TraceRequester`を組み立てる」判断を持つ）。
 * 集合レベルの`requestTrace`は無い（`contract.ts`の
 * `SetAnalyzerExtractContext`のコメント参照）。
 */
export function extractSet<Options, Extracted>(
  definition: SetAnalyzerDefinition<Options, Extracted>,
  options: Options,
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): EngineExtractionResult<Extracted> {
  const extracted = definition.extract({ members, failures, options });
  return { modelVersion: MODEL_VERSION, extracted };
}

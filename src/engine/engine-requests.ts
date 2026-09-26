import type { EngineCache } from './cache.ts';
import type { EngineInterpretationResult, EngineTraceResult } from './pipeline.ts';
import { createEngineRequest, type EngineRequestChannel, type EngineRequestOptions, type EngineRequestState } from './request.ts';

/**
 * `EngineCache`を具体的な計算（Trace / 解釈）に束ねた依頼の窓口（#544 §8-1）。
 *
 * `request.ts`の`createEngineRequest`はどんな`compute`にも使える形にしてあるので
 * （Phase 3で抽出段の依頼を足す時もこれを再利用する）、ここではTrace・解釈の2種類だけを
 * `EngineCache`に対して具体化する。
 */

export type TraceRequestState = EngineRequestState<EngineTraceResult>;
export type InterpretationRequestState = EngineRequestState<EngineInterpretationResult>;

/** Trace単体の依頼。抽出段がTraceだけを見たい場合（N感度など）向け。 */
export function createTraceRequest(
  cache: EngineCache,
  listener: (state: TraceRequestState) => void,
  options?: EngineRequestOptions,
): EngineRequestChannel {
  return createEngineRequest((input) => cache.getTrace(input), listener, options);
}

/** 解釈（構造 + 共通指標）の依頼。Traceは`EngineCache`の中で共有されるキャッシュ経由で再利用される。 */
export function createInterpretationRequest(
  cache: EngineCache,
  listener: (state: InterpretationRequestState) => void,
  options?: EngineRequestOptions,
): EngineRequestChannel {
  return createEngineRequest((input) => cache.getInterpretation(input), listener, options);
}

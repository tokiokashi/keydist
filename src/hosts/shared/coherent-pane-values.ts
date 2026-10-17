import { useState } from 'react';
import type { EngineExtractionResult, EngineTraceResult } from '#engine/pipeline.ts';
import type { ExtractionRequestState, TraceRequestState } from '#engine/engine-requests.ts';

/** 同じ解決済み入力から出たTrace結果と抽出結果の組。 */
export interface CoherentPaneValues<Extracted> {
  readonly trace: EngineTraceResult;
  readonly extraction: EngineExtractionResult<Extracted>;
}

/**
 * ペインが図と一緒に表示する値（Traceの飛ばした文字数・Traceのエラーと、抽出の図）を、同じ入力の組にそろえる。
 *
 * TraceのチャンネルとAnalyzerの抽出のチャンネルは別々に解決するので、片方だけが新しい入力の結果になり、
 * もう片方が直前の結果（`stale`）のままの瞬間がある。そのまま読むと、図は新しい入力のもの、
 * 飛ばした文字数は前の入力のもの、になる。両方が`ready`の間は今の値の組を返し、
 * どちらかが`stale`の間は、両方が`ready`だった直近の組を返す。
 * どちらかに表示できる値が無い間（`idle`・`computing`・`failed`）と、両方が`ready`になったことが無い間は`undefined`。
 */
export function settleCoherentValues<Extracted>(
  previous: CoherentPaneValues<Extracted> | undefined,
  extraction: ExtractionRequestState<Extracted>,
  trace: TraceRequestState,
): CoherentPaneValues<Extracted> | undefined {
  if (extraction.status === 'ready' && trace.status === 'ready') {
    if (previous !== undefined && previous.extraction === extraction.value && previous.trace === trace.value) return previous;
    return { trace: trace.value, extraction: extraction.value };
  }
  const extractionShown = extraction.status === 'ready' || extraction.status === 'stale';
  const traceShown = trace.status === 'ready' || trace.status === 'stale';
  return extractionShown && traceShown ? previous : undefined;
}

/**
 * `settleCoherentValues`を描画の中で使う。直近の組はstateに持ち、両方が`ready`になった描画で更新する
 * （描画中のsetStateは、同じ描画のうちに最新の値で描き直される）。
 */
export function useCoherentPaneValues<Extracted>(
  extraction: ExtractionRequestState<Extracted>,
  trace: TraceRequestState,
): CoherentPaneValues<Extracted> | undefined {
  const [kept, setKept] = useState<CoherentPaneValues<Extracted> | undefined>(undefined);
  const settled = settleCoherentValues(kept, extraction, trace);
  if (settled !== kept) setKept(settled);
  return settled;
}

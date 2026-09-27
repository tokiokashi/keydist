import { useEffect, useRef, useState } from 'react';
import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { ExtractionRequestState, TraceRequestState } from '#engine/engine-requests.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import {
  closeAnalyzerPaneChannels,
  syncAnalyzerPaneChannels,
  type AnalyzerPaneChannels,
} from './analyzer-channels.ts';

export interface UseAnalyzerPaneResult<Extracted> {
  readonly extraction: ExtractionRequestState<Extracted>;
  readonly trace: TraceRequestState;
}

const IDLE_EXTRACTION: ExtractionRequestState<never> = { status: 'idle' };
const IDLE_TRACE: TraceRequestState = { status: 'idle' };

/**
 * `syncAnalyzerPaneChannels`（純粋・`analyzer-channels.ts`）をReactの副作用へ配線するhook。
 * このファイル自身はロジックを持たない（分岐・打ち切りの判断は全部`analyzer-channels.ts`が
 * 持ち、node:testでもReactなしに検証できる。このhookは「レンダーごとに最新の
 * options/resolutionで同期する」という配線だけを担う）。
 */
export function useAnalyzerPane<Options, Extracted>(
  cache: EngineCache,
  definition: SingleAnalyzerDefinition<Options, Extracted>,
  options: Options,
  resolution: ResolvedInputResult,
): UseAnalyzerPaneResult<Extracted> {
  const [extraction, setExtraction] = useState<ExtractionRequestState<Extracted>>(
    IDLE_EXTRACTION as ExtractionRequestState<Extracted>,
  );
  const [trace, setTrace] = useState<TraceRequestState>(IDLE_TRACE);
  const channelsRef = useRef<AnalyzerPaneChannels<Options> | undefined>(undefined);

  useEffect(() => {
    channelsRef.current = syncAnalyzerPaneChannels(channelsRef.current, {
      cache,
      definition,
      options,
      resolution,
      onExtraction: setExtraction,
      onTrace: setTrace,
    });
  });

  // アンマウント時だけ購読を止める（cacheが変わることはこの単体ページでは無いが、
  // 念のため依存に含める）。
  useEffect(() => () => {
    closeAnalyzerPaneChannels(channelsRef.current);
    channelsRef.current = undefined;
  }, [cache]);

  return { extraction, trace };
}

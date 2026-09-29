import { useEffect, useRef, useState } from 'react';
import type { SetAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { ExtractionRequestState } from '#engine/engine-requests.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import {
  closeAnalyzerSetPaneChannels,
  syncAnalyzerSetPaneChannels,
  type AnalyzerSetPaneChannels,
} from './analyzer-set-channels.ts';

export interface UseAnalyzerSetPaneResult<Extracted> {
  readonly extraction: ExtractionRequestState<Extracted>;
}

const IDLE_EXTRACTION: ExtractionRequestState<never> = { status: 'idle' };

/**
 * `use-analyzer-pane.ts`（単一対象）の集合版。`syncAnalyzerSetPaneChannels`
 * （純粋・`analyzer-set-channels.ts`）をReactの副作用へ配線するだけで、分岐・打ち切りの
 * 判断は持たない。
 */
export function useAnalyzerSetPane<Options, Extracted>(
  cache: EngineCache,
  definition: SetAnalyzerDefinition<Options, Extracted>,
  options: Options,
  members: readonly EngineSetMemberInput[],
): UseAnalyzerSetPaneResult<Extracted> {
  const [extraction, setExtraction] = useState<ExtractionRequestState<Extracted>>(
    IDLE_EXTRACTION as ExtractionRequestState<Extracted>,
  );
  const channelsRef = useRef<AnalyzerSetPaneChannels<Options> | undefined>(undefined);

  useEffect(() => {
    channelsRef.current = syncAnalyzerSetPaneChannels(channelsRef.current, {
      cache,
      definition,
      options,
      members,
      onExtraction: setExtraction,
    });
    // `use-analyzer-pane.ts`と同じ理由（無限ループ対策）で依存配列をこの4つに絞る。
  }, [cache, definition, options, members]);

  useEffect(() => () => {
    closeAnalyzerSetPaneChannels(channelsRef.current);
    channelsRef.current = undefined;
  }, [cache]);

  return { extraction };
}

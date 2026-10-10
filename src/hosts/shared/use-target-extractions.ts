import { useEffect, useState } from 'react';
import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineComputer } from '#engine/computer.ts';
import { createExtractRequest, type ExtractionRequestState } from '#engine/engine-requests.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { foldExtractionState } from './analyzer-channels.ts';

/** 抽出を頼む対象1つぶん。`key`は対象のkey。 */
export interface TargetExtractionEntry {
  readonly key: string;
  readonly resolution: ResolvedInputResult;
}

/**
 * Singleの定義で、複数の対象の抽出を同時に頼む。対象ごとに`useAnalyzerPane`の抽出と同じ依頼
 * （`createExtractRequest`）を1本ずつ張るので、その対象をSingleで選んだ時と同じ経路・同じキャッシュを通り、
 * 結果も共有できる。対象の数は変わるため、チャンネルの生成と破棄は1つの副作用でまとめて行う。
 *
 * `entries`は呼び出し側が値が変わった時だけ新しい参照を作る前提（`use-analyzer-pane.ts`と同じ理由）。
 */
export function useTargetExtractions<Options, Extracted>(
  cache: EngineComputer,
  definition: SingleAnalyzerDefinition<Options, Extracted>,
  options: Options,
  entries: readonly TargetExtractionEntry[],
): ReadonlyMap<string, ExtractionRequestState<Extracted>> {
  const [states, setStates] = useState<ReadonlyMap<string, ExtractionRequestState<Extracted>>>(new Map());

  useEffect(() => {
    const keys = new Set(entries.map((entry) => entry.key));
    setStates((previous) => {
      const kept = [...previous].filter(([key]) => keys.has(key));
      return kept.length === previous.size ? previous : new Map(kept);
    });
    const channels = entries.map(({ key, resolution }) => {
      const channel = createExtractRequest(cache, definition, options, (next) => {
        setStates((previous) => {
          const folded = foldExtractionState(previous.get(key) ?? { status: 'idle' }, next);
          return new Map(previous).set(key, folded);
        });
      });
      channel.request(resolution);
      return channel;
    });
    return () => {
      for (const channel of channels) channel.unsubscribe();
    };
  }, [cache, definition, options, entries]);

  return states;
}

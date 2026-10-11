import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import { ALTERNATE_PLAYBACK_OPTIONS, DEFAULT_PLAYBACK_OPTIONS, playbackOptions, type PlaybackOptions } from './options.ts';

/**
 * 打鍵再生の抽出。再生は打鍵の列と構造解析の結果（Chain・Arpeggio・Redirect・遷移）を読んで
 * 1打鍵ずつ見せるだけなので、新しい指標は作らない。構造解析の結果をそのまま持つ。
 * 構造解析の条件（Chain・Arpeggioの数え方）は条件の実効値から解決済みで、`analysis.aggregate.conditions` に載っている。
 */
export interface PlaybackExtracted {
  readonly analysis: AggregatedAnalysisResult;
  /** 先読みN入力。これから押すキーと入力の履歴の先読み幅に使う */
  readonly windowSize: number;
}

export function computePlaybackExtraction({ analysis, metrics }: { readonly analysis: AggregatedAnalysisResult; readonly metrics: Metrics }): PlaybackExtracted {
  return { analysis, windowSize: metrics.conditions.windowSize };
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const playbackDefinition: SingleAnalyzerDefinition<PlaybackOptions, PlaybackExtracted> = defineSingleAnalyzer({
  id: 'playback',
  options: playbackOptions,
  extract(context: SingleAnalyzerExtractContext<PlaybackOptions>): PlaybackExtracted {
    return computePlaybackExtraction({ analysis: context.analysis, metrics: context.metrics });
  },
  optionsDiscipline: {
    sample: DEFAULT_PLAYBACK_OPTIONS,
    alternates: ALTERNATE_PLAYBACK_OPTIONS,
    context: plainDisciplineContext,
  },
});

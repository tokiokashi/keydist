import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import type { KeyDetails } from '#interpretation/key-detail.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import { DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';

/**
 * ヒートマップの抽出（仕様 §11.10のキーごとの押下数）。
 *
 * 全部のレイヤーとコンボの押下を物理キーで合算した値で、`computeMetrics` の `keyCounts` をそのまま持つ。
 * 押下をレイヤーへ割り振る規則はここに入らない。
 * キーの詳細（仕様 §11.11）は共通の集計（`interpretation/key-detail.ts`）の結果をそのまま持つ。
 */
export interface HeatmapExtracted {
  /** キー押下の総数 */
  readonly presses: number;
  /** キーid → 押下数 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** `keyCounts` の最大値。キーが無ければ0 */
  readonly maxCount: number;
  /** キーの詳細。ツールチップと、キーを選んだ時の小窓が読む */
  readonly keyDetails: KeyDetails;
}

export function computeHeatmapExtraction({ metrics, keyDetails }: { readonly metrics: Metrics; readonly keyDetails: KeyDetails }): HeatmapExtracted {
  return {
    presses: metrics.presses,
    keyCounts: metrics.keyCounts,
    maxCount: Math.max(0, ...metrics.keyCounts.values()),
    keyDetails,
  };
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const heatmapDefinition: SingleAnalyzerDefinition<HeatmapOptions, HeatmapExtracted> = defineSingleAnalyzer({
  id: 'heatmap',
  options: heatmapOptions,
  extract(context: SingleAnalyzerExtractContext<HeatmapOptions>): HeatmapExtracted {
    return computeHeatmapExtraction({ metrics: context.metrics, keyDetails: context.keyDetails() });
  },
  optionsDiscipline: {
    sample: DEFAULT_HEATMAP_OPTIONS,
    alternates: DEFAULT_HEATMAP_OPTIONS,
    context: plainDisciplineContext,
  },
});

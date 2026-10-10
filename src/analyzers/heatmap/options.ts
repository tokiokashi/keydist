import { defineOptions } from '#analyzers/options.ts';

/**
 * ヒートマップAnalyzerの解析設定。設定できる項目は無い。
 * 色は常に線形で決める。計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const heatmapOptions = defineOptions({});

export type HeatmapOptions = typeof heatmapOptions.defaultOptions;

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = heatmapOptions.defaultOptions;

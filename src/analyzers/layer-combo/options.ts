import { defineOptions } from '#analyzers/options.ts';

/**
 * レイヤーとコンボAnalyzerの解析設定。設定できる項目は無い。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const layerComboOptions = defineOptions({});

export type LayerComboOptions = typeof layerComboOptions.defaultOptions;

export const DEFAULT_LAYER_COMBO_OPTIONS: LayerComboOptions = layerComboOptions.defaultOptions;

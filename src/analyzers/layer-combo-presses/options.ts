import { defineOptions } from '#analyzers/options.ts';

/**
 * レイヤーとコンボの押下数Analyzerの解析設定。設定できる項目は無い。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const layerComboPressesOptions = defineOptions({});

export type LayerComboPressesOptions = typeof layerComboPressesOptions.defaultOptions;

export const DEFAULT_LAYER_COMBO_PRESSES_OPTIONS: LayerComboPressesOptions = layerComboPressesOptions.defaultOptions;

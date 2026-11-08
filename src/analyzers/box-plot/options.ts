import { defineOptions } from '#analyzers/options.ts';

/**
 * 箱ひげ図の解析設定。設定できる項目は無い。
 * 見る量は文節ごとの1かな換算の移動距離の1つに絞る。箱の端とひげの端の分位点は定義で固定し、
 * 利用者が割れる項目ではなく、要望の実例も無い（AGENTS.md「設定項目を足すか決める」）。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const boxPlotOptions = defineOptions({});

export type BoxPlotOptions = typeof boxPlotOptions.defaultOptions;

export const DEFAULT_BOX_PLOT_OPTIONS: BoxPlotOptions = boxPlotOptions.defaultOptions;

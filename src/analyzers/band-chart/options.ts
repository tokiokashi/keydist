import { defineOptions } from '#analyzers/options.ts';

/**
 * 帯グラフの解析設定。設定できる項目は無い。
 * 区分の境目は身体・好みで割れるものではなく、要望の実例も無いので固定する（AGENTS.md「設定項目を足すか決める」）。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const bandChartOptions = defineOptions({});

export type BandChartOptions = typeof bandChartOptions.defaultOptions;

export const DEFAULT_BAND_CHART_OPTIONS: BandChartOptions = bandChartOptions.defaultOptions;

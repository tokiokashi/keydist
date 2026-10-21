import { defineOptions } from '#analyzers/options.ts';

/**
 * 解析設定は持たない。上位の一覧の行数や統計の定義は固定で、利用者が選ぶ項目が無い
 * （`AGENTS.md`「設定項目を足すか決める」。要望が出たら足す）。
 */
export const bunsetsuStatsOptions = defineOptions({});

export type BunsetsuStatsOptions = typeof bunsetsuStatsOptions.defaultOptions;

export const DEFAULT_BUNSETSU_STATS_OPTIONS: BunsetsuStatsOptions = bunsetsuStatsOptions.defaultOptions;

import { defineOptions } from '#analyzers/options.ts';

/**
 * 対照テキストとの比較の解析設定。設定できる項目は無い。
 * 種の始まりの値・種の数・測る指標は定義で固定する。割れる人を想像できるが実例が無い項目は、要望が出てから足す
 * （AGENTS.md「設定項目を足すか決める」）。計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、
 * 対象の条件としてペインの見出しの条件から変える。実文も対照テキストも、その条件で測る。
 */
export const controlTextsOptions = defineOptions({});

export type ControlTextsOptions = typeof controlTextsOptions.defaultOptions;

export const DEFAULT_CONTROL_TEXTS_OPTIONS: ControlTextsOptions = controlTextsOptions.defaultOptions;

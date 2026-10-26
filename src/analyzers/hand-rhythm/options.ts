import { defineOptions } from '#analyzers/options.ts';

/**
 * 左右の手の交互Analyzerの解析設定。設定できる項目は無い。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const handRhythmOptions = defineOptions({});

export type HandRhythmOptions = typeof handRhythmOptions.defaultOptions;

export const DEFAULT_HAND_RHYTHM_OPTIONS: HandRhythmOptions = handRhythmOptions.defaultOptions;

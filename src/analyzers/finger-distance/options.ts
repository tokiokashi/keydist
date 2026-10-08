import { defineOptions } from '#analyzers/options.ts';

/**
 * 指ごとの距離Analyzerの解析設定。
 *
 * 持つ項目は無い。指ごとの値は`Metrics`（対象の条件で測った値）から機械的に読み出すもので、
 * 表示の切り替えが要る実例がまだ無いため、先回りして設定を足さない。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件として
 * ペインの見出しの条件から変える。
 */
export const fingerDistanceOptions = defineOptions({});

export type FingerDistanceOptions = typeof fingerDistanceOptions.defaultOptions;

export const DEFAULT_FINGER_DISTANCE_OPTIONS: FingerDistanceOptions = fingerDistanceOptions.defaultOptions;

/** 項目が無いので、既定値と異なる組も空。 */
export const ALTERNATE_FINGER_DISTANCE_OPTIONS: FingerDistanceOptions = {};

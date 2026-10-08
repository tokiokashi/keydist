import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';

/**
 * 指ごとの距離Analyzerの解析設定。表示だけが変わる項目で、抽出の結果は動かない
 * （`affects: 'view'`）。計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、
 * 対象の条件としてペインの見出しの条件から変える。
 *
 * - `chartMetric`: 縦棒グラフで見る量。指ごと（移動距離・押下数）と、隣り合う指の組
 *   （標準偏差・平均・最大）から1つ選ぶ。既定は移動距離
 */
const CHART_METRICS = ['distance', 'presses', 'stdDev', 'mean', 'max'] as const;
export type FingerDistanceChartMetric = (typeof CHART_METRICS)[number];

export const fingerDistanceOptions = defineOptions({
  chartMetric: defineOption<FingerDistanceChartMetric>({
    schema: v.picklist(CHART_METRICS),
    default: 'distance',
    affects: 'view',
    url: picklistUrlCodec('metric', CHART_METRICS),
    label: '見る量',
  }),
});

export type FingerDistanceOptions = typeof fingerDistanceOptions.defaultOptions;

export const DEFAULT_FINGER_DISTANCE_OPTIONS: FingerDistanceOptions = fingerDistanceOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_FINGER_DISTANCE_OPTIONS: FingerDistanceOptions = {
  chartMetric: 'presses',
};

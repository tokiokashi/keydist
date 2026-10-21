import * as v from 'valibot';
import { defineOption, defineOptions, integerUrlCodec, picklistUrlCodec } from '#analyzers/options.ts';
import { DEFAULT_RUN_CHART_METRIC, RUN_CHART_METRIC_IDS, type RunChartMetricId } from './metric-catalog.ts';

/**
 * Run Chartの解析設定。
 *
 * `metric` は縦軸に描く指標（`metric-catalog.ts`）。1枚の図に描く指標は1つにする（単位の違う指標を同じ縦軸に重ねないため）。
 * 抽出は選んだ指標の点だけを作るので `affects: 'extract'`。切り替えても、Traceから作った文字位置ごとの索引は覚えたものを使う。
 *
 * `window` は集計窓の幅 [文字]。各点の値は、その点の文字位置で終わる直近 `window` 文字の範囲の値になる。
 * 文字数で決め、入力の単位（ステップ）の数では決めない。ステップの数は配列で変わり、同じ文字数のテキストを比べられなくなるため。
 * 値が変わるので `affects: 'extract'`。
 */
export const RUN_CHART_WINDOW_MIN = 5;
export const RUN_CHART_WINDOW_MAX = 1000;
export const DEFAULT_RUN_CHART_WINDOW = 50;

export const runChartOptions = defineOptions({
  metric: defineOption<RunChartMetricId>({
    schema: v.picklist(RUN_CHART_METRIC_IDS),
    default: DEFAULT_RUN_CHART_METRIC,
    affects: 'extract',
    url: picklistUrlCodec('metric', RUN_CHART_METRIC_IDS),
    label: '指標',
  }),
  window: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(RUN_CHART_WINDOW_MIN), v.maxValue(RUN_CHART_WINDOW_MAX)),
    default: DEFAULT_RUN_CHART_WINDOW,
    affects: 'extract',
    url: integerUrlCodec('window', RUN_CHART_WINDOW_MIN, RUN_CHART_WINDOW_MAX),
    label: '集計窓',
  }),
});

export type RunChartOptions = typeof runChartOptions.defaultOptions;

export const DEFAULT_RUN_CHART_OPTIONS: RunChartOptions = runChartOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_RUN_CHART_OPTIONS: RunChartOptions = {
  metric: 'sameFingerRate',
  window: 20,
};

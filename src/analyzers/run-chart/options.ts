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

/**
 * `segmentation` は図に区切りを重ねる区切り方。`none` は区切りを使わない（既定。区切りの分割器を読み込まない）。
 * それ以外を選ぶと、文節・固定長・ランダムの3つの区切り方の表を図の下に出し、選んだ区切り方の位置を図に重ねる。
 * 区切りの出どころ（文節の区切り）は器が渡す資産で、解析設定は選択だけを持つ。
 *
 * `seedStart` はランダムの区切りの種の始まりの値 `s`。種は `s, s+1, …, s+19` の20個で固定する。
 * どちらも抽出の中身が変わるので `affects: 'extract'`。
 */
export const RUN_CHART_SEGMENTATION_IDS = ['none', 'bunsetsu', 'fixed', 'random'] as const;
export type RunChartSegmentationId = (typeof RUN_CHART_SEGMENTATION_IDS)[number];
export const DEFAULT_RUN_CHART_SEGMENTATION: RunChartSegmentationId = 'none';

export const RUN_CHART_SEED_MIN = 0;
export const RUN_CHART_SEED_MAX = 1_000_000_000;
export const DEFAULT_RUN_CHART_SEED_START = 1;
export const RUN_CHART_SEED_LABEL = 'ランダムの種の始まり';

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
  segmentation: defineOption<RunChartSegmentationId>({
    schema: v.picklist(RUN_CHART_SEGMENTATION_IDS),
    default: DEFAULT_RUN_CHART_SEGMENTATION,
    affects: 'extract',
    url: picklistUrlCodec('segmentation', RUN_CHART_SEGMENTATION_IDS),
    label: '区切り',
  }),
  seedStart: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(RUN_CHART_SEED_MIN), v.maxValue(RUN_CHART_SEED_MAX)),
    default: DEFAULT_RUN_CHART_SEED_START,
    affects: 'extract',
    url: integerUrlCodec('seed', RUN_CHART_SEED_MIN, RUN_CHART_SEED_MAX),
    label: RUN_CHART_SEED_LABEL,
  }),
});

export type RunChartOptions = typeof runChartOptions.defaultOptions;

export const DEFAULT_RUN_CHART_OPTIONS: RunChartOptions = runChartOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_RUN_CHART_OPTIONS: RunChartOptions = {
  metric: 'sameFingerRate',
  window: 20,
  segmentation: 'bunsetsu',
  seedStart: 7,
};

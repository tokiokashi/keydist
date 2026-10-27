import * as v from 'valibot';
import { booleanUrlCodec, defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import type { BigramSource } from '../bigram-vectors.ts';
import { HEATMAP_DRAW_STYLES, HEATMAP_PALETTES, type HeatmapDrawStyle, type HeatmapPalette } from '../heatmap-figure.ts';

export type { HeatmapDrawStyle, HeatmapPalette };

/** 2打鍵の線の組の種類。続けて打った2打鍵か、同じ手の中で続く2打鍵か。 */
export const HEATMAP_FLOW_SOURCES = ['actual', 'within-hand'] as const satisfies readonly BigramSource[];

/** 線の組の種類の、画面に出す名前。 */
export const HEATMAP_FLOW_SOURCE_LABELS: Readonly<Record<BigramSource, string>> = {
  actual: '続けて打った2打鍵',
  'within-hand': '同じ手の中で続く2打鍵',
};

/**
 * ヒートマップAnalyzerの設定。解析設定の項目は無く、図の表示の項目だけを持つ。
 * 色は常に線形で決める。計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 *
 * - `drawStyle`: 図の描き方。一番上の図と格子の図で同じ描き方にする。表示だけが変わり、抽出は作り直さない
 * - `palette`: 図の配色。単色か多色か。キーの塗りとサーモグラフィの両方に効き、一番上の図と格子の図で同じにする。表示だけが変わる
 * - `flowLines`: 2打鍵の線を重ねて描くか。表示だけが変わる
 * - `flowLineSource`: 線にする2打鍵の組の種類。抽出は2つの組を両方計算しておくので、表示だけが変わる
 */
export const heatmapOptions = defineOptions({
  drawStyle: defineOption<HeatmapDrawStyle>({
    schema: v.picklist(HEATMAP_DRAW_STYLES),
    default: 'fill',
    affects: 'view',
    url: picklistUrlCodec('drawStyle', HEATMAP_DRAW_STYLES),
    label: '描き方',
  }),
  palette: defineOption<HeatmapPalette>({
    schema: v.picklist(HEATMAP_PALETTES),
    default: 'single',
    affects: 'view',
    url: picklistUrlCodec('palette', HEATMAP_PALETTES),
    label: '配色',
  }),
  flowLines: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('flowLines'),
    label: '2打鍵の線',
  }),
  flowLineSource: defineOption<BigramSource>({
    schema: v.picklist(HEATMAP_FLOW_SOURCES),
    default: 'actual',
    affects: 'view',
    url: picklistUrlCodec('flowLineSource', HEATMAP_FLOW_SOURCES),
    label: '線の組',
  }),
});

export type HeatmapOptions = typeof heatmapOptions.defaultOptions;

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = heatmapOptions.defaultOptions;

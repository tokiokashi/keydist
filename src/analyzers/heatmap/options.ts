import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';

/** 図の描き方。キーごとの塗りか、押下の集まりをぼかした熱の塊か。 */
export const HEATMAP_DRAW_STYLES = ['fill', 'blob'] as const;
export type HeatmapDrawStyle = (typeof HEATMAP_DRAW_STYLES)[number];

/**
 * ヒートマップAnalyzerの設定。解析設定の項目は無く、図の表示の項目だけを持つ。
 * 色は常に線形で決める。計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 *
 * - `drawStyle`: 図の描き方。一番上の図と格子の図で同じ描き方にする。表示だけが変わり、抽出は作り直さない
 */
export const heatmapOptions = defineOptions({
  drawStyle: defineOption<HeatmapDrawStyle>({
    schema: v.picklist(HEATMAP_DRAW_STYLES),
    default: 'fill',
    affects: 'view',
    url: picklistUrlCodec('drawStyle', HEATMAP_DRAW_STYLES),
    label: '描き方',
  }),
});

export type HeatmapOptions = typeof heatmapOptions.defaultOptions;

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = heatmapOptions.defaultOptions;

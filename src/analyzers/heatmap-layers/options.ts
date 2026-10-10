import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import type { HeatmapColorScale } from '../heatmap-figure.ts';

/**
 * ヒートマップ（レイヤー）Analyzerの解析設定。どれも表示だけが変わる項目で、抽出の結果は動かない
 * （`affects: 'view'`）。
 *
 * - `colorScale`: 図の色の尺度（仕様 §11.10）
 * - `layerArrangement`: 図の並べ方。`auto` は層が `AUTO_SIDE_BY_SIDE_MAX_LAYERS` 以下なら並置、超えたらタブ
 * - `layerDetail`: 層のまとめ方。配列が層をまとめる表示を宣言している時だけ画面に出る
 * - `activeLayerId`: タブ表示で選んでいる層のid。層の構成は配列ごとに違い、リンクを開いた側に
 *   同じidがあるとは限らないのでURLには載せない。今の配列に無いidの時は最初の層を出す。空文字は未選択
 */
const COLOR_SCALES = ['linear', 'log'] as const satisfies readonly HeatmapColorScale[];

const LAYER_ARRANGEMENTS = ['auto', 'side-by-side', 'tabs'] as const;
export type HeatmapLayerArrangement = (typeof LAYER_ARRANGEMENTS)[number];

const LAYER_DETAILS = ['compact', 'detail'] as const;
export type HeatmapLayerDetail = (typeof LAYER_DETAILS)[number];

/** 並べ方が自動の時に、並置にする層の数の上限。 */
export const AUTO_SIDE_BY_SIDE_MAX_LAYERS = 5;

export const heatmapLayersOptions = defineOptions({
  colorScale: defineOption<HeatmapColorScale>({
    schema: v.picklist(COLOR_SCALES),
    default: 'linear',
    affects: 'view',
    url: picklistUrlCodec('scale', COLOR_SCALES),
    label: '色の尺度',
  }),
  layerArrangement: defineOption<HeatmapLayerArrangement>({
    schema: v.picklist(LAYER_ARRANGEMENTS),
    default: 'auto',
    affects: 'view',
    url: picklistUrlCodec('arrange', LAYER_ARRANGEMENTS),
    label: 'レイヤーの並べ方',
  }),
  layerDetail: defineOption<HeatmapLayerDetail>({
    schema: v.picklist(LAYER_DETAILS),
    default: 'compact',
    affects: 'view',
    url: picklistUrlCodec('layers', LAYER_DETAILS),
    label: 'レイヤーのまとめ方',
  }),
  activeLayerId: defineOption<string>({
    schema: v.string(),
    default: '',
    affects: 'view',
    label: '表示中のタブのレイヤー',
  }),
});

export type HeatmapLayersOptions = typeof heatmapLayersOptions.defaultOptions;

export const DEFAULT_HEATMAP_LAYERS_OPTIONS: HeatmapLayersOptions = heatmapLayersOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_HEATMAP_LAYERS_OPTIONS: HeatmapLayersOptions = {
  colorScale: 'log',
  layerArrangement: 'tabs',
  layerDetail: 'detail',
  activeLayerId: 'layer:左親指',
};

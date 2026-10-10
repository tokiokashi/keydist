import { defineOptions } from '#analyzers/options.ts';
import { layerDetailOption, type LayerDetail } from '#analyzers/layer-detail.ts';

/**
 * キーマップAnalyzerの解析設定。表示だけが変わる項目（`affects: 'view'`）で、テキストにも依らない。
 *
 * - `layerDetail`: キーを選んで出る文字を調べる図のトリガーの色と凡例の、レイヤーのまとめ方。
 *   配列が層をまとめる表示を宣言している時だけ画面に出る
 */
export const keymapOptions = defineOptions({
  layerDetail: layerDetailOption(),
});

export type KeymapOptions = typeof keymapOptions.defaultOptions;

export type KeymapLayerDetail = LayerDetail;

export const DEFAULT_KEYMAP_OPTIONS: KeymapOptions = keymapOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_KEYMAP_OPTIONS: KeymapOptions = {
  layerDetail: 'detail',
};

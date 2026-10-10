import * as v from 'valibot';
import type { CompactLayerViewPresentation, Layout } from '#input/layouts/types.ts';
import { presentationLayersOf } from './heatmap-figure.ts';
import { defineOption, picklistUrlCodec } from './options.ts';

/**
 * レイヤーのまとめ方（「まとめる」と「全レイヤー詳細」）を、配列の宣言から扱う共通の部分。
 * ヒートマップ（レイヤー）とキーマップが同じ宣言・同じ設定項目を使う。
 */

const LAYER_DETAILS = ['compact', 'detail'] as const;
export type LayerDetail = (typeof LAYER_DETAILS)[number];

/** 設定項目の定義。既定はまとめる表示。表示だけが変わる（抽出の結果は動かない）。 */
export function layerDetailOption() {
  return defineOption<LayerDetail>({
    schema: v.picklist(LAYER_DETAILS),
    default: 'compact',
    affects: 'view',
    url: picklistUrlCodec('layers', LAYER_DETAILS),
    label: 'レイヤーのまとめ方',
  });
}

/** 層をまとめる表示を、この配列が宣言しているか。 */
export function compactPresentationOf(layout: Layout): CompactLayerViewPresentation | undefined {
  return layout.layerViewPresentation?.compact;
}

/** 「まとめ」と「詳細」を切り替える意味がある（まとめると層の数が減る）か。 */
export function canToggleLayerDetail(layout: Layout): boolean {
  const compact = compactPresentationOf(layout);
  return compact !== undefined && presentationLayersOf(layout).length > compact.keepLayerIds.length;
}

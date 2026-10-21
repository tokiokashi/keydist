import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` が名前だけを読むため）。
 */
export const BUNSETSU_STATS_PANE_META = {
  name: '文節の中と境目',
  description:
    'テキストを文節に区切り、文節の中の文字と文節の境目の文字に分けて、指の移動距離の平均やばらつきを配列ごとに表で並べます。日本語のテキストでだけ値を出します。',
  /** 列が多く横に並ぶので、他より広く取る。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;

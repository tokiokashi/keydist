/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` が名前だけを読むため）。
 */
export const RUN_CHART_PANE_META = {
  name: 'Run Chart',
  description:
    'テキスト上の位置を横軸に、直近の文字範囲ごとの指標の推移を対象ごとの折れ線で描きます。値が全体を通して高いのか、特定の箇所でだけ上がるのかを見分けられます。',
  /** 本体の縦の下限 [rem]。図と凡例が収まる高さ。 */
  minBodyHeightRem: 16,
} as const;

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * `definition.tsx`（本体・解析設定のcomponentとCSSを持つ）から分けて置くのは、routeの`<title>`が
 * 名前を読むためだけに`definition.tsx`をimportすると、Analyzerのcomponent・CSS・描画ライブラリが
 * 全ページの初期読み込みに入ってしまうため。ここはReactにもCSSにも依存させない。
 */
export const N_SENSITIVITY_PANE_META = {
  name: 'N感度',
  description: '先読みする入力の数N（0〜10）を変えた時に、総移動距離がどう変わるかを対象ごとの折れ線で描く。',
  // 本体の縦の下限は宣言しない（既定の12rem）。図の下限（8.5rem）と畳んだ表の見出しを足した高さは、既定の窓より低い。
} as const;

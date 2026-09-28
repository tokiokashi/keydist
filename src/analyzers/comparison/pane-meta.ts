/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * `definition.tsx`（本体・解析設定のcomponentとCSSを持つ）から分けて置くのは、routeの`<title>`が
 * 名前を読むためだけに`definition.tsx`をimportすると、Analyzerのcomponent・CSS・描画ライブラリが
 * 全ページの初期読み込みに入ってしまうため。ここはReactにもCSSにも依存させない。
 */
export const COMPARISON_PANE_META = {
  name: '比較表',
  description: '選んだ配列やSetupで同じテキストを打った時の、指の移動距離などの数値を表に並べる。基準を選ぶと、基準に対する割合も出せる。',
} as const;

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
  /**
   * 本体の縦の下限 [rem]。ペインを足した時の既定の高さを決める値。12列×9升で測ると、サンプルと同じ7件は
   * 1920・1440（サイドバー固定・非固定）とも、図・凡例・畳んだ表の見出しが本体に収まる。17件は1440で本体の中で
   * スクロールする（固定で281 / 250、非固定で265 / 250）。図の領域の下限（8.5rem）より高く取る。
   */
  minBodyHeightRem: 13.6,
} as const;

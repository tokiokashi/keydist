/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * `definition.tsx`（本体・解析設定のcomponentとCSSを持つ）から分けて置くのは、routeの`<title>`が
 * 名前を読むためだけに`definition.tsx`をimportすると、Analyzerのcomponent・CSS・描画ライブラリが
 * 全ページの初期読み込みに入ってしまうため。ここはReactにもCSSにも依存させない。
 */
export const BIGRAM_FLOW_PANE_META = {
  name: 'Bigram Flow',
  description: '続けて打つ2打鍵で、指がキーボード上をどう動くかを描きます。キー間の流れと、手ごとの移動の向きと距離の分布を並べます。',
  /**
   * 本体の縦の下限 [rem]。Keyboard Flowの図（横長）とRelative vectorsの正方形が、縦に積んでも図として読める高さ
   * （`bigram-vector-view.css` のWorkspace用の `.flow-feature` の `min-height` と同じ値）。
   */
  minBodyHeightRem: 26,
} as const;

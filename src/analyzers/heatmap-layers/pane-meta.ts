/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const HEATMAP_LAYERS_PANE_META = {
  name: 'レイヤー別ヒートマップ',
  description: '同じテキストを打った時の、キーごとの押下数を、レイヤー別の配列図に色で出します。色は、レイヤーを切り替えるために押したキーを除いた押下数で決め、全部のレイヤーで最大値をそろえています。',
  /** 見出しの行と図1枚が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 14,
} as const;

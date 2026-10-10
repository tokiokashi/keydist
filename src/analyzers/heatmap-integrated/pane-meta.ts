/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const HEATMAP_INTEGRATED_PANE_META = {
  name: '統合ヒートマップ',
  description: '同じテキストを打った時の、キーごとの押下数を、全部のレイヤーを合わせた配列図に色で出します。色は押下数に比例します。',
} as const;

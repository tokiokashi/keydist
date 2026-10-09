/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const HEATMAP_PANE_META = {
  name: 'ヒートマップ',
  description: '同じテキストを打った時の、キーごとの押下数を配列の図に色で出します。全部のレイヤーを合わせた図と、レイヤー別の図を見られます。',
  /** 図が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 31,
} as const;

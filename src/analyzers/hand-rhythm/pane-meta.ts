/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const HAND_RHYTHM_PANE_META = {
  name: '左右の手の交互',
  description: '同じテキストを打った時の、手の切り替えと同じ手の続きの数、交互打鍵の連続の数と長さを出します。連続の長さごとの分布も見られます。',
  /** 値の一覧と2つの分布が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 28,
} as const;

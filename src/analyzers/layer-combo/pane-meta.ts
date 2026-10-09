/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const LAYER_COMBO_PANE_META = {
  name: 'レイヤーとコンボ',
  description: '同じテキストを打った時の押下が、どのレイヤーとコンボに帰属したかを表で出します。配列が持つ修飾、コンボの一覧、コンボの配列図も見られます。',
  /** 表と図が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 24,
} as const;

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const LAYER_COMBO_PRESSES_PANE_META = {
  name: 'レイヤーとコンボの押下数',
  description: '同じテキストを打った時の押下数を、レイヤーとコンボごとに、全体に対する割合と合わせて表で出します。',
} as const;

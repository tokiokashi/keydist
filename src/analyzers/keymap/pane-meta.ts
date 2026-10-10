/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const KEYMAP_PANE_META = {
  name: 'キーマップ',
  description: '配列の修飾、キーを選んで出る文字、コンボの一覧と配列図を出します。テキストには依りません。',
  /** 図と表が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 24,
} as const;

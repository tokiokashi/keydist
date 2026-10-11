/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const PLAYBACK_PANE_META = {
  name: '打鍵再生',
  description: '同じテキストを打つ様子を、配列図の上で1打鍵ずつ再生します。指の位置、これから押すキー、押したキーの履歴、入力の進み方を重ねて見られます。',
  /** 操作・状態の行と配列図が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 22,
} as const;

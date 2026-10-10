/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const HEATMAP_PANE_META = {
  name: 'ヒートマップ',
  description: '同じテキストを打った時の、キーごとの押下数を、全部のレイヤーを合わせた配列図に色で出します。色は押下数に比例します。',
} as const;

/**
 * 単体の画面でMultiの集合の対象の図を並べる間の、ペインの推奨幅 [rem]。
 * 図1枚の幅（約28rem）を4列並べても収まる広さ。Workspaceのペインの推奨幅（既定）は変えない。
 */
export const HEATMAP_STANDALONE_SET_TARGETS_WIDTH_REM = 96;

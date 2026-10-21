/**
 * 複数のAnalyzerが縦軸に描く指標のうち、名前と単位が同じ指標の表示の文字。
 * 値の定義は `interpretation/` が持ち、ここは画面に出す文字だけを持つ（Analyzerどうしは互いをimportできないので、ここに置く）。
 */
export const SHARED_METRIC_TEXT = {
  perCharUnits: { label: '1文字あたりの距離', unit: 'u/文字' },
  meanPerStroke: { label: '1打鍵あたりの距離', unit: 'u/打鍵' },
  sameFingerRate: { label: '同指率', unit: '%' },
} as const;

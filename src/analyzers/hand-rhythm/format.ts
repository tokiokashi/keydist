/** 割合（0〜1）を百分率で出す。 */
export const formatRate = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** 平均の長さ（打鍵数）。連続が0件の時は値が無いので「—」。 */
export const formatMeanLength = (mean: number, runs: number): string => (runs === 0 ? '—' : `${mean.toFixed(2)}打鍵`);

/** 同じ手の続きの割合。分母（切り替え + 続き）が0の時は値が無いので「—」。 */
export const formatContinuationRate = (rate: number, switches: number, continuations: number): string =>
  switches + continuations === 0 ? '—' : formatRate(rate);

/** 組全体に占める割合。組が0の時は「—」。 */
export const formatShareOf = (part: number, whole: number): string => (whole === 0 ? '—' : formatRate(part / whole));

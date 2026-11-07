/** 割合（0〜1）を百分率で出す。 */
export const formatRate = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** 平均の長さ（アクション数）。連続が0件の時は値が無いので「—」。 */
export const formatMeanLength = (mean: number, runs: number): string => (runs === 0 ? '—' : `${mean.toFixed(2)}アクション`);

/** 手の切り替えと同じ手の続きの回数。両手のアクションを含む組を手ごとに0.5ずつ数えるので、常に小数第1位まで出す。 */
export const formatTurnCount = (value: number): string => value.toFixed(1);

/** 同じ手が続く割合。分母（切り替え + 続き）が0の時は値が無いので「—」。 */
export const formatContinuationRate = (rate: number, switches: number, continuations: number): string =>
  switches + continuations === 0 ? '—' : formatRate(rate);

/** 組全体に占める割合。組が0の時は「—」。 */
export const formatShareOf = (part: number, whole: number): string => (whole === 0 ? '—' : formatRate(part / whole));

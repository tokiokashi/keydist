/** 押下数の全体に対する割合の表示。全体が0なら0.0%。 */
export function attributionShare(presses: number, total: number): string {
  return `${total === 0 ? '0.0' : ((presses / total) * 100).toFixed(1)}%`;
}

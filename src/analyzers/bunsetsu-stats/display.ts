/**
 * 文節の中と境目の統計の、数字と文字列の書式。抽出の値を文字にするだけで、計算し直さない。
 */

/** 値が決まらない時のセルの文字。 */
export const EMPTY_CELL_TEXT = '—';

/** 距離 [u] と1文字あたりの距離 [u/文字] の小数桁。比較表などと同じ。 */
export const DISTANCE_DIGITS = 3;

export function distanceText(value: number | undefined): string {
  return value === undefined ? EMPTY_CELL_TEXT : value.toFixed(DISTANCE_DIGITS);
}

export function percentText(value: number | undefined): string {
  return value === undefined ? EMPTY_CELL_TEXT : `${(value * 100).toFixed(1)}%`;
}

export function countText(value: number | undefined): string {
  return value === undefined ? EMPTY_CELL_TEXT : String(value);
}

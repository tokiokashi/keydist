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

/**
 * 改行・空白・タブなど、そのまま出すと見えない文字を、読める記号にして文字列を出す。
 * 改行は `↵`、空白（半角・全角）は `␣`、タブは `⇥`。ほかの文字は変えない。
 */
export function visibleText(text: string): string {
  return text
    .replaceAll(/\r\n|[\r\n]/gu, '↵')
    .replaceAll(/[ 　]/gu, '␣')
    .replaceAll('\t', '⇥');
}

/** 見えない文字を表す記号の説明。一覧の注に出す。 */
export const VISIBLE_TEXT_NOTE = '改行は↵、空白は␣、タブは⇥で表します。';

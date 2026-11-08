/**
 * 見えない文字を読める記号にして出す書式。文節ごとの統計と帯グラフが同じ記号と説明を使う。
 */

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

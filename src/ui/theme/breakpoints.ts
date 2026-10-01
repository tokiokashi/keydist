/**
 * スマホ幅の境目（px）。見出しを1行にする・サイドバーを引き出しにする・Workspaceのペインを縦に積む・
 * 解析設定と対象の選択を下からのシートにする、はすべてこの幅で切り替える。
 *
 * JSはここから `MOBILE_QUERY` を作る。CSSの `@media` には変数が使えないので `760px` と直接書き、
 * 値の一致は `breakpoints.test.ts` が検査する（CSSに別の値を書くと落ちる）。値を変える時はここと、
 * そのテストが落とすCSSを同時に直す。
 */
export const MOBILE_MAX_WIDTH = 760;

/** スマホ幅かを `window.matchMedia` で問う文字列。 */
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

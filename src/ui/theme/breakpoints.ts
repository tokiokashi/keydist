/**
 * スマホ幅の境目（px）。見出しを1行にする・サイドバーを引き出しにする・Workspaceのペインを縦に積む・
 * 解析設定と対象の選択を下からのシートにする、はすべてこの幅で切り替える。
 *
 * JSはここから `MOBILE_QUERY` を作る。CSSの `@media` には変数が使えないので `760px` と直接書く。
 * `breakpoints.test.ts` は、CSSの `@media` の幅の条件が `(max-width: 760px)` の形か、理由付きで
 * 許した別の幅のどちらかであること、TSがこのファイルの外で幅の問い合わせを書かないことを検査する。
 * 値を変える時はここと、そのテストが落とすCSSを同時に直す。
 */
export const MOBILE_MAX_WIDTH = 760;

/** スマホ幅かを `window.matchMedia` で問う文字列。 */
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

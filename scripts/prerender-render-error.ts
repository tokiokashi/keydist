/**
 * prerenderで描画中に例外が起きたページを見つける。
 *
 * Reactのサーバー描画は、例外を投げたSuspense境界を `<!--$!-->` で出し、その中身を空にする
 * （ブラウザが描き直す前提の枠）。フレームワークは例外をログに出すだけで、応答は200のまま、
 * 本文の無いHTMLが書き出される。prerenderの `failOnError` は、ページの処理が投げた例外を
 * 待たずに捨てるため、ビルドは失敗しない。そこでビルドの後に出力のHTMLを見て止める
 * （`scripts/check-prerender-render.ts`）。
 */
export const RENDER_ERROR_MARKER = '<!--$!-->';

/** 描画中に例外が起きたページのパスを返す。`pages` は出力ファイルのパスと中身の組。 */
export function renderErrorPages(pages: readonly { readonly path: string; readonly html: string }[]): string[] {
  return pages.filter((page) => page.html.includes(RENDER_ERROR_MARKER)).map((page) => page.path);
}

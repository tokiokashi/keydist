/**
 * 行ごとに名前と図形を並べる図（帯グラフ・箱ひげ図）が共有する、文字の寸法の見積もり。
 * 画面に依存しない純粋な関数と定数だけを持つ。
 */

/** 図の文字の大きさ [px]。 */
export const FONT_SIZE = 12;
/** 名前を図形の左に置く最小の幅 [px]。これより狭い領域では、名前を図形の上の行に置く。 */
export const INLINE_MIN_WIDTH = 480;
/** 図の左右の余白 [px]。画像にした時に、名前と図形が縁に接しないようにする。 */
export const FIGURE_INSET = 4;

/** 文字列の幅の見積もり [px]。全角の字は1em、それ以外は0.6em。 */
export function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const wide = code >= 0x1100 && !(code >= 0xff61 && code <= 0xff9f);
    width += (wide ? 1 : 0.6) * fontSize;
  }
  return width;
}

/** 名前を `maxWidth` に収める。収まらない時は末尾を「…」に替える。 */
export function fitLabel(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  const characters = [...text];
  while (characters.length > 0 && textWidth(`${characters.join('')}…`, fontSize) > maxWidth) characters.pop();
  return `${characters.join('')}…`;
}

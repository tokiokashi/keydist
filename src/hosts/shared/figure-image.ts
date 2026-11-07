import type { FigureImageReadout, FigureImageSource } from '#analyzers/pane-parts.tsx';

/**
 * 画面に描いたSVGの図と、その下のキャプションを1枚のPNGにして、クリップボードへ書く。
 * クリップボードに触る処理と、要素を画像にする処理はホストが持つ（Analyzerの本体は触らない）。
 * 図の座標は計算し直さず、画面のSVGを複製して使う。文書のCSSはSVGを画像にする経路に届かないので、
 * 複製を文書に置いて計算済みの値を読み、複製の各要素のstyleへ写す。
 */

/** 画像の1ピクセルあたりのSVG座標の細かさ。画面の大きさに依らず、SVGの座標の2倍のピクセルにする。 */
const PIXEL_RATIO = 2;
/**
 * 画面の1pxがSVG座標のいくつにあたるか。軸の名前（SVGの座標で11）が1280pxの画面で約13pxになる比。
 * キャプションなどSVGの外の文字の大きさを、この比でSVGの座標に直す。
 */
const UNITS_PER_PX = 11 / 13;
/** キャプションの文字の大きさ。軸の名前（SVGの座標で11）の16/13倍。 */
const CAPTION_FONT_SIZE = (11 * 16) / 13;
const CAPTION_LINE_HEIGHT = 1.5;
const CAPTION_GAP = 8 * UNITS_PER_PX;
const READOUT_GAP = 4 * UNITS_PER_PX;
const BOTTOM_PADDING = 6;
/** 読み取りの行の左の余白。画像の縁に印が接しないようにする。 */
const READOUT_INSET = 6;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** どの要素でも写す、描画に効く性質。 */
const GRAPHIC_PROPERTIES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'opacity',
  'paint-order',
] as const;

/** 文字の要素だけに写す性質。 */
const TEXT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric', 'text-anchor'] as const;

/** 図をPNGにしてクリップボードへ書く。書けたら`true`。ブラウザが受け付けない・クリップボードが無い・画像にできない時は`false`。 */
export async function copyFigureImage(source: FigureImageSource): Promise<boolean> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined || typeof ClipboardItem === 'undefined') return false;
  try {
    // 利用者の操作の中で書き込みを始めるため、画像は`Promise`のまま渡す
    await clipboard.write([new ClipboardItem({ 'image/png': renderFigurePng(source) })]);
    return true;
  } catch {
    return false;
  }
}

async function renderFigurePng(source: FigureImageSource): Promise<Blob> {
  const markup = composeMarkup(source);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = markup.pixelWidth;
  canvas.height = markup.pixelHeight;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('canvasを作れません');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error('PNGにできません')) : resolve(blob)), 'image/png');
  });
}

interface Markup {
  readonly svg: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

function composeMarkup({ svg: liveSvg, caption: liveCaption, readout }: FigureImageSource): Markup {
  const viewBox = liveSvg.viewBox.baseVal;
  const width = viewBox.width;
  const figureHeight = viewBox.height;

  const captionStyle = getComputedStyle(liveCaption);
  const caption = {
    text: liveCaption.textContent ?? '',
    color: captionStyle.color,
    weight: captionStyle.fontWeight,
    family: captionStyle.fontFamily,
  };
  const captionLines = wrapText(caption.text, `${caption.weight} ${CAPTION_FONT_SIZE}px ${caption.family}`, width);
  const captionHeight = captionLines.length * CAPTION_FONT_SIZE * CAPTION_LINE_HEIGHT;

  const chunks: string[] = [];
  let y = figureHeight + CAPTION_GAP;
  chunks.push(
    captionLines
      .map(
        (line, index) =>
          `<text x="${width / 2}" y="${y + (index + 0.5) * CAPTION_FONT_SIZE * CAPTION_LINE_HEIGHT}" text-anchor="middle" dominant-baseline="central" fill="${escapeAttribute(caption.color)}" font-family="${escapeAttribute(caption.family)}" font-size="${CAPTION_FONT_SIZE}" font-weight="${escapeAttribute(caption.weight)}">${escapeText(line)}</text>`,
      )
      .join(''),
  );
  y += captionHeight;

  if (readout !== undefined) {
    const block = readoutMarkup(readout, width, y + READOUT_GAP);
    chunks.push(block.markup);
    y += READOUT_GAP + block.height;
  }

  const totalHeight = y + BOTTOM_PADDING;
  const pixelWidth = Math.round(width * PIXEL_RATIO);
  const pixelHeight = Math.round(totalHeight * PIXEL_RATIO);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${totalHeight}">` +
    `<rect width="${width}" height="${totalHeight}" fill="${escapeAttribute(backgroundColor())}"/>` +
    figureMarkup(liveSvg, width, figureHeight) +
    chunks.join('') +
    '</svg>';
  return { svg, pixelWidth, pixelHeight };
}

/** ペインの背景の色（`var(--bg)`）。 */
function backgroundColor(): string {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;background-color:var(--bg)';
  document.body.append(probe);
  try {
    return getComputedStyle(probe).backgroundColor;
  } finally {
    probe.remove();
  }
}

/**
 * 画面のSVGの複製に、計算済みの描画の値を書き込んだ文字列。
 * 複製は文書の中に置いてから読む。ポインターを重ねた・フォーカスした状態の印（`data-active`）は外し、
 * 留めた点（`data-pinned`）の見た目だけを残す。点の位置は`style`の`transform`（動き終えた位置）をそのまま使う。
 */
function figureMarkup(liveSvg: SVGSVGElement, width: number, height: number): string {
  const clone = liveSvg.cloneNode(true) as SVGSVGElement;
  for (const element of clone.querySelectorAll('[data-active]')) element.removeAttribute('data-active');
  for (const element of clone.querySelectorAll('[tabindex]')) element.removeAttribute('tabindex');
  clone.removeAttribute('class');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${liveSvg.getBoundingClientRect().width}px;pointer-events:none`;
  holder.append(clone);
  document.body.append(holder);
  try {
    for (const element of clone.querySelectorAll<SVGElement>('*')) {
      const computed = getComputedStyle(element);
      const properties =
        element instanceof SVGTextElement || element instanceof SVGTSpanElement ? [...GRAPHIC_PROPERTIES, ...TEXT_PROPERTIES] : GRAPHIC_PROPERTIES;
      for (const property of properties) element.style.setProperty(property, computed.getPropertyValue(property));
    }
    return new XMLSerializer().serializeToString(clone);
  } finally {
    holder.remove();
  }
}

/** 留めた点の読み取りの行。画面と同じく、行の頭に印を付ける。 */
function readoutMarkup(readout: FigureImageReadout, width: number, top: number): { readonly markup: string; readonly height: number } {
  const textElement = readout.text;
  const textStyle = getComputedStyle(textElement);
  const fontSize = Number.parseFloat(textStyle.fontSize) * UNITS_PER_PX;
  const lineHeight = fontSize * CAPTION_LINE_HEIGHT;
  const mark = readout.mark;
  const markStyle = mark === null ? undefined : getComputedStyle(mark);
  const markDiameter = markStyle === undefined ? 0 : Number.parseFloat(markStyle.width) * UNITS_PER_PX;
  const indent = READOUT_INSET + (markStyle === undefined ? 0 : markDiameter + Number.parseFloat(getComputedStyle(readout.row).columnGap) * UNITS_PER_PX);
  const lines = wrapText(textElement.textContent ?? '', `${textStyle.fontWeight} ${fontSize}px ${textStyle.fontFamily}`, width - indent);
  const height = lines.length * lineHeight;

  let markup = '';
  if (markStyle !== undefined) {
    const border = Number.parseFloat(markStyle.borderTopWidth) * UNITS_PER_PX;
    markup += `<circle cx="${READOUT_INSET + markDiameter / 2}" cy="${top + lineHeight / 2}" r="${(markDiameter - border) / 2}" fill="${escapeAttribute(markStyle.backgroundColor)}" stroke="${escapeAttribute(markStyle.borderTopColor)}" stroke-width="${border}"/>`;
  }
  markup += lines
    .map(
      (line, index) =>
        `<text x="${indent}" y="${top + (index + 0.5) * lineHeight}" dominant-baseline="central" fill="${escapeAttribute(textStyle.color)}" font-family="${escapeAttribute(textStyle.fontFamily)}" font-size="${fontSize}" font-weight="${escapeAttribute(textStyle.fontWeight)}" font-variant-numeric="tabular-nums">${escapeText(line)}</text>`,
    )
    .join('');
  return { markup, height };
}

/** 文字列を、幅に収まるように文字の単位で折り返す。 */
function wrapText(text: string, font: string, maxWidth: number): readonly string[] {
  const context = document.createElement('canvas').getContext('2d');
  if (context === null) return [text];
  context.font = font;
  const lines: string[] = [];
  let current = '';
  for (const character of text) {
    if (current !== '' && context.measureText(current + character).width > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  lines.push(current);
  return lines;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

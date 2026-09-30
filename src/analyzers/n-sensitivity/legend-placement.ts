/**
 * N感度の凡例を、図の中のどこに置くか（#806）。
 *
 * 論文の図のように、プロット領域の余白へ枠を置く。線の実際の位置から空きを調べるので、
 * 図の形（対象の数・値の範囲・縦軸の決め方・図の大きさ）が変わっても線に重ならない。
 *
 * 隅の候補の順は、左下・右上を先に置く。N感度の線は、Nを増やしても距離が増えない（spec §7 R4:
 * 残る場合とホームへ戻る場合の小さい方を採り、Nが大きいほど候補が増える）ので、左上（N=0）から右下へ
 * 下がる。このため左下（Nが小さく値が低い所）と右上（Nが大きく値が高い所）が空く。
 * ただし傾きが無い線（Nを増やしても距離が変わらない）は右上を通り、値の幅が狭い相対表示の
 * 右上は狭いので、空いているかは形から決める。
 *
 * 試す順: 四隅（1列→2列）→ 辺の中央（1列→2列）。どれも、枠が
 * プロット領域に収まり、線と交わらないものだけを採る。1つも無ければ、プロット領域の下
 * （軸の見出しの下）に、幅に収まる列数で並べる。線を隠すより、図が少し高くなる方を選ぶ。
 *
 * ReactにもDOMにも依存しない純粋な計算。文字の幅は、呼び出し側が測った値を渡す。
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type LegendAnchor =
  | 'bottom-left' | 'top-right' | 'bottom-right' | 'top-left'
  | 'right-middle' | 'left-middle' | 'top-center' | 'bottom-center';
export type LegendCorner = LegendAnchor | 'below';

const CORNERS: readonly LegendAnchor[] = ['bottom-left', 'top-right', 'bottom-right', 'top-left'];
const MIDDLES: readonly LegendAnchor[] = ['right-middle', 'left-middle', 'top-center', 'bottom-center'];
const COLUMN_CANDIDATES = [1, 2] as const;

export const LEGEND_FONT_SIZE = 11;
export const LEGEND_ROW_HEIGHT = 16;
export const LEGEND_PADDING = 6;
/** 見本（短い線と点）の幅と、見本と名前の間隔。 */
export const LEGEND_SWATCH_WIDTH = 16;
export const LEGEND_SWATCH_GAP = 6;
const LEGEND_COLUMN_GAP = 12;
/** プロット領域の縁から凡例の枠までの間隔。 */
const CORNER_INSET = 6;
/** 線の太さや点の半径ぶん、線から枠を離す距離。 */
const LINE_CLEARANCE = 5;
/** 1つの名前に使う幅の目安。これを超えたら中央を「…」で省く。 */
export const LEGEND_MAX_LABEL_WIDTH = 120;
/** 名前の幅の測り誤差に備える余裕。 */
const MEASURE_SLACK = 2;

/** 文字の幅を返す関数。ブラウザでは実際のフォントで測った値を渡す。 */
export type MeasureText = (text: string) => number;

/**
 * フォントを測れない時（描画前・サーバー側）の見積もり。全角は文字サイズいっぱい、半角は
 * 0.72倍。英大文字が幅広いので、小文字だけの名前では大きめに出る（足りないより余る方を選ぶ）。
 */
export function estimateTextWidth(text: string, fontSize = LEGEND_FONT_SIZE): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) > 0x7f ? fontSize : fontSize * 0.72;
  return width;
}

const ELLIPSIS = '…';

/** 名前を`maxWidth`に収める。収まらなければ、先頭と末尾を残して中央を「…」で省く。 */
export function elideMiddle(text: string, maxWidth: number, measure: MeasureText = estimateTextWidth): string {
  if (measure(text) <= maxWidth) return text;
  const chars = [...text];
  for (let keep = chars.length - 1; keep >= 2; keep -= 1) {
    const head = Math.ceil(keep / 2);
    const tail = keep - head;
    const candidate = `${chars.slice(0, head).join('')}${ELLIPSIS}${chars.slice(chars.length - tail).join('')}`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return `${chars[0]}${ELLIPSIS}`;
}

/** すべての名前が共有する先頭・末尾の文字数（文字単位）。1件だけなら0。 */
function sharedAffixLengths(labels: readonly string[]): { prefix: number; suffix: number } {
  if (labels.length < 2) return { prefix: 0, suffix: 0 };
  const chars = labels.map((label) => [...label]);
  const shortest = Math.min(...chars.map((c) => c.length));
  let prefix = 0;
  while (prefix < shortest - 1 && chars.every((c) => c[prefix] === chars[0]![prefix])) prefix += 1;
  let suffix = 0;
  while (suffix < shortest - 1 - prefix && chars.every((c) => c[c.length - 1 - suffix] === chars[0]![chars[0]!.length - 1 - suffix])) suffix += 1;
  return { prefix, suffix };
}

/** 共有する部分（先頭・末尾）を先に「…」へ替え、それでも長ければ中央を省く。区別の部分を残すため。 */
function shortenLabel(label: string, cap: number, measure: MeasureText, shared: { prefix: number; suffix: number }): string {
  if (measure(label) <= cap) return label;
  const chars = [...label];
  const minRun = 3;
  const dropPrefix = shared.prefix >= minRun ? shared.prefix : 0;
  const dropSuffix = shared.suffix >= minRun ? shared.suffix : 0;
  if (dropPrefix > 0) {
    const candidate = `${ELLIPSIS}${chars.slice(dropPrefix).join('')}`;
    if (measure(candidate) <= cap) return candidate;
  }
  if (dropPrefix > 0 || dropSuffix > 0) {
    const inner = chars.slice(dropPrefix, chars.length - dropSuffix).join('');
    const candidate = `${dropPrefix > 0 ? ELLIPSIS : ''}${inner}${dropSuffix > 0 ? ELLIPSIS : ''}`;
    if (measure(candidate) <= cap) return candidate;
    return elideMiddle(candidate, cap, measure);
  }
  return elideMiddle(label, cap, measure);
}

/**
 * 凡例に出す名前をそろえて省く。**省いた後も、別の対象が同じ名前にならない**ことを保証する
 * （元の名前が互いに異なる限り）。全対象が共有する先頭・末尾を先に省いて区別の部分を残し、
 * それでも足りなければ中央を省く。区別の部分が落ちて衝突する時は、上限の幅を広げて省き直し、
 * `hardMax`まで広げても衝突するなら省かない。`hardMax`は図の幅に収まる名前の幅の上限で、
 * 全文がそれを超える時だけ、`hardMax`で省いた名前（衝突しうる）を返す。
 * 完全な名前は、凡例の項目のhover（`<title>`）に別に出す。
 */
export function fitLabels(
  labels: readonly string[],
  measure: MeasureText = estimateTextWidth,
  maxWidth = LEGEND_MAX_LABEL_WIDTH,
  hardMax = maxWidth,
): string[] {
  const upper = Math.max(maxWidth, hardMax);
  const shared = sharedAffixLengths(labels);
  for (let cap = maxWidth; cap <= upper; cap += 20) {
    const fitted = labels.map((label) => shortenLabel(label, cap, measure, shared));
    if (new Set(fitted).size === new Set(labels).size) return fitted;
  }
  if (labels.every((label) => measure(label) <= upper)) return [...labels];
  return labels.map((label) => shortenLabel(label, upper, measure, shared));
}

export interface LegendPlacement {
  readonly corner: LegendCorner;
  readonly columns: number;
  readonly rows: number;
  /** 1列の幅（見本＋名前の最大幅）。 */
  readonly columnWidth: number;
  readonly rect: Rect;
  /** 枠と交わった線分の数。0なら線に重ならない（`below`は常に0）。 */
  readonly overlaps: number;
}

function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

/** 線分が矩形（縁を含む）と交わるか。Liang–Barskyの線分クリップ。 */
export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rect.x, rect.x + rect.width - a.x, a.y - rect.y, rect.y + rect.height - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i]! < 0) return false;
    } else {
      const t = q[i]! / p[i]!;
      if (p[i]! < 0) {
        if (t > t1) return false;
        t0 = Math.max(t0, t);
      } else {
        if (t < t0) return false;
        t1 = Math.min(t1, t);
      }
    }
  }
  return true;
}

function countOverlaps(lines: readonly (readonly Point[])[], rect: Rect): number {
  const zone = inflate(rect, LINE_CLEARANCE);
  let count = 0;
  for (const line of lines) {
    if (line.length === 1 && segmentIntersectsRect(line[0]!, line[0]!, zone)) count += 1;
    for (let i = 1; i < line.length; i += 1) {
      if (segmentIntersectsRect(line[i - 1]!, line[i]!, zone)) count += 1;
    }
  }
  return count;
}

function anchorRect(anchor: LegendAnchor, plot: Rect, width: number, height: number): Rect {
  const left = plot.x + CORNER_INSET;
  const right = plot.x + plot.width - CORNER_INSET - width;
  const top = plot.y + CORNER_INSET;
  const bottom = plot.y + plot.height - CORNER_INSET - height;
  const centerX = plot.x + (plot.width - width) / 2;
  const centerY = plot.y + (plot.height - height) / 2;
  switch (anchor) {
    case 'bottom-left': return { x: left, y: bottom, width, height };
    case 'top-right': return { x: right, y: top, width, height };
    case 'bottom-right': return { x: right, y: bottom, width, height };
    case 'top-left': return { x: left, y: top, width, height };
    case 'right-middle': return { x: right, y: centerY, width, height };
    case 'left-middle': return { x: left, y: centerY, width, height };
    case 'top-center': return { x: centerX, y: top, width, height };
    case 'bottom-center': return { x: centerX, y: bottom, width, height };
  }
}

/** プロット領域の下に置く時の、置いてよい場所（左上の座標と幅）。 */
export interface BelowArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * `plot`はプロット領域、`lines`は各系列の折れ線の頂点（プロット領域と同じ座標系）、
 * `labels`は凡例に出す名前（`fitLabels`で省いた後のもの）、`below`は逃げ場（プロット領域の下）。
 */
export function placeLegend(
  plot: Rect,
  lines: readonly (readonly Point[])[],
  labels: readonly string[],
  measure: MeasureText,
  below: BelowArea,
): LegendPlacement {
  const itemWidth = LEGEND_SWATCH_WIDTH + LEGEND_SWATCH_GAP
    + Math.max(0, ...labels.map((label) => measure(label))) + MEASURE_SLACK;
  const boxWidth = (columns: number) => LEGEND_PADDING * 2 + columns * itemWidth + (columns - 1) * LEGEND_COLUMN_GAP;

  for (const anchors of [CORNERS, MIDDLES]) {
    for (const columns of COLUMN_CANDIDATES) {
      if (columns > 1 && labels.length < columns) break;
      const rows = Math.ceil(labels.length / columns);
      const width = boxWidth(columns);
      const height = LEGEND_PADDING * 2 + rows * LEGEND_ROW_HEIGHT;
      // プロット領域に収まらない大きさの枠は、どの隅でも置けない
      if (width > plot.width - CORNER_INSET * 2 || height > plot.height - CORNER_INSET * 2) continue;
      for (const anchor of anchors) {
        const rect = anchorRect(anchor, plot, width, height);
        if (countOverlaps(lines, rect) === 0) return { corner: anchor, columns, rows, columnWidth: itemWidth, rect, overlaps: 0 };
      }
    }
  }

  const columns = Math.max(1, Math.min(
    labels.length,
    Math.floor((below.width - LEGEND_PADDING * 2 + LEGEND_COLUMN_GAP) / (itemWidth + LEGEND_COLUMN_GAP)),
  ));
  const rows = Math.ceil(labels.length / columns);
  const rect = { x: below.x, y: below.y, width: boxWidth(columns), height: LEGEND_PADDING * 2 + rows * LEGEND_ROW_HEIGHT };
  return { corner: 'below', columns, rows, columnWidth: itemWidth, rect, overlaps: 0 };
}

/** 凡例の`index`番目の項目の、枠の左上からの位置（列ごとに上から順）。 */
export function legendItemOffset(placement: Pick<LegendPlacement, 'rows' | 'columnWidth'>, index: number): Point {
  const column = Math.floor(index / placement.rows);
  const row = index % placement.rows;
  return {
    x: LEGEND_PADDING + column * (placement.columnWidth + LEGEND_COLUMN_GAP),
    y: LEGEND_PADDING + row * LEGEND_ROW_HEIGHT + LEGEND_ROW_HEIGHT / 2,
  };
}

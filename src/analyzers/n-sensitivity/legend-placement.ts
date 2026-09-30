/**
 * N感度の凡例を、図の中のどこに置くか（#806）。
 *
 * 論文の図のように、プロット領域の隅の余白へ枠を置く。線の実際の位置から空きを調べるので、
 * 図の形（対象の数・値の範囲・縦軸の決め方・図の大きさ）が変わっても線に重ならない。
 *
 * 隅の候補の順は、左下・右上を先に置く。N感度の線は、Nを増やしても距離が増えない（spec §7 R4:
 * 残る場合とホームへ戻る場合の小さい方を採り、Nが大きいほど候補が増える）ので、左上（N=0）から右下へ
 * 下がる。このため左下（Nが小さく値が低い所）と右上（Nが大きく値が高い所）が空く。
 * ただし傾きが無い線（Nを増やしても距離が変わらない）は右上を通り、値の幅が狭い相対表示の
 * 右上は狭いので、空いているかは形から決める。どの隅も収まらなければ、凡例を2列にして低くし、
 * それでも収まらなければ線と交わる本数が最も少ない隅へ置く。
 *
 * ReactにもDOMにも依存しない純粋な計算（文字の幅は近似で見積もる）。
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

export type LegendCorner = 'bottom-left' | 'top-right' | 'bottom-right' | 'top-left';

/** 試す隅の順。左下・右上が本命で、残りは両方が塞がった時の逃げ場。 */
const CORNER_ORDER: readonly LegendCorner[] = ['bottom-left', 'top-right', 'bottom-right', 'top-left'];
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
/** 1つの名前に使う幅の上限。これを超えたら末尾を「…」で省く。 */
export const LEGEND_MAX_LABEL_WIDTH = 120;

/** 文字列を描いた時の幅の見積もり。全角は文字サイズいっぱい、半角は約0.6倍。 */
export function estimateTextWidth(text: string, fontSize = LEGEND_FONT_SIZE): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) > 0x7f ? fontSize : fontSize * 0.6;
  return width;
}

/** 名前を`maxWidth`に収める。収まらなければ末尾を「…」で省く。 */
export function truncateLabel(text: string, maxWidth = LEGEND_MAX_LABEL_WIDTH): string {
  if (estimateTextWidth(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && estimateTextWidth(`${chars.join('')}…`) > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

export interface LegendPlacement {
  readonly corner: LegendCorner;
  readonly columns: number;
  readonly rows: number;
  /** 1列の幅（見本＋名前の最大幅）。 */
  readonly columnWidth: number;
  readonly rect: Rect;
  /** 枠と交わった線分の数。0なら線に重ならない。 */
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

function cornerRect(corner: LegendCorner, plot: Rect, width: number, height: number): Rect {
  const left = corner.endsWith('left');
  const top = corner.startsWith('top');
  return {
    x: left ? plot.x + CORNER_INSET : plot.x + plot.width - CORNER_INSET - width,
    y: top ? plot.y + CORNER_INSET : plot.y + plot.height - CORNER_INSET - height,
    width,
    height,
  };
}

/**
 * `plot`はプロット領域、`lines`は各系列の折れ線の頂点（プロット領域と同じ座標系）、
 * `labels`は凡例に出す名前（省略済み）。
 */
export function placeLegend(plot: Rect, lines: readonly (readonly Point[])[], labels: readonly string[]): LegendPlacement {
  const itemWidth = LEGEND_SWATCH_WIDTH + LEGEND_SWATCH_GAP + Math.max(0, ...labels.map((label) => estimateTextWidth(label)));

  let best: LegendPlacement | null = null;
  for (const columns of COLUMN_CANDIDATES) {
    if (columns > 1 && labels.length < columns) break;
    const rows = Math.ceil(labels.length / columns);
    const width = LEGEND_PADDING * 2 + columns * itemWidth + (columns - 1) * LEGEND_COLUMN_GAP;
    const height = LEGEND_PADDING * 2 + rows * LEGEND_ROW_HEIGHT;
    for (const corner of CORNER_ORDER) {
      const rect = cornerRect(corner, plot, width, height);
      const candidate: LegendPlacement = { corner, columns, rows, columnWidth: itemWidth, rect, overlaps: countOverlaps(lines, rect) };
      if (candidate.overlaps === 0) return candidate;
      if (best === null || candidate.overlaps < best.overlaps) best = candidate;
    }
  }
  return best!;
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

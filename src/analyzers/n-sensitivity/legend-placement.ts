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
export const LEGEND_MEASURE_SLACK = 2;

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

interface LabelRegion {
  /** 他の名前と違う区間の文字列（残さないと見分けられない部分）。区間が無ければ空。 */
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * 名前ごとに「他のどの名前とも見分けるために残す区間」を求める。
 * 相手ごとに、先頭・末尾を共有する分を除いた違いの区間があり、その和（一番外側）を取る。
 * 末尾の「）」だけを共有するような相手でも、違いの区間の外側は省いてよいが、区間そのものは残す。
 * 先頭も末尾も全く共有しない相手（互いに別物と読める名前）は、条件にしない。
 * 条件になる相手が居なければ区間は空で、どこを省いてもよい。
 */
function labelRegions(labels: readonly string[]): LabelRegion[] {
  const chars = labels.map((label) => [...label]);
  return chars.map((mine, i) => {
    let start = Number.POSITIVE_INFINITY;
    let sharedSuffix = Number.POSITIVE_INFINITY;
    for (let j = 0; j < chars.length; j += 1) {
      if (j === i) continue;
      const other = chars[j]!;
      const limit = Math.min(mine.length, other.length);
      let prefix = 0;
      while (prefix < limit && mine[prefix] === other[prefix]) prefix += 1;
      let suffix = 0;
      while (suffix < limit - prefix && mine[mine.length - 1 - suffix] === other[other.length - 1 - suffix]) suffix += 1;
      if (prefix + suffix === 0) continue;
      start = Math.min(start, prefix);
      sharedSuffix = Math.min(sharedSuffix, suffix);
    }
    if (!Number.isFinite(start)) return { text: '', start: 0, end: 0 };
    const end = mine.length - sharedSuffix;
    return { text: end > start ? mine.slice(start, end).join('') : '', start, end };
  });
}

/**
 * 違いの区間を残したまま、周りの文脈を入るだけ残して両側を「…」で省く。
 * 区間だけでも入らなければ中央を省く（区間が落ちるので、呼び出し側が広い上限で省き直す）。
 */
function shortenLabel(label: string, cap: number, measure: MeasureText, region: LabelRegion): string {
  if (measure(label) <= cap) return label;
  if (region.text === '') return elideMiddle(label, cap, measure);
  const chars = [...label];
  const around = (extra: number) => {
    const from = Math.max(0, region.start - extra);
    const to = Math.min(chars.length, region.end + extra);
    return `${from > 0 ? ELLIPSIS : ''}${chars.slice(from, to).join('')}${to < chars.length ? ELLIPSIS : ''}`;
  };
  for (let extra = Math.max(region.start, chars.length - region.end); extra >= 0; extra -= 1) {
    const candidate = around(extra);
    if (measure(candidate) <= cap) return candidate;
  }
  return elideMiddle(around(0), cap, measure);
}

export interface FittedLegendLabels {
  readonly labels: string[];
  /**
   * 省いた後も、名前どうしを見分けられ、どの名前も`hardMax`に収まるか。
   * `false`の時は図の中の凡例に名前を並べても見分けられない（見分ける区間が`hardMax`に入らない）ので、
   * 呼び出し側は名前を省かない別の置き方（図の外に折り返して並べる）を使う。`labels`は参考値。
   */
  readonly distinct: boolean;
}

/**
 * 凡例に出す名前をそろえて省く。**省いた後も、別の対象と見分けられる**ことを保証する
 * （元の名前が互いに異なる限り）。「見分けられる」は、同じ文字列にならないこと、かつ、
 * 名前ごとに、他の名前と違う区間（`labelRegions`）が「…」で消えていないこと。
 * 消える時は、上限の幅を広げて省き直し、`hardMax`まで広げても消えるなら`distinct: false`を返す。
 * `hardMax`は図の幅に収まる名前の幅の上限で、どの名前もこれを超えない（超える省き方は`distinct: false`）。
 * 図が狭く`hardMax`が既定の上限（`maxWidth`）より小さい時は、`hardMax`から始める
 * （既定の上限で省いた名前は、図の幅を超えうるため）。完全な名前は、凡例の項目のhover（`<title>`）に別に出す。
 */
export function fitLegendLabels(
  labels: readonly string[],
  measure: MeasureText = estimateTextWidth,
  maxWidth = LEGEND_MAX_LABEL_WIDTH,
  hardMax = maxWidth,
): FittedLegendLabels {
  const regions = labelRegions(labels);
  const caps: number[] = [];
  for (let cap = Math.min(maxWidth, hardMax); cap < hardMax; cap += 20) caps.push(cap);
  caps.push(hardMax);
  const wanted = new Set(labels).size;
  for (const cap of caps) {
    const fitted = labels.map((label, i) => shortenLabel(label, cap, measure, regions[i]!));
    const distinct = new Set(fitted).size === wanted
      && fitted.every((text, i) => text.includes(regions[i]!.text))
      && fitted.every((text) => measure(text) <= hardMax);
    if (distinct) return { labels: fitted, distinct: true };
  }
  return { labels: labels.map((label, i) => shortenLabel(label, hardMax, measure, regions[i]!)), distinct: false };
}

/** `fitLegendLabels`の名前だけを返す形。 */
export function fitLabels(
  labels: readonly string[],
  measure: MeasureText = estimateTextWidth,
  maxWidth = LEGEND_MAX_LABEL_WIDTH,
  hardMax = maxWidth,
): string[] {
  return fitLegendLabels(labels, measure, maxWidth, hardMax).labels;
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
    + Math.max(0, ...labels.map((label) => measure(label))) + LEGEND_MEASURE_SLACK;
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

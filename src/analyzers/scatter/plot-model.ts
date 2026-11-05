import type { ScatterContour } from './axes.ts';

/**
 * 散布図の座標の計算（画面に依存しない純粋な関数）。軸の範囲・目盛り・細い線の位置と値の置き場所、点の名前の置き場所を決める。
 * 可視化はここで決めた座標を描くだけで、値の計算はしない。
 */

export const PLOT_WIDTH = 640;
export const PLOT_HEIGHT = 400;
export const PLOT_MARGIN = { left: 72, right: 28, top: 16, bottom: 48 } as const;
const PLOT_LEFT = PLOT_MARGIN.left;
const PLOT_RIGHT = PLOT_WIDTH - PLOT_MARGIN.right;
const PLOT_TOP = PLOT_MARGIN.top;
const PLOT_BOTTOM = PLOT_HEIGHT - PLOT_MARGIN.bottom;

export interface Range {
  readonly lo: number;
  readonly hi: number;
}

/** 点の値の範囲に余白を足した軸の範囲。0を含めることは強制しない。値が全部0以上の時は、余白で負の側へ出さない。 */
export function axisRange(values: readonly number[]): Range {
  if (values.length === 0) return { lo: 0, hi: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span > 0 ? span * 0.1 : Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
  const lo = min - pad;
  return { lo: min >= 0 && lo < 0 ? 0 : lo, hi: max + pad };
}

/** 範囲の中の、切りのよい（1・2・5の10の冪乗倍）値。おおよそ`target`本。 */
export function niceTicks(range: Range, target: number): { readonly values: readonly number[]; readonly step: number } {
  const span = range.hi - range.lo;
  if (!(span > 0) || !Number.isFinite(span)) return { values: [], step: 1 };
  const rough = span / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const first = Math.ceil(range.lo / step - 1e-9);
  const last = Math.floor(range.hi / step + 1e-9);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(Number((i * step).toPrecision(12)));
  return { values, step };
}

/** 目盛りの刻み`step`が見分けられる小数の桁数。 */
function decimalsOf(step: number): number {
  return step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
}

export function formatTickValue(value: number, step: number): string {
  return value.toFixed(decimalsOf(step));
}

export interface PlotTick {
  readonly value: number;
  readonly position: number;
  readonly text: string;
}

export interface PlotLabel {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'end' | 'middle';
}

export interface PlotPointInput {
  readonly targetKey: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface PlotPoint extends PlotPointInput {
  readonly px: number;
  readonly py: number;
  readonly labelAt: PlotLabel;
}

export interface PlotContourLine {
  readonly level: number;
  /** 線のSVGの`d`。図の外へ出る部分は含まない。 */
  readonly d: string;
  /** 値の文字の右端と基準線の位置。枠・点・点の名前と重ならない場所を選ぶ。置ける場所が無い時は`undefined`で、値を書かない。 */
  readonly labelAt: { readonly x: number; readonly y: number } | undefined;
  /** 線に書く値。量の名前は書かず、凡例に1回だけ示す。桁は同じ図の線で揃える。 */
  readonly text: string;
}

/** 描画領域の枠の中に置く凡例。行は入力の`legendRows`と同じ順で、最後に細い線の行（線がある時）が付く。 */
export interface PlotLegend {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** 各行の見本の中心のx、文字の左端のx、行の中心のy。 */
  readonly rows: readonly { readonly sampleX: number; readonly textX: number; readonly y: number; readonly text: string }[];
}

export interface ScatterPlotModel {
  readonly xTicks: readonly PlotTick[];
  readonly yTicks: readonly PlotTick[];
  readonly points: readonly PlotPoint[];
  readonly contours: readonly PlotContourLine[];
  /** 凡例の行が無い時は`undefined`。 */
  readonly legend: PlotLegend | undefined;
}

export interface ScatterPlotInput {
  readonly points: readonly PlotPointInput[];
  readonly contour: ScatterContour | undefined;
  /** 配列の種類の凡例の行の文字。点が1つも無い種類は含めない。 */
  readonly legendRows: readonly string[];
  /** 細い線の量の名前。細い線を1本以上描く時だけ、凡例の最後の行に出す。 */
  readonly contourName: string;
  /** 細い線の値に付ける単位（`%`など）。 */
  readonly contourSuffix: string;
}

const CONTOUR_SAMPLES = 200;
const LEVEL_GRID = 24;
const MAX_LEVELS = 6;

function positionOf(value: number, range: Range, from: number, to: number): number {
  return from + ((value - range.lo) / (range.hi - range.lo)) * (to - from);
}

function levelsFor(contour: ScatterContour, xRange: Range, yRange: Range): { readonly levels: readonly number[]; readonly step: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= LEVEL_GRID; i++) {
    for (let j = 0; j <= LEVEL_GRID; j++) {
      const value = contour.valueAt(xRange.lo + ((xRange.hi - xRange.lo) * i) / LEVEL_GRID, yRange.lo + ((yRange.hi - yRange.lo) * j) / LEVEL_GRID);
      if (value === undefined) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!(max > min)) return { levels: [], step: 1 };
  if (contour.levels === 'reciprocal') return reciprocalLevels({ lo: min, hi: max });
  const { values, step } = niceTicks({ lo: min, hi: max }, 4);
  return { levels: values.slice(0, MAX_LEVELS), step };
}

/** 比の線の値の組。1より大きい側の値で、その逆数と組にする。どの値も逆数も小数の桁が有限で、線の値を丸めずに書ける。 */
const RECIPROCAL_PAIRS = [1.25, 2, 4, 10] as const;

/**
 * 比の線の値。1と、比とその逆数の組（1.25と0.8、2と0.5など）のうち、範囲に入る値を、1に近い組から選ぶ。
 * 逆数どうしは左右を入れ替えた同じ大きさの偏りなので、組の一方だけが範囲に入る時もその値を引く。
 * `step`は、選んだ値を丸めずに書ける小数の刻み。
 */
export function reciprocalLevels(range: Range): { readonly levels: readonly number[]; readonly step: number } {
  const inRange = (value: number) => value >= range.lo && value <= range.hi;
  const levels: number[] = inRange(1) ? [1] : [];
  for (const pair of RECIPROCAL_PAIRS) {
    // 組の両方が範囲に入る時は、2本とも引ける時だけ引く（片方だけを残さない）
    const values = [1 / pair, pair].filter(inRange);
    if (levels.length + values.length > MAX_LEVELS) break;
    levels.push(...values);
  }
  levels.sort((a, b) => a - b);
  const decimals = Math.max(0, ...levels.map((value) => (String(value).split('.')[1] ?? '').length));
  return { levels, step: 10 ** -Math.max(1, decimals) };
}

interface DrawnContour {
  readonly level: number;
  readonly d: string;
  /** 値を書く候補の位置。右端から左へ、線に沿って並べる。 */
  readonly anchors: readonly { readonly x: number; readonly y: number }[];
}

function contourLine(contour: ScatterContour, level: number, xRange: Range, yRange: Range): DrawnContour {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= CONTOUR_SAMPLES; i++) {
    const x = xRange.lo + ((xRange.hi - xRange.lo) * i) / CONTOUR_SAMPLES;
    const y = contour.yAt(level, x);
    if (y !== undefined && y >= yRange.lo && y <= yRange.hi) {
      current.push({ x: positionOf(x, xRange, PLOT_LEFT, PLOT_RIGHT), y: positionOf(y, yRange, PLOT_BOTTOM, PLOT_TOP) });
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  const drawn = segments.filter((segment) => segment.length >= 2);
  const d = drawn.map((segment) => segment.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')).join('');
  let rightmost: Array<{ x: number; y: number }> | undefined;
  for (const segment of drawn) {
    if (rightmost === undefined || segment[segment.length - 1]!.x > rightmost[rightmost.length - 1]!.x) rightmost = segment;
  }
  const anchors: Array<{ x: number; y: number }> = [];
  if (rightmost !== undefined) {
    for (let i = rightmost.length - 1; i >= 0; i -= ANCHOR_STRIDE) anchors.push(rightmost[i]!);
  }
  return { level, d, anchors };
}

/** 値を書く候補の位置を線に沿って並べる間隔（標本の数）。 */
const ANCHOR_STRIDE = 8;

const POINT_CLEARANCE = 7;
/** 名前・値が描画領域の枠の線から空ける距離。 */
const FRAME_MARGIN = 2;

/** 11pxの文字の幅の見積もり。実測の幅（ブラウザで描いたbbox）以上になるよう、文字の種類ごとに少し広めに取る。全角は11.5。 */
export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 256) width += 11.5;
    else if ('MW'.includes(char)) width += 10;
    else if ('I'.includes(char)) width += 4.5;
    else if ('mw'.includes(char)) width += 9;
    else if ('ijl'.includes(char)) width += 3.5;
    else if ('frt'.includes(char)) width += 4.5;
    else if (char >= 'A' && char <= 'Z') width += 8.5;
    else if ('-()'.includes(char)) width += 4.5;
    else if (char === ' ') width += 3.5;
    else width += 6.6;
  }
  return width;
}

interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 細い線の値の文字（右端を`at`、基準線の高さを`at.y`に置く）が、周りへ余白を足して占める長方形。 */
function valueRect(at: { readonly x: number; readonly y: number }, width: number): Rect {
  return { x0: at.x - width - 1, x1: at.x + 1, y0: at.y - 11.5, y1: at.y + 4.5 };
}

const LEGEND_ROW = 18;
const LEGEND_PAD = 6;
const LEGEND_SAMPLE = 22;
const LEGEND_INSET = 6;

/**
 * 凡例を置く隅。右上・左上・右下・左下の順に、点・点の名前と重ならない最初の隅を選ぶ。
 * どの隅も重なる時は、点との重なりが最も少なく、次に点の名前との重なりが最も少ない隅にする。
 */
function placeLegend(texts: readonly string[], marks: readonly Rect[], names: readonly Rect[]): PlotLegend | undefined {
  if (texts.length === 0) return undefined;
  const textWidth = Math.max(...texts.map((text) => estimateTextWidth(text)));
  const width = LEGEND_PAD + LEGEND_SAMPLE + 4 + textWidth + LEGEND_PAD;
  const height = LEGEND_PAD * 2 + LEGEND_ROW * texts.length - 4;
  const corners = [
    { x0: PLOT_RIGHT - LEGEND_INSET - width, y0: PLOT_TOP + LEGEND_INSET },
    { x0: PLOT_LEFT + LEGEND_INSET, y0: PLOT_TOP + LEGEND_INSET },
    { x0: PLOT_RIGHT - LEGEND_INSET - width, y0: PLOT_BOTTOM - LEGEND_INSET - height },
    { x0: PLOT_LEFT + LEGEND_INSET, y0: PLOT_BOTTOM - LEGEND_INSET - height },
  ];
  let best = corners[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const corner of corners) {
    const rect = { x0: corner.x0, x1: corner.x0 + width, y0: corner.y0, y1: corner.y0 + height };
    const cost = marks.filter((mark) => overlaps(rect, mark)).length * 1000 + names.filter((name) => overlaps(rect, name)).length;
    if (cost < bestCost) {
      best = corner;
      bestCost = cost;
    }
    if (cost === 0) break;
  }
  return {
    x0: best.x0,
    y0: best.y0,
    x1: best.x0 + width,
    y1: best.y0 + height,
    rows: texts.map((text, index) => ({
      sampleX: best.x0 + LEGEND_PAD + LEGEND_SAMPLE / 2,
      textX: best.x0 + LEGEND_PAD + LEGEND_SAMPLE + 4,
      y: best.y0 + LEGEND_PAD + LEGEND_ROW * index + (LEGEND_ROW - 4) / 2,
      text,
    })),
  };
}

/** 長方形が描画領域の枠の線に掛かる、または枠の外に出る。 */
function leavesPlot(rect: Rect): boolean {
  return (
    rect.x0 < PLOT_LEFT + FRAME_MARGIN || rect.x1 > PLOT_RIGHT - FRAME_MARGIN || rect.y0 < PLOT_TOP + FRAME_MARGIN || rect.y1 > PLOT_BOTTOM - FRAME_MARGIN
  );
}

/**
 * 点の名前の置き場所。右・左・上・下の順に、他の名前・点・図の外と重ならない最初の場所を選ぶ。
 * どこも重なる時は、重なりが最も少ない場所にする。
 */
function placeLabels(points: readonly { readonly px: number; readonly py: number; readonly label: string }[]): Array<{ label: PlotLabel; rect: Rect }> {
  const marks: Rect[] = points.map((p) => ({
    x0: p.px - POINT_CLEARANCE,
    x1: p.px + POINT_CLEARANCE,
    y0: p.py - POINT_CLEARANCE,
    y1: p.py + POINT_CLEARANCE,
  }));
  const placed: Rect[] = [];
  return points.map((point) => {
    const width = estimateTextWidth(point.label);
    // 文字の高さは基準線の上10.5・下3.5。周りに1ずつ余白を足す
    const at = (x: number, baseline: number, anchor: PlotLabel['anchor']): { label: PlotLabel; rect: Rect } => {
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
      return { label: { x, y: baseline, anchor }, rect: { x0: x0 - 1, x1: x0 + width + 1, y0: baseline - 11.5, y1: baseline + 4.5 } };
    };
    // 上下の候補は、点の真上・真下に中央揃えで置き、横に枠から出る時は枠の中へ寄せる
    const centered = (baseline: number) => {
      const left = Math.min(Math.max(point.px - width / 2, PLOT_LEFT + FRAME_MARGIN + 1), PLOT_RIGHT - FRAME_MARGIN - 1 - width);
      return at(left, baseline, 'start');
    };
    const candidates = [at(point.px + 9, point.py + 4, 'start'), at(point.px - 9, point.py + 4, 'end'), centered(point.py - 10), centered(point.py + 19)];
    let best = candidates[0]!;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const { rect } = candidate;
      // 枠の外へ出る置き方は、他の名前・点と重なる置き方より必ず後にする。どれも出る時は、出る量が少ない方（上下の候補は枠の中へ寄せるので、点が枠の端でも出ない）
      const overshoot =
        Math.max(0, PLOT_LEFT + FRAME_MARGIN - rect.x0) +
        Math.max(0, rect.x1 - (PLOT_RIGHT - FRAME_MARGIN)) +
        Math.max(0, PLOT_TOP + FRAME_MARGIN - rect.y0) +
        Math.max(0, rect.y1 - (PLOT_BOTTOM - FRAME_MARGIN));
      const cost =
        (overshoot > 0 ? 1e6 + overshoot * 1000 : 0) +
        placed.filter((other) => overlaps(rect, other)).length +
        marks.filter((mark) => overlaps(rect, mark)).length;
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
      if (cost === 0) break;
    }
    placed.push(best.rect);
    return best;
  });
}

/** 散布図の座標。点が無い時も軸の目盛りは返す。 */
export function scatterPlotModel(input: ScatterPlotInput): ScatterPlotModel {
  const xRange = axisRange(input.points.map((p) => p.x));
  const yRange = axisRange(input.points.map((p) => p.y));
  const xt = niceTicks(xRange, 6);
  const yt = niceTicks(yRange, 5);
  const xTicks = xt.values.map((value) => ({ value, position: positionOf(value, xRange, PLOT_LEFT, PLOT_RIGHT), text: formatTickValue(value, xt.step) }));
  const yTicks = yt.values.map((value) => ({ value, position: positionOf(value, yRange, PLOT_BOTTOM, PLOT_TOP), text: formatTickValue(value, yt.step) }));
  const positioned = input.points.map((p) => ({
    ...p,
    px: positionOf(p.x, xRange, PLOT_LEFT, PLOT_RIGHT),
    py: positionOf(p.y, yRange, PLOT_BOTTOM, PLOT_TOP),
  }));
  const labels = placeLabels(positioned);
  const points = positioned.map((p, index) => ({ ...p, labelAt: labels[index]!.label }));
  const marks: Rect[] = positioned.map((p) => ({
    x0: p.px - POINT_CLEARANCE,
    x1: p.px + POINT_CLEARANCE,
    y0: p.py - POINT_CLEARANCE,
    y1: p.py + POINT_CLEARANCE,
  }));
  let drawn: Array<{ readonly level: number; readonly d: string; readonly anchors: DrawnContour['anchors'] }> = [];
  let step = 1;
  if (input.contour !== undefined && input.points.length > 0) {
    const levelled = levelsFor(input.contour, xRange, yRange);
    step = levelled.step;
    const contour = input.contour;
    drawn = levelled.levels.map((level) => contourLine(contour, level, xRange, yRange)).filter((line) => line.d !== '');
  }
  // 凡例は枠の中の隅に置く。細い線の行は、線を1本以上描く時だけ付ける
  const legend = placeLegend(
    drawn.length > 0 ? [...input.legendRows, input.contourName] : input.legendRows,
    marks,
    labels.map((placed) => placed.rect),
  );
  const occupied: Rect[] = [
    ...labels.map((placed) => placed.rect),
    ...marks,
    ...(legend === undefined ? [] : [{ x0: legend.x0, x1: legend.x1, y0: legend.y0, y1: legend.y1 }]),
  ];
  const contours: PlotContourLine[] = drawn.map((line) => {
    const text = `${formatTickValue(line.level, step)}${input.contourSuffix}`;
    const width = estimateTextWidth(text);
    // 文字の右端を線の上か下に置く。枠・点・点の名前・凡例・他の線の値と重ならない最初の場所を、右端から左へ探す。
    // 置ける場所が無い線は値を省く（線は引く）
    let placedAt: { x: number; y: number } | undefined;
    for (const anchor of line.anchors) {
      for (const at of [
        { x: anchor.x - 4, y: anchor.y - 5 },
        { x: anchor.x - 4, y: anchor.y + 13 },
      ]) {
        const rect = valueRect(at, width);
        if (leavesPlot(rect) || occupied.some((other) => overlaps(rect, other))) continue;
        placedAt = at;
        occupied.push(rect);
        break;
      }
      if (placedAt !== undefined) break;
    }
    return { level: line.level, d: line.d, labelAt: placedAt, text };
  });
  return { xTicks, yTicks, points, contours, legend };
}

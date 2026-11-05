import type { ScatterContour } from './axes.ts';

/**
 * 散布図の座標の計算（画面に依存しない純粋な関数）。軸の範囲・目盛り・等位線の位置と、点の名前の置き場所を決める。
 * 可視化はここで決めた座標を描くだけで、値の計算はしない。
 */

export const PLOT_WIDTH = 640;
export const PLOT_HEIGHT = 400;
export const PLOT_MARGIN = { left: 64, right: 28, top: 22, bottom: 48 } as const;
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
  /** 量の名前と値を書く位置（線の右端）。図の中に線が無い時は`undefined`。 */
  readonly labelAt: { readonly x: number; readonly y: number } | undefined;
  readonly text: string;
}

export interface ScatterPlotModel {
  readonly xTicks: readonly PlotTick[];
  readonly yTicks: readonly PlotTick[];
  readonly points: readonly PlotPoint[];
  readonly contours: readonly PlotContourLine[];
}

export interface ScatterPlotInput {
  readonly points: readonly PlotPointInput[];
  readonly contour: ScatterContour | undefined;
  /** 等位線の端に書く量の名前。 */
  readonly contourName: string;
  /** 等位線の値に付ける単位（`%`など）。 */
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
  const { values, step } = niceTicks({ lo: min, hi: max }, 4);
  return { levels: values.slice(0, MAX_LEVELS), step };
}

function contourLine(contour: ScatterContour, level: number, xRange: Range, yRange: Range, text: string): PlotContourLine {
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
  let end: { x: number; y: number } | undefined;
  for (const segment of drawn) {
    const last = segment[segment.length - 1]!;
    if (end === undefined || last.x > end.x) end = last;
  }
  return { level, d, labelAt: end === undefined ? undefined : { x: end.x, y: end.y }, text };
}

const LABEL_HEIGHT = 12;
const POINT_CLEARANCE = 7;

/** 11pxの文字の幅の見積もり。全角は約11.5、半角は約6.3。 */
export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) < 256 ? 6.3 : 11.5;
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

/**
 * 点の名前の置き場所。右・左・上・下の順に、他の名前・点・図の外と重ならない最初の場所を選ぶ。
 * どこも重なる時は、重なりが最も少ない場所にする。
 */
function placeLabels(points: readonly { readonly px: number; readonly py: number; readonly label: string }[]): PlotLabel[] {
  const marks: Rect[] = points.map((p) => ({
    x0: p.px - POINT_CLEARANCE,
    x1: p.px + POINT_CLEARANCE,
    y0: p.py - POINT_CLEARANCE,
    y1: p.py + POINT_CLEARANCE,
  }));
  const placed: Rect[] = [];
  return points.map((point) => {
    const width = estimateTextWidth(point.label);
    const candidates: Array<{ label: PlotLabel; rect: Rect }> = [
      {
        label: { x: point.px + 9, y: point.py + 4, anchor: 'start' },
        rect: { x0: point.px + 9, x1: point.px + 9 + width, y0: point.py - 8, y1: point.py + 4 },
      },
      {
        label: { x: point.px - 9, y: point.py + 4, anchor: 'end' },
        rect: { x0: point.px - 9 - width, x1: point.px - 9, y0: point.py - 8, y1: point.py + 4 },
      },
      {
        label: { x: point.px, y: point.py - 10, anchor: 'middle' },
        rect: { x0: point.px - width / 2, x1: point.px + width / 2, y0: point.py - 10 - LABEL_HEIGHT + 3, y1: point.py - 10 + 3 },
      },
      {
        label: { x: point.px, y: point.py + 19, anchor: 'middle' },
        rect: { x0: point.px - width / 2, x1: point.px + width / 2, y0: point.py + 19 - LABEL_HEIGHT + 3, y1: point.py + 19 + 3 },
      },
    ];
    let best = candidates[0]!;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const { rect } = candidate;
      const outside = rect.x0 < PLOT_LEFT || rect.x1 > PLOT_RIGHT || rect.y0 < PLOT_TOP || rect.y1 > PLOT_BOTTOM ? 1 : 0;
      const cost = outside + placed.filter((other) => overlaps(rect, other)).length + marks.filter((mark) => overlaps(rect, mark)).length;
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
      if (cost === 0) break;
    }
    placed.push(best.rect);
    return best.label;
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
  const points = positioned.map((p, index) => ({ ...p, labelAt: labels[index]! }));
  let contours: PlotContourLine[] = [];
  if (input.contour !== undefined && input.points.length > 0) {
    const { levels, step } = levelsFor(input.contour, xRange, yRange);
    const contour = input.contour;
    contours = levels
      .map((level) => contourLine(contour, level, xRange, yRange, `${input.contourName} ${formatTickValue(level, step)}${input.contourSuffix}`))
      .filter((line) => line.d !== '');
  }
  return { xTicks, yTicks, points, contours };
}

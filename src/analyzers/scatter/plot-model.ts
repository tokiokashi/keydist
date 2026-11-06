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

/**
 * 対数の目盛りでの軸の範囲。余白は対数の上で、点の値の範囲（対数の幅）の1割を両側に足す。値が全部同じ時は、両側に1割ずつ（比が1.1倍）の幅を持たせる。
 * 値は全部0より大きい前提（`logScaleAvailability`が確かめる）。
 */
export function logAxisRange(values: readonly number[]): Range {
  if (values.length === 0) return { lo: 1, hi: 10 };
  const min = Math.log10(Math.min(...values));
  const max = Math.log10(Math.max(...values));
  const pad = max > min ? (max - min) * 0.1 : Math.log10(1.1);
  return { lo: 10 ** (min - pad), hi: 10 ** (max + pad) };
}

/** 範囲の中の、切りのよい（1・2・5の10の冪乗倍）値。おおよそ`target`本。 */
export function niceTicks(range: Range, target: number): { readonly values: readonly number[]; readonly step: number } {
  const span = range.hi - range.lo;
  if (!(span > 0) || !Number.isFinite(span)) return { values: [], step: 1 };
  const rough = span / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const { first, last } = multiplesIn(range, step);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(multiple(i, step));
  return { values, step };
}

/** `step`の整数倍のうち、範囲に入るものの添字の最小と最大。 */
function multiplesIn(range: Range, step: number): { readonly first: number; readonly last: number } {
  return { first: Math.ceil(range.lo / step - 1e-9), last: Math.floor(range.hi / step + 1e-9) };
}

function multiple(index: number, step: number): number {
  return Number((index * step).toPrecision(12));
}

/** 目盛りの刻み`step`が見分けられる小数の桁数。 */
function decimalsOf(step: number): number {
  return step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
}

export function formatTickValue(value: number, step: number): string {
  return value.toFixed(decimalsOf(step));
}

/** 対数の目盛りの数字。その値を丸めずに表せる最小の桁数で書く。 */
function formatLogTickValue(value: number): string {
  for (let decimals = 0; decimals < 12; decimals++) {
    if (Number(value.toFixed(decimals)) === value) return value.toFixed(decimals);
  }
  return value.toFixed(12);
}

/** 対数の目盛りの値の段。粗い順に、1の冪・1と2と5の冪・1〜9の冪・一定の刻み。 */
export type LogTier = 1 | 2 | 3 | 4;
const LOG_TIER_LEADS: Readonly<Record<1 | 2 | 3, readonly number[]>> = {
  1: [1],
  2: [1, 2, 5],
  3: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};
/** 縦軸の数字の高さ（font-size）と、隣の数字との間に空ける距離。 */
const LOG_TICK_TEXT_HEIGHT = 11;
const LOG_TICK_TEXT_GAP = 3;
/** 横軸の隣の数字との間に空ける距離。 */
const LOG_TICK_TEXT_GAP_X = 8;

export interface LogAxis {
  readonly range: Range;
  readonly values: readonly number[];
  readonly texts: readonly string[];
  /** 重なりを考えずに、目盛りの数で選んだ段。 */
  readonly wantedTier: LogTier;
  /** 目盛りの値を選んだ段（数字が重なる時は`wantedTier`より粗い）。 */
  readonly tier: LogTier;
}

/** `leads`×10の冪の値のうち、`padded`を含む最も狭い、目盛りから目盛りまでの範囲に入る値。 */
function enclosingLeadTicks(padded: Range, leads: readonly number[]): readonly number[] {
  const all: number[] = [];
  for (let power = Math.floor(Math.log10(padded.lo)) - 1; power <= Math.ceil(Math.log10(padded.hi)) + 1; power++) {
    for (const lead of leads) all.push(Number((lead * 10 ** power).toPrecision(12)));
  }
  all.sort((a, b) => a - b);
  const loTick = all.filter((v) => v <= padded.lo * (1 + 1e-9)).at(-1) ?? all[0]!;
  const hiTick = all.find((v) => v >= padded.hi * (1 - 1e-9)) ?? all.at(-1)!;
  return all.filter((v) => v >= loTick && v <= hiTick);
}

/** 一定の刻み（1・2・5の10の冪乗倍）の値。目標の本数に届く最も粗い刻みで、`padded`を含む範囲に入る値。 */
function enclosingStepTicks(padded: Range, target: number): readonly number[] {
  let finest: readonly number[] = [];
  for (let exponent = Math.ceil(Math.log10(padded.hi)); exponent >= -9; exponent--) {
    for (const lead of [5, 2, 1]) {
      const step = Number((lead * 10 ** exponent).toPrecision(12));
      const first = Math.floor(padded.lo / step + 1e-9);
      if (first < 1) continue;
      const last = Math.ceil(padded.hi / step - 1e-9);
      const values: number[] = [];
      for (let i = first; i <= last; i++) values.push(multiple(i, step));
      finest = values;
      if (values.length >= target) return values;
    }
  }
  return finest;
}

/** 隣り合う数字が重なるか。横軸は数字の幅、縦軸は数字の高さで、図の座標の上の中心どうしの距離と比べる。 */
function logTicksOverlap(values: readonly number[], texts: readonly string[], range: Range, horizontal: boolean): boolean {
  const [from, to] = horizontal ? [PLOT_LEFT, PLOT_RIGHT] : [PLOT_BOTTOM, PLOT_TOP];
  for (let i = 1; i < values.length; i++) {
    const distance = Math.abs(positionOf(values[i]!, range, from, to, true) - positionOf(values[i - 1]!, range, from, to, true));
    const needed = horizontal
      ? (estimateTextWidth(texts[i]!) + estimateTextWidth(texts[i - 1]!)) / 2 + LOG_TICK_TEXT_GAP_X
      : LOG_TICK_TEXT_HEIGHT + LOG_TICK_TEXT_GAP;
    if (distance < needed) return true;
  }
  return false;
}

/**
 * 対数の軸の範囲と目盛り。点の値に余白を足した範囲（`logAxisRange`）を含む最も狭い、目盛りの値から目盛りの値までを軸の範囲にするので、
 * 余白を残したまま、どの点も両側を数字の付いた目盛りで挟まれる。目盛りの値は4つの段（`LogTier`）の1つから選ぶ。
 * 軸の範囲に入る目盛りの数が`target`以上になる最も粗い段を使い、3つの段で届かない時は一定の刻みの段を使う。
 * 隣の数字が重なる時は、重ならない段まで1段ずつ粗い段に戻す（1つ目の段でも重なる時は1つ目の段）。
 */
export function logAxis(values: readonly number[], target: number, horizontal: boolean): LogAxis {
  const padded = logAxisRange(values);
  const ticksOf = (tier: LogTier): readonly number[] =>
    tier === 4 ? enclosingStepTicks(padded, target) : enclosingLeadTicks(padded, LOG_TIER_LEADS[tier]);
  let selected: LogTier = 4;
  for (const tier of [1, 2, 3] as const) {
    if (ticksOf(tier).length >= target) {
      selected = tier;
      break;
    }
  }
  let axis: LogAxis | undefined;
  for (let tier: LogTier = selected; tier >= 1; tier = (tier - 1) as LogTier) {
    const tickValues = ticksOf(tier);
    const range = { lo: tickValues[0]!, hi: tickValues.at(-1)! };
    const texts = tickValues.map(formatLogTickValue);
    axis = { range, values: tickValues, texts, tier, wantedTier: selected };
    if (!logTicksOverlap(tickValues, texts, range, horizontal)) break;
  }
  return axis!;
}

export interface PlotTick {
  readonly value: number;
  readonly position: number;
  readonly text: string;
}

/** 長方形（図の座標）。 */
export interface PlotRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** 点の名前の1行。`x`は行頭、`y`は基準線。 */
export interface PlotNameLine {
  readonly targetKey: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * 点の名前の置き場所。印が重なる点の組は1つの名前にまとめ、行は縦軸の値の大きい順（同じ値なら名前の順）に、上から下、左の列から右の列へ並べる。
 * 行が多い名前は、1列の行数が`NAME_MAX_ROWS`以下になるよう列に分ける。印が重ならない点の名前は1行で、1つの点に対応する。
 */
export interface PlotName {
  readonly lines: readonly PlotNameLine[];
  /** 名前の占める長方形。周りに余白を足してある。名前どうしの重なりはこの長方形の交差で数える。 */
  readonly rect: PlotRect;
  /** 点から離れた場所に置いた名前と、点の印を結ぶ細い線。近くに置いた名前には無い。 */
  readonly leader: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | undefined;
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
  /** 点の名前。点の入力順ではなく、置いた順（印が重なる組が先）に並ぶ。 */
  readonly names: readonly PlotName[];
  readonly contours: readonly PlotContourLine[];
  /** 左右が均等になる50%の位置の線。軸の範囲の外にある線と、対象の軸でない線は含まない。 */
  readonly centerLines: readonly PlotCenterLine[];
  /** 凡例の行が無い時は`undefined`。 */
  readonly legend: PlotLegend | undefined;
  /** 縦軸の名前の基準線のx。目盛りの数字の幅から決め、数字の左に一定の間隔で置く。数字が広い時は負になる。 */
  readonly yTitleX: number;
  /** 図の座標系の左端のx。縦軸の名前の上端が図の左端に掛かる時は、その分だけ負の側へ広げる。それ以外は0。 */
  readonly viewBoxX: number;
}

/** 描画領域の端から端まで引く50%の線。`axis`は線が表す値の軸（`x`は縦線、`y`は横線）。 */
export interface PlotCenterLine {
  readonly axis: 'x' | 'y';
  /** 縦線のx、横線のy。 */
  readonly position: number;
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
  /** その軸の50%の位置に線を引くか。左右の手で全体を分ける割合の軸だけ`true`。 */
  readonly centerAxes?: { readonly x: boolean; readonly y: boolean };
  /**
   * 横軸・縦軸の両方を対数の目盛りにするか。真にできるのは、`logScaleAvailability`が対数にできると答えた図だけ（点の値が全部0より大きい）。
   * 省くと通常の目盛り。
   */
  readonly logScale?: boolean;
}

/**
 * 解析設定の目盛りの種類と、図が対数にできるかから、実際に使う目盛りと、通常の目盛りで描く理由を決める。
 * 対数を選んでいても対数にできない図は通常の目盛りで描き、理由を返す（図の近くに文で出す）。通常を選んでいる時は理由を返さない。
 */
export function resolveLogScale(
  requested: 'linear' | 'log',
  blockers: LogScaleBlockers,
): { readonly logScale: boolean; readonly reasons: readonly (keyof LogScaleBlockers)[] } {
  if (requested !== 'log') return { logScale: false, reasons: [] };
  const reasons = (['noStraightLines', 'nonPositive'] as const).filter((reason) => blockers[reason]);
  return { logScale: reasons.length === 0, reasons };
}

/** 対数の目盛りにできない理由。両方に当たる図は両方が真になる。 */
export interface LogScaleBlockers {
  /** 細い線が直線にならない図（線を引かない図、線の量が2軸の積でも比でもない図）。 */
  readonly noStraightLines: boolean;
  /** 横軸か縦軸の値が0以下の点がある図。 */
  readonly nonPositive: boolean;
}

/**
 * 図を対数の目盛りにできるか。理由ごとに返し、どちらも偽なら対数にできる。
 * 点は、横軸・縦軸の両方の値を持つ描く点だけを渡す（値が無くて描かない点は判定に入れない）。
 */
export function logScaleBlockers(contour: ScatterContour | undefined, points: readonly { readonly x: number; readonly y: number }[]): LogScaleBlockers {
  return {
    noStraightLines: !(contour?.drawsLines === true && contour.straightInLog),
    nonPositive: points.some((p) => !(p.x > 0 && p.y > 0)),
  };
}

/** 左右が均等になる割合 [%]。 */
const CENTER_VALUE = 50;
/** 縦軸の目盛りの数字の左端（枠の左から8px）。 */
const Y_TICK_OFFSET = 8;
/** 縦軸の名前の基準線から、目盛りの数字の左端までの間隔。名前の下端（基準線の下3px）に余白を足した値。 */
const Y_TITLE_GAP = 11;
/** 縦軸の名前の上端（基準線の上10px）に足す、図の左端までの余白。 */
const Y_TITLE_ASCENT = 11;

/** 縦軸の名前の基準線のx。一番広い目盛りの数字の左に、数字の幅によらず一定の間隔で置く。 */
function yTitleX(yTicks: readonly PlotTick[]): number {
  const widest = Math.max(0, ...yTicks.map((tick) => estimateTextWidth(tick.text)));
  return PLOT_LEFT - Y_TICK_OFFSET - widest - Y_TITLE_GAP;
}

const CONTOUR_SAMPLES = 200;
const LEVEL_GRID = 24;
const MAX_LEVELS = 6;

/** 値を描画領域の座標に直す。`log`が真の時は対数の上で直す（値と範囲は0より大きい）。 */
function positionOf(value: number, range: Range, from: number, to: number, log = false): number {
  if (log) return from + ((Math.log(value) - Math.log(range.lo)) / (Math.log(range.hi) - Math.log(range.lo))) * (to - from);
  return from + ((value - range.lo) / (range.hi - range.lo)) * (to - from);
}

/** 細い線を引く値の刻みの下限。値の書式（`formatTickValue`）で区別できる最小の刻み。 */
const MIN_LEVEL_STEP = 1e-6;
/** 描かれた細い線の本数の下限。 */
const MIN_LEVELS = 4;

/** 1・2・5の列で、`step`より1段細かい刻み（0.5 → 0.2 → 0.1 → 0.05）。 */
export function finerStep(step: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const lead = Math.round(step / magnitude);
  return Number((lead === 5 ? 2 * magnitude : lead === 2 ? magnitude : magnitude / 2).toPrecision(12));
}

/**
 * 範囲の中の、`step`の整数倍の値。`MAX_LEVELS`を超える時は、連続する`MAX_LEVELS`個のうち、平均が範囲の中点に最も近いものを残す。
 * 中点からの距離が同じ候補が2つある時は、小さい側を残す。
 */
export function levelsAtStep(range: Range, step: number): readonly number[] {
  const { first, last } = multiplesIn(range, step);
  if (last < first) return [];
  let from = first;
  if (last - first + 1 > MAX_LEVELS) {
    // 連続する6個の平均は、刻みに（先頭の添字 + 2.5）を掛けた値。中点に最も近い添字を、小さい側を優先して選ぶ
    const target = (range.lo + range.hi) / 2 / step - (MAX_LEVELS - 1) / 2;
    const below = Math.floor(target + 1e-9);
    from = target - below <= below + 1 - target + 1e-9 ? below : below + 1;
    from = Math.min(Math.max(from, first), last - MAX_LEVELS + 1);
  }
  const values: number[] = [];
  for (let i = from; i <= last && values.length < MAX_LEVELS; i++) values.push(multiple(i, step));
  return values;
}

/**
 * 細い線の値の選び方。線の量が描画領域の中で取る最小値から最大値までの範囲で、目盛りと同じ1・2・5の刻み（まず`niceTicks`が目標4本で選ぶ刻み）の
 * 値を選ぶ。値が4つに満たない時と、6つに絞った後に描かれた線が4本に満たない時は、刻みを1段ずつ細かくして選び直す。
 * 刻みは`MIN_LEVEL_STEP`より細かくしない。そこまで細かくしても4本に届かない時は、その刻みで引ける線だけを引く。
 */
function selectContours(
  contour: ScatterContour,
  xRange: Range,
  yRange: Range,
  log: boolean,
): { readonly lines: readonly DrawnContour[]; readonly step: number } {
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
  if (!(max > min)) return { lines: [], step: 1 };
  const range = { lo: min, hi: max };
  let step = Math.max(niceTicks(range, 4).step, MIN_LEVEL_STEP);
  for (;;) {
    const finest = finerStep(step) < MIN_LEVEL_STEP * (1 - 1e-9);
    const levels = levelsAtStep(range, step);
    if (levels.length >= MIN_LEVELS || finest) {
      const lines = levels.map((level) => contourLine(contour, level, xRange, yRange, log)).filter((line) => line.d !== '');
      if (lines.length >= MIN_LEVELS || finest) return { lines, step };
    }
    step = finerStep(step);
  }
}

interface DrawnContour {
  readonly level: number;
  readonly d: string;
  /** 値を書く候補の位置。右端から左へ、線に沿って並べる。 */
  readonly anchors: readonly { readonly x: number; readonly y: number }[];
}

function contourLine(contour: ScatterContour, level: number, xRange: Range, yRange: Range, log: boolean): DrawnContour {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= CONTOUR_SAMPLES; i++) {
    // 対数の目盛りでは、標本を対数の上で等間隔に取る
    const x = log ? xRange.lo * (xRange.hi / xRange.lo) ** (i / CONTOUR_SAMPLES) : xRange.lo + ((xRange.hi - xRange.lo) * i) / CONTOUR_SAMPLES;
    const y = contour.yAt(level, x);
    if (y !== undefined && y >= yRange.lo && y <= yRange.hi) {
      current.push({ x: positionOf(x, xRange, PLOT_LEFT, PLOT_RIGHT, log), y: positionOf(y, yRange, PLOT_BOTTOM, PLOT_TOP, log) });
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

/** 描く点の印の大きさ（半径）。 */
export const MARK_RADIUS = 5.5;
/** 印が重なるかを決める中心どうしの距離の境目。印の直径。 */
const MARK_DIAMETER = MARK_RADIUS * 2;
/** 名前を探す時に点の周りに空ける余白。 */
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

type Rect = PlotRect;

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

interface Cluster {
  /** 入力の順の添字。縦軸の値の大きい順（同じ値なら名前の順）に並べてある。 */
  readonly members: readonly number[];
  readonly cx: number;
  readonly cy: number;
}

/** 印が重なる点（中心どうしの距離が印の直径より小さい点）を、つながる限り1つの組にまとめる。 */
function clusterPoints(points: readonly { readonly px: number; readonly py: number; readonly y: number; readonly label: string }[]): Cluster[] {
  const parent = points.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    return root;
  };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i]!.px - points[j]!.px, points[i]!.py - points[j]!.py) < MARK_DIAMETER) parent[find(j)] = find(i);
    }
  }
  const byRoot = new Map<number, number[]>();
  points.forEach((_, index) => {
    const root = find(index);
    byRoot.set(root, [...(byRoot.get(root) ?? []), index]);
  });
  return [...byRoot.values()].map((indices) => {
    const members = [...indices].sort((a, b) => {
      const pa = points[a]!;
      const pb = points[b]!;
      return pb.y - pa.y || (pa.label < pb.label ? -1 : pa.label > pb.label ? 1 : 0);
    });
    const sum = indices.reduce((acc, index) => ({ x: acc.x + points[index]!.px, y: acc.y + points[index]!.py }), { x: 0, y: 0 });
    return { members, cx: sum.x / indices.length, cy: sum.y / indices.length };
  });
}

/** 線分が長方形と交わる（Liang-Barsky）。 */
function segmentHits(segment: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }, rect: Rect): boolean {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, segment.x1 - rect.x0) && clip(dx, rect.x1 - segment.x1) && clip(-dy, segment.y1 - rect.y0) && clip(dy, rect.y1 - segment.y1);
}

/** 名前の行の高さ（基準線の間隔）。 */
const NAME_LINE_HEIGHT = 13;
/** 名前を列に分けない行数の上限。これを超える組は、行数がなるべく揃うよう列に分ける。 */
const NAME_MAX_ROWS = 12;
/** 名前の列と列の間の幅。 */
const NAME_COLUMN_GAP = 14;
/** 点の近くに置けなかった時に試す、点から名前までの距離。 */
const FAR_DISTANCES = [24, 42, 64, 92, 124] as const;
/** 点から名前への向き（右・左・上・下と、斜め4方向）。 */
const FAR_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
] as const;
/** 引き出し線を引く最小の長さ。これより短い置き方には線を付けない。 */
const MIN_LEADER = 6;

interface NameCandidate {
  /** 名前の左端。 */
  readonly x: number;
  readonly firstBaseline: number;
  readonly rect: Rect;
  readonly leader: PlotName['leader'];
}

/** 名前の長方形に最も近い組の点の印の縁から、長方形の最も近い場所へ引く線。短い時は引かない。 */
function leaderOf(cluster: Cluster, points: readonly { readonly px: number; readonly py: number }[], rect: Rect): PlotName['leader'] {
  let best: { px: number; py: number; qx: number; qy: number; distance: number } | undefined;
  for (const index of cluster.members) {
    const p = points[index]!;
    const qx = Math.min(Math.max(p.px, rect.x0), rect.x1);
    const qy = Math.min(Math.max(p.py, rect.y0), rect.y1);
    const distance = Math.hypot(qx - p.px, qy - p.py);
    if (best === undefined || distance < best.distance) best = { px: p.px, py: p.py, qx, qy, distance };
  }
  if (best === undefined || best.distance - MARK_RADIUS < MIN_LEADER) return undefined;
  const ux = (best.qx - best.px) / best.distance;
  const uy = (best.qy - best.py) / best.distance;
  return { x1: best.px + ux * (MARK_RADIUS + 1), y1: best.py + uy * (MARK_RADIUS + 1), x2: best.qx, y2: best.qy };
}

/**
 * 点の名前の置き場所。印が重なる点の組は1つの名前（行を縦軸の値の大きい順に積む）にして、組の点の中心を1つの点とみなして置く。
 * 候補は、点の右・左・上・下（近く）、続けて点から離れた40か所（引き出し線を付ける）の順。他の名前・点の印・引き出し線・図の外と重ならない最初の場所を選ぶ。
 * どこも重なる時は、重なりが最も少ない場所にする。名前は、印が重なる組（大きい組が先）、印が重ならない点の順に置く。
 */
function placeNames(
  points: readonly { readonly targetKey: string; readonly px: number; readonly py: number; readonly y: number; readonly label: string }[],
): PlotName[] {
  const marks: Rect[] = points.map((p) => ({
    x0: p.px - POINT_CLEARANCE,
    x1: p.px + POINT_CLEARANCE,
    y0: p.py - POINT_CLEARANCE,
    y1: p.py + POINT_CLEARANCE,
  }));
  const hitMarks: Rect[] = points.map((p) => ({ x0: p.px - MARK_RADIUS, x1: p.px + MARK_RADIUS, y0: p.py - MARK_RADIUS, y1: p.py + MARK_RADIUS }));
  // 大きい組が先。同じ大きさなら入力の順（組の中で最も小さい添字）
  const order = clusterPoints(points).sort((a, b) => b.members.length - a.members.length || Math.min(...a.members) - Math.min(...b.members));
  const placed: PlotName[] = [];
  for (const cluster of order) {
    const lines = cluster.members.map((index) => points[index]!);
    const rows = lines.length <= NAME_MAX_ROWS ? lines.length : Math.ceil(lines.length / Math.ceil(lines.length / NAME_MAX_ROWS));
    const columnCount = Math.ceil(lines.length / rows);
    const columnWidths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(...lines.slice(column * rows, (column + 1) * rows).map((line) => estimateTextWidth(line.label))),
    );
    const columnOffsets = columnWidths.map((_, column) => columnWidths.slice(0, column).reduce((sum, w) => sum + w + NAME_COLUMN_GAP, 0));
    const width = columnOffsets[columnCount - 1]! + columnWidths[columnCount - 1]!;
    const own = new Set(cluster.members);
    const span = NAME_LINE_HEIGHT * (rows - 1);
    // 文字の高さは基準線の上10.5・下3.5。周りに1ずつ余白を足す
    const build = (x: number, firstBaseline: number, withLeader: boolean): NameCandidate => {
      const rect = { x0: x - 1, x1: x + width + 1, y0: firstBaseline - 11.5, y1: firstBaseline + span + 4.5 };
      return { x, firstBaseline, rect, leader: withLeader ? leaderOf(cluster, points, rect) : undefined };
    };
    // 上下の候補は、点の真上・真下に置き、横に枠から出る時は枠の中へ寄せる
    const centered = (baseline: number): NameCandidate => {
      const left = Math.min(Math.max(cluster.cx - width / 2, PLOT_LEFT + FRAME_MARGIN + 1), PLOT_RIGHT - FRAME_MARGIN - 1 - width);
      return build(left, baseline, false);
    };
    const candidates: NameCandidate[] = [
      build(cluster.cx + 9, cluster.cy + 4 - span / 2, false),
      build(cluster.cx - 9 - width, cluster.cy + 4 - span / 2, false),
      centered(cluster.cy - 10 - span),
      centered(cluster.cy + 19),
    ];
    for (const distance of FAR_DISTANCES) {
      for (const [ux, uy] of FAR_DIRECTIONS) {
        const tx = cluster.cx + ux * distance;
        const ty = cluster.cy + uy * distance;
        const x = ux > 0.3 ? tx : ux < -0.3 ? tx - width : tx - width / 2;
        const baseline = uy < -0.3 ? ty - span : uy > 0.3 ? ty + 10 : ty + 4 - span / 2;
        // 枠の中へ寄せる。名前が長い・高い時は寄せきれず、枠から出る分が費用に入る
        const probe = build(x, baseline, false).rect;
        const shiftX = Math.max(0, PLOT_LEFT + FRAME_MARGIN - probe.x0) - Math.max(0, probe.x1 - (PLOT_RIGHT - FRAME_MARGIN));
        const shiftY = Math.max(0, PLOT_TOP + FRAME_MARGIN - probe.y0) - Math.max(0, probe.y1 - (PLOT_BOTTOM - FRAME_MARGIN));
        candidates.push(build(x + shiftX, baseline + shiftY, true));
      }
    }
    let best = candidates[0]!;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const { rect, leader } = candidate;
      // 枠の外へ出る置き方は、他の名前・点と重なる置き方より必ず後にする。どれも出る時は、出る量が少ない方
      const overshoot =
        Math.max(0, PLOT_LEFT + FRAME_MARGIN - rect.x0) +
        Math.max(0, rect.x1 - (PLOT_RIGHT - FRAME_MARGIN)) +
        Math.max(0, PLOT_TOP + FRAME_MARGIN - rect.y0) +
        Math.max(0, rect.y1 - (PLOT_BOTTOM - FRAME_MARGIN));
      const leaderHits =
        leader === undefined
          ? 0
          : placed.filter((other) => segmentHits(leader, other.rect)).length +
            hitMarks.filter((mark, index) => !own.has(index) && segmentHits(leader, mark)).length;
      const cost =
        (overshoot > 0 ? 1e6 + overshoot * 1000 : 0) +
        placed.filter((other) => overlaps(rect, other.rect)).length +
        marks.filter((mark) => overlaps(rect, mark)).length +
        placed.filter((other) => other.leader !== undefined && segmentHits(other.leader, rect)).length +
        leaderHits;
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
      if (cost === 0) break;
    }
    placed.push({
      lines: lines.map((line, index) => ({
        targetKey: line.targetKey,
        text: line.label,
        x: best.x + columnOffsets[Math.floor(index / rows)]!,
        y: best.firstBaseline + NAME_LINE_HEIGHT * (index % rows),
      })),
      rect: best.rect,
      leader: best.leader,
    });
  }
  return placed;
}

/** 散布図の座標。点が無い時も軸の目盛りは返す。 */
export function scatterPlotModel(input: ScatterPlotInput): ScatterPlotModel {
  const log = input.logScale === true;
  const xLog = log
    ? logAxis(
        input.points.map((p) => p.x),
        6,
        true,
      )
    : undefined;
  const yLog = log
    ? logAxis(
        input.points.map((p) => p.y),
        5,
        false,
      )
    : undefined;
  const xRange = xLog?.range ?? axisRange(input.points.map((p) => p.x));
  const yRange = yLog?.range ?? axisRange(input.points.map((p) => p.y));
  let xTicks: PlotTick[];
  let yTicks: PlotTick[];
  if (xLog !== undefined && yLog !== undefined) {
    const xl = xLog;
    const yl = yLog;
    xTicks = xl.values.map((value, i) => ({ value, position: positionOf(value, xRange, PLOT_LEFT, PLOT_RIGHT, true), text: xl.texts[i]! }));
    yTicks = yl.values.map((value, i) => ({ value, position: positionOf(value, yRange, PLOT_BOTTOM, PLOT_TOP, true), text: yl.texts[i]! }));
  } else {
    const xt = niceTicks(xRange, 6);
    const yt = niceTicks(yRange, 5);
    xTicks = xt.values.map((value) => ({ value, position: positionOf(value, xRange, PLOT_LEFT, PLOT_RIGHT), text: formatTickValue(value, xt.step) }));
    yTicks = yt.values.map((value) => ({ value, position: positionOf(value, yRange, PLOT_BOTTOM, PLOT_TOP), text: formatTickValue(value, yt.step) }));
  }
  const positioned = input.points.map((p) => ({
    ...p,
    px: positionOf(p.x, xRange, PLOT_LEFT, PLOT_RIGHT, log),
    py: positionOf(p.y, yRange, PLOT_BOTTOM, PLOT_TOP, log),
  }));
  const names = placeNames(positioned);
  const points = positioned;
  const marks: Rect[] = positioned.map((p) => ({
    x0: p.px - POINT_CLEARANCE,
    x1: p.px + POINT_CLEARANCE,
    y0: p.py - POINT_CLEARANCE,
    y1: p.py + POINT_CLEARANCE,
  }));
  let drawn: readonly DrawnContour[] = [];
  let step = 1;
  if (input.contour?.drawsLines === true && input.points.length > 0) {
    const selected = selectContours(input.contour, xRange, yRange, log);
    step = selected.step;
    drawn = selected.lines;
  }
  const centerLines: PlotCenterLine[] = [];
  if (input.points.length > 0) {
    if (input.centerAxes?.x === true && xRange.lo <= CENTER_VALUE && CENTER_VALUE <= xRange.hi) {
      centerLines.push({ axis: 'x', position: positionOf(CENTER_VALUE, xRange, PLOT_LEFT, PLOT_RIGHT, log) });
    }
    if (input.centerAxes?.y === true && yRange.lo <= CENTER_VALUE && CENTER_VALUE <= yRange.hi) {
      centerLines.push({ axis: 'y', position: positionOf(CENTER_VALUE, yRange, PLOT_BOTTOM, PLOT_TOP, log) });
    }
  }
  // 凡例は枠の中の隅に置く。細い線の行は、線を1本以上描く時だけ付ける
  const legend = placeLegend(
    drawn.length > 0 ? [...input.legendRows, input.contourName] : input.legendRows,
    marks,
    names.map((placed) => placed.rect),
  );
  const occupied: Rect[] = [
    ...names.map((placed) => placed.rect),
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
  const titleX = yTitleX(yTicks);
  return { xTicks, yTicks, points, names, contours, centerLines, legend, yTitleX: titleX, viewBoxX: Math.min(0, titleX - Y_TITLE_ASCENT) };
}

import type { ScatterContour } from './axes.ts';
import { axisUnit } from './axis-names.ts';

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

/**
 * 一定の刻み（1・2・5の10の冪乗倍）の値の候補を、粗い刻みから順に並べる。`padded`を含む最も狭い範囲に入る値で、
 * 範囲の下端が0以下になる刻みは除く。最後の候補が、目標の本数に届く最も粗い刻み（届く刻みが無ければ最も細かい刻み）。
 */
function stepTickCandidates(padded: Range, target: number): readonly (readonly number[])[] {
  const candidates: (readonly number[])[] = [];
  for (let exponent = Math.ceil(Math.log10(padded.hi)); exponent >= -9; exponent--) {
    for (const lead of [5, 2, 1]) {
      const step = Number((lead * 10 ** exponent).toPrecision(12));
      const first = Math.floor(padded.lo / step + 1e-9);
      if (first < 1) continue;
      const last = Math.ceil(padded.hi / step - 1e-9);
      const values: number[] = [];
      for (let i = first; i <= last; i++) values.push(multiple(i, step));
      candidates.push(values);
      if (values.length >= target) return candidates;
    }
  }
  return candidates;
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
 * 余白を足した範囲の最大が最小の10倍に満たない軸は、一定の刻みの段だけを使う（1〜3つ目の段は、1と2の間のように比が2倍の区間に
 * 目盛りが無く、点が集まる区間を読めないため）。刻みは、目盛りの数が`target`以上になる最も粗い刻みにする。
 * 10倍以上の軸は、1〜3つ目の段のうち目盛りの数が`target`以上になる最も粗い段を使い、届かない時は一定の刻みの段を使う。
 * 隣の数字が重なる時は、重ならない段（一定の刻みでは刻み）まで1つずつ粗くする。
 * 重なりが解けない時は、10倍以上の軸は1つ目の段を使う。10倍に満たない軸は、軸の下端を0より大きくできる刻みが細かい刻みしか無い
 * ことがあり、その刻みで重なる時は、10倍以上の軸と同じ1〜3つ目の段の選び方に切り替える。
 */
export function logAxis(values: readonly number[], target: number, horizontal: boolean): LogAxis {
  const padded = logAxisRange(values);
  const overlaps = (ticks: readonly number[]): boolean =>
    logTicksOverlap(ticks, ticks.map(formatLogTickValue), { lo: ticks[0]!, hi: ticks.at(-1)! }, horizontal);
  const axisOf = (ticks: readonly number[], tier: LogTier, wantedTier: LogTier): LogAxis => ({
    range: { lo: ticks[0]!, hi: ticks.at(-1)! },
    values: ticks,
    texts: ticks.map(formatLogTickValue),
    tier,
    wantedTier,
  });
  const stepAxis = (): LogAxis | undefined => {
    const candidates = stepTickCandidates(padded, target);
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!overlaps(candidates[i]!)) return axisOf(candidates[i]!, 4, 4);
    }
    return undefined;
  };
  if (padded.hi < padded.lo * 10) {
    const axis = stepAxis();
    if (axis !== undefined) return axis;
  }
  let wanted: LogTier = 4;
  for (const tier of [1, 2, 3] as const) {
    if (enclosingLeadTicks(padded, LOG_TIER_LEADS[tier]).length >= target) {
      wanted = tier;
      break;
    }
  }
  if (wanted === 4) {
    const axis = stepAxis();
    if (axis !== undefined) return axis;
  }
  const top: 1 | 2 | 3 = wanted === 4 ? 3 : wanted;
  for (let tier = top; tier >= 1; tier--) {
    const ticks = enclosingLeadTicks(padded, LOG_TIER_LEADS[tier as 1 | 2 | 3]);
    if (!overlaps(ticks) || tier === 1) return axisOf(ticks, tier as LogTier, wanted);
  }
  throw new Error('unreachable');
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

/** 点の名前の1行。`x`は名前の`anchor`が指す位置（行の右端・左端）、`y`は基準線。 */
export interface PlotNameLine {
  readonly targetKey: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * 点の名前の置き場所。印が重なる点の組は1つの名前にまとめ、行は縦軸の値の大きい順（同じ値なら名前の順）に、上から下、左の列から右の列へ並べる。
 * 行が多い名前は、1列の行数が`NAME_MAX_ROWS`以下になるよう列に分ける。印が重ならない点の名前は1行で、1つの点に対応する。
 * 印が重なる2点で、まとめた名前を点の近くに置けず、2点の横の位置が違い、左の点の左と右の点の右に重ならずに置ける時だけ、組を1行の名前2つに分ける。
 */
export interface PlotName {
  readonly lines: readonly PlotNameLine[];
  /** 行をそろえる向き。点の左の名前は右端（`end`）、点の右の名前は左端（`start`）。点の上下の名前は、点の箱の横の中央が名前の長方形の横の中央より左なら左端、そうでなければ右端。列に分けた名前は列ごとに同じ向き。描画の`text-anchor`にそのまま使う。 */
  readonly anchor: 'start' | 'end';
  /** 名前の全ての行を囲む長方形。周りに余白を足してある。点との隙間と、図の枠からはみ出すかは、この長方形で測る。 */
  readonly rect: PlotRect;
  /** 行ごとの、その行の字が占める長方形（周りの余白は`rect`と同じ）。他の名前・点の印・線との重なりは、これらの長方形で数える。 */
  readonly boxes: readonly PlotRect[];
  /** 点のすぐ横より離れた場所に置いた名前と、点の印を結ぶ細い線。点のすぐ横に置いた名前には無い。 */
  readonly leader: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | undefined;
}

/**
 * 名前の行をそろえる向き。点の左に離れた名前は右端、右に離れた名前は左端。
 * 横の範囲が点の箱と重なる名前（点の上下の名前）は、点の箱の横の中央が名前の長方形の横の中央より左なら左端、そうでなければ右端。
 * 点の側の行の端が、点の箱の横の中央に近い側にそろう。
 */
function anchorOf(rect: Rect, box: Rect): PlotName['anchor'] {
  if (rect.x1 <= box.x0) return 'end';
  if (rect.x0 >= box.x1) return 'start';
  return box.x0 + box.x1 < rect.x0 + rect.x1 ? 'start' : 'end';
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
 * 範囲の中の、`step`の整数倍の値。`limit`を超える時は、連続する`limit`個のうち、平均が範囲の中点に最も近いものを残す。
 * 中点からの距離が同じ候補が2つある時は、小さい側を残す。`limit`の既定は`MAX_LEVELS`。
 */
export function levelsAtStep(range: Range, step: number, limit = MAX_LEVELS): readonly number[] {
  const { first, last } = multiplesIn(range, step);
  if (last < first) return [];
  let from = first;
  if (last - first + 1 > limit) {
    // 連続するlimit個の平均は、刻みに（先頭の添字 + (limit - 1) / 2）を掛けた値。中点に最も近い添字を、小さい側を優先して選ぶ
    const target = (range.lo + range.hi) / 2 / step - (limit - 1) / 2;
    const below = Math.floor(target + 1e-9);
    from = target - below <= below + 1 - target + 1e-9 ? below : below + 1;
    from = Math.min(Math.max(from, first), last - limit + 1);
  }
  const values: number[] = [];
  for (let i = from; i <= last && values.length < limit; i++) values.push(multiple(i, step));
  return values;
}

/** 割合の線の量で、刻みが粗い時に置き換える刻み（%）。 */
const PERCENT_STEP = 10;

/**
 * 割合（%）の線の値。刻みが`PERCENT_STEP`の時、本数を絞らず、0%より大きく100%より小さい値のうち範囲に入るものを全部返す。
 * 0%と100%の線は、軸の上か描画領域の外に重なり、対数の目盛りでは引けないので返さない。
 */
function percentLevels(range: Range): readonly number[] {
  return levelsAtStep(range, PERCENT_STEP, Number.POSITIVE_INFINITY).filter((level) => level > 0 && level < 100);
}

/**
 * 細い線の値の選び方。線の量が描画領域の中で取る最小値から最大値までの範囲で、目盛りと同じ1・2・5の刻み（まず`niceTicks`が目標4本で選ぶ刻み）の
 * 値を選ぶ。値が4つに満たない時と、6つに絞った後に描かれた線が4本に満たない時は、刻みを1段ずつ細かくして選び直す。
 * 刻みは`MIN_LEVEL_STEP`より細かくしない。そこまで細かくしても4本に届かない時は、その刻みで引ける線だけを引く。
 *
 * 線の量が割合（単位が%）の時だけ、選ばれた刻みが10%より粗ければ10%に置き換える。刻みが10%の時は6本に絞らず、
 * 10%から90%までの範囲に入る線を全部引く（最大9本）。4本の下限は0%と100%を除く前の本数で数える（刻みを細かくする繰り返しは置き換えの前に終わる）ので、
 * 範囲が0%に届く図では、0%を除いて3本になることがある。0%の線は軸そのものが代わりになるので、細かくし直さない。
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
  const draw = (levels: readonly number[]) => levels.map((level) => contourLine(contour, level, xRange, yRange, log)).filter((line) => line.d !== '');
  let step = Math.max(niceTicks(range, 4).step, MIN_LEVEL_STEP);
  let selected: { readonly lines: readonly DrawnContour[]; readonly step: number };
  for (;;) {
    const finest = finerStep(step) < MIN_LEVEL_STEP * (1 - 1e-9);
    const levels = levelsAtStep(range, step);
    if (levels.length >= MIN_LEVELS || finest) {
      const lines = draw(levels);
      if (lines.length >= MIN_LEVELS || finest) {
        selected = { lines, step };
        break;
      }
    }
    step = finerStep(step);
  }
  if (axisUnit(contour.column) === '%' && selected.step >= PERCENT_STEP) {
    return { lines: draw(percentLevels(range)), step: PERCENT_STEP };
  }
  return selected;
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

/** 長方形の集まりのどれかが、もう一方の集まりのどれかと重なる。 */
function anyOverlap(a: readonly Rect[], b: readonly Rect[]): boolean {
  return a.some((x) => b.some((y) => overlaps(x, y)));
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
/** 名前の長方形と点の箱の隙間の段。1pxは点のすぐ横。隙間を細かい刻みで上限まで広げる。 */
const GAP_LEVELS = [1, 2, 3, 4, 6, 8, 11, 15, 20, 26, 34, 44, 58, 76, 98, 124] as const;
/** 名前を点の箱に沿ってずらす刻み。隙間が`SLIDE_FINE_GAP`以下の段は細かく、それより離れた段は粗くする。 */
const SLIDE_STEP_NEAR = 2;
const SLIDE_STEP_FAR = 4;
const SLIDE_FINE_GAP = 8;
/** 名前の行の長方形が他の名前の行・点の印と重なる1か所を、引き出し線の交差1か所より重く数える重み。線が名前の字を通る置き方より、名前どうしが重なる置き方を後にする。 */
const OVERLAP_WEIGHT = 1000;
/** 引き出し線を引く最小の隙間。これより近い置き方には線を付けない。 */
const MIN_LEADER = 6;
/** 短い線を付ける隙間の下限。隙間1pxは点のすぐ横（候補の段の最小）なので、それより離れた名前に付ける */
const SHORT_LEADER = 2;
/** 短い線の先を、名前の長方形からこれだけ内側に寄せる。長方形は字の周りに余白を持つので、線の先を字の縁に近づける */
const SHORT_LEADER_INSET = 2.5;
/** 印が重なる2点の名前を分けて置く条件。2点の横の位置の差がこれ以上（これ未満は描画の丸めで同じ位置に見える）。 */
const SPLIT_MIN_DX = 0.5;
/** 点の中心から、その点の横に置く名前までの間隔。 */
const NAME_GAP = 9;

interface NameCandidate {
  /** 名前の左端。 */
  readonly x: number;
  /** 行をそろえる向き。名前の長方形と点の箱の横の位置関係で決まる。 */
  readonly anchor: PlotName['anchor'];
  readonly firstBaseline: number;
  readonly rect: Rect;
  /** 行ごとの字の長方形。`PlotName.boxes`と同じ。 */
  readonly boxes: readonly Rect[];
  /** 名前の長方形と、組の点のうち一番近い点の余白の正方形との間の距離（上下左右のうち一番大きい差。重なれば0未満）。 */
  readonly gap: number;
  readonly leader: PlotName['leader'];
}

/**
 * 候補を比べる時の隙間。点のすぐ横（`GAP_LEVELS`の最小）より近い置き方は、図の中へ寄せた結果として生じるので、すぐ横と同じ順位にする。
 * 寄せた結果の隙間が1pxを下回る上や下の候補が、右や左の候補より先に選ばれないようにするため。
 */
function rankOf(candidate: { readonly gap: number }): number {
  return Math.max(candidate.gap, GAP_LEVELS[0]);
}

/** 長方形と、組の点のうち一番近い点（隙間が同じなら中心が近い点）。隙間は点の余白の正方形から測る。 */
function nearestMember(
  members: readonly number[],
  squares: readonly Rect[],
  centers: readonly { readonly px: number; readonly py: number }[],
  rect: Rect,
): { readonly gap: number; readonly index: number } {
  let best = { gap: Number.POSITIVE_INFINITY, index: members[0]!, distance: Number.POSITIVE_INFINITY };
  for (const index of members) {
    const square = squares[index]!;
    const gap = Math.max(rect.x0 - square.x1, square.x0 - rect.x1, rect.y0 - square.y1, square.y0 - rect.y1);
    const c = centers[index]!;
    const distance = Math.hypot(Math.min(Math.max(c.px, rect.x0), rect.x1) - c.px, Math.min(Math.max(c.py, rect.y0), rect.y1) - c.py);
    if (gap < best.gap || (gap === best.gap && distance < best.distance)) best = { gap, index, distance };
  }
  return best;
}

/** 点の印の縁から、名前の長方形の一番近い場所へ引く線。 */
function leaderTo(point: { readonly px: number; readonly py: number }, rect: Rect): NonNullable<PlotName['leader']> {
  const qx = Math.min(Math.max(point.px, rect.x0), rect.x1);
  const qy = Math.min(Math.max(point.py, rect.y0), rect.y1);
  const distance = Math.hypot(qx - point.px, qy - point.py);
  const ux = (qx - point.px) / distance;
  const uy = (qy - point.py) / distance;
  return { x1: point.px + ux * (MARK_RADIUS + 1), y1: point.py + uy * (MARK_RADIUS + 1), x2: qx, y2: qy };
}

type Segment = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

/** 2本の線分が互いの内側で交わる。端が触れるだけ・重なって並ぶ場合は交わらないとみなす。 */
function segmentsCross(a: Segment, b: Segment): boolean {
  const side = (s: Segment, x: number, y: number): number => (s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1);
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0;
}

/** 置いた名前を、後から別の位置へ動かすために残す、その名前の組の候補と費用の計算。 */
interface NameSlot {
  /** 引き出し線が付かない（隙間が`MIN_LEADER`未満の）候補。点に近い順、同じ隙間では最初に置く時と同じ順。 */
  readonly nearCandidates: () => readonly NameCandidate[];
  /** `candidate`の重なりの数。`limit`を超えると無限大。 */
  readonly costOf: (candidate: NameCandidate, others: readonly PlotName[], limit: number) => number;
  /** 重なりが、`others`の名前の行の長方形との重なりだけの時、重なる名前。他の重なり（点の印・図の外・引き出し線）がある時は`undefined`。 */
  readonly blockersOf: (candidate: NameCandidate, others: readonly PlotName[]) => readonly PlotName[] | undefined;
  readonly toName: (candidate: NameCandidate) => PlotName;
}

/**
 * 点の名前の置き場所。印が重なる点の組は1つの名前（行を縦軸の値の大きい順に積む）にして、組の点の余白の正方形を全て囲む長方形（点の箱）の周りに置く。
 * 名前と点の距離（隙間）は、組の点のうち名前に一番近い点の余白の正方形と名前の長方形の間で測る。図の中へ寄せた後の位置で測る。
 * 候補は、隙間が1px（点のすぐ横）から124pxまでの段ごとに、点の箱に沿って名前を一周ずらした位置と、箱の4つの角の斜め外側。
 * 重なりの数（他の名前・点の印・引き出し線と名前・引き出し線どうし・図の外）が少ない候補を選び、同じなら隙間が小さい候補を選ぶ。
 * 名前が他の名前・点の印・線と重なるかは、名前の行ごとの字の長方形で測る。2行以上の名前の短い行の横の空いた所は、他のものが使えるようにするため。隙間と図の外へのはみ出しは、全ての行を囲む長方形で測る。
 * 名前の行の長方形が他の名前の行・点の印と重なる1か所は、線の交差1か所より重く数える。線が名前の字を通る置き方の方が、名前どうしが重なる置き方より読める。
 * 同じ隙間（1px未満は1pxとみなす）の候補は、辺の候補を名前の縦の中央が組の中心の高さに近い順に、続けて角の順に比べ、最初の候補を選ぶ。点の高さの近くに置いた名前の方が、どの点の名前か読み取りやすいため。
 * 高さの近さが同じ辺の候補は、右・左の辺では縦の中央からのずれが、上・下の辺では名前の左端を点の箱の左端にそろえた位置（名前が点から右へ伸びる）からのずれが小さい順に、右・左・下・上の辺の順に比べる。
 * 隙間が`MIN_LEADER`以上の名前には、一番近い点の印の縁から名前の長方形へ細い引き出し線を付ける。この説明の「引き出し線」は、この線だけを指す（下の短い線を含まない）。
 * 名前は、印が重なる組（大きい組が先）、印が重ならない点の順に置く。
 * 行は、点の左の名前は右端、点の右の名前は左端、点の上下の名前は点の箱の横の中央が名前の長方形の横の中央より左なら左端、そうでなければ右端でそろえる（列に分けた名前は列ごとに同じ）。上下の名前は、名前の長方形の左端を点の箱の左端にそろえた位置から試す。
 * 点の左右の名前では、点の側の行の端が名前の長方形の端と一致するので、長方形で測った隙間が見え方と合う。引き出し線も名前の長方形の縁で終わるので、2行以上の名前では短い行の字から離れた所で終わることがある。
 * 2行以上の名前は、点の左右に置く候補を、組の中心の高さが1行目と最終行の文字の縦の中央の間にある位置に限り（図の中へ寄せた後で判定する）、角の候補を使わない。
 * 点の高さから遠い行だけが点のそばに残る置き方を避けるため。上下の候補と1行の名前の候補は変えない。
 * 印が重なる2点の組は、まず点ごとに1行の名前を分けて置けるか試す。各点を1点だけの組とみなした時の、引き出し線が付かない候補（隙間が`MIN_LEADER`未満）のうち、
 * 組の2点以外の全ての点との隙間が`MIN_LEADER`以上（他の点の名前を線無しで置ける範囲を取らない）、自分の点との隙間がもう1つの点との隙間より小さく、重なりが無いものに限る。
 * さらに2つの名前の並びは2点の並びと同じにする。2点の縦の差の大きさが横の差の大きさ以上なら縦で比べ、画面の上の点の名前の長方形の縦の中央が、下の点の名前のそれより上にある。そうでなければ横で比べ、左の点の名前の長方形の横の中央が、右の点の名前のそれより左にある。
 * 自分の点の方が近く、並びが点と同じなので、引き出し線が無くても名前は自分の点のものと読める（自分の点との隙間が`SHORT_LEADER`以上なら、最後に短い線も付く）。
 * 縦軸の値が大きい点の候補を先に、候補の順（隙間の小さい順、同じ隙間では名前の高さが点に近い辺の候補、続けて角）に試し、もう1つの点の名前が置ける（重ならず、並びが点と同じになる）最初の組み合わせを採る。2点の横の位置の差は問わない。
 * 分けて置けない組は、まとめた名前を置く。まとめた名前を引き出し線無しで重ならずに置けず、2点の横の位置が`SPLIT_MIN_DX`以上違う時に限り、
 * 左の点の左と右の点の右に1行の名前を1つずつ（引き出し線無しで、点の高さにそろえて）置けるなら、そう置く。片方でも重なる時は、まとめた名前の置き方に戻る。
 *
 * 全ての名前を置いた後、`yieldToNeighbors`が真なら、引き出し線の付いた名前を置いた順に1つずつ見直す。
 * 先に見直した名前が動いて、その名前の組の線が付かない候補がどの名前とも重ならなくなっていれば（点の印・図の外・引き出し線との重なりも無ければ）、他の名前を動かさずに、そのうち最初の候補へ置き直す。
 * その名前の組の、線が付かない候補の行の長方形が、ちょうど1つの名前の行の長方形とだけ重なる（点の印・図の外・引き出し線との重なりが無い）時、重なる名前を別の位置へ動かせるか調べる。
 * 動かす名前は、組の名前をまとめて置いたものに限る（分けて置いた名前は動かさない）。
 * 動かす名前の線が付かない候補のうち、2つの名前を外した状態で（行の長方形で測って）重なりが無く、動かした状態で線の付いていた名前の候補にも行の長方形の重なりが無いものがあれば、
 * 動かして、線の付いていた名前をその候補に置き直す（線は付かなくなる）。探す順は、線の付いていた名前の候補、重なる名前、重なる名前の移り先の順で、最初に見つかった組み合わせを採る。
 * 動かした名前と、線を無くした名前は、別の名前のために動かさない。
 *
 * 最後に（見直しの後）、隙間が`SHORT_LEADER`以上`MIN_LEADER`未満の名前に、引き出し線と同じ形の短い線を付ける。置き場所を選ぶ時の重なりにも、見直しにも使わない。
 * 点のすぐ横に置けなかった名前の、どの点のものかを示す最後の手段なので、他の名前の字を通ってもよい。
 */
export function placeNames(
  points: readonly { readonly targetKey: string; readonly px: number; readonly py: number; readonly y: number; readonly label: string }[],
  yieldToNeighbors = true,
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
  // placedと添字をそろえる。分けて置いた名前は動かさないので`undefined`
  const slots: (NameSlot | undefined)[] = [];
  // 名前を置く単位（組）ごとに、候補の作り方と重なりの数え方を用意する。1点だけの組は、印が重なる2点の名前を分けて置く時にも使う
  const prepare = (cluster: Cluster) => {
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
    const rectWidth = width + 2;
    const rectHeight = span + 16;
    // 行ごとの字の長方形。短い行の横の空いた所に、他の名前・点の印・線を置けるようにする
    const lineWidths = lines.map((line) => estimateTextWidth(line.label));
    const boxesOf = (rect: Rect, anchor: PlotName['anchor']): Rect[] =>
      lines.map((_, index) => {
        const column = Math.floor(index / rows);
        const at = rect.x0 + 1 + columnOffsets[column]! + (anchor === 'end' ? columnWidths[column]! : 0);
        const left = anchor === 'end' ? at - lineWidths[index]! : at;
        const y0 = rect.y0 + NAME_LINE_HEIGHT * (index % rows);
        return { x0: left - 1, x1: left + lineWidths[index]! + 1, y0, y1: y0 + 16 };
      });
    const box = cluster.members.reduce<Rect>(
      (acc, index) => {
        const mark = marks[index]!;
        return { x0: Math.min(acc.x0, mark.x0), x1: Math.max(acc.x1, mark.x1), y0: Math.min(acc.y0, mark.y0), y1: Math.max(acc.y1, mark.y1) };
      },
      { x0: Number.POSITIVE_INFINITY, x1: Number.NEGATIVE_INFINITY, y0: Number.POSITIVE_INFINITY, y1: Number.NEGATIVE_INFINITY },
    );
    // 右・左の辺では名前の縦の中央を点の高さにそろえた時の長方形の上端。上・下の辺では名前の左端を点の箱の左端にそろえた時の左端（名前が点から右へ伸びる）
    const alignedX0 = box.x0;
    const centeredY0 = cluster.cy + 4 - span / 2 - 11.5;
    // 候補の長方形を図の中へ寄せ、その位置で隙間を測り直す。名前が長い・高い時は寄せきれず、枠から出る分が費用に入る
    // `nearOnly`の時は、寄せた後も隙間が`MIN_LEADER`未満にならない候補（段`d`から寄せた量だけ隙間が縮んでも届かない候補）を作らない
    // `side`は点の左右に置く候補。2行以上の名前は、組の中心の高さが1行目と最終行の文字の縦の中央の間にある位置に限り、角の候補は作らない
    const make = (x0: number, y0: number, d: number, nearOnly: boolean, kind: 'side' | 'edge' | 'corner'): NameCandidate | undefined => {
      if (rows >= 2 && kind === 'corner') return undefined;
      const shiftX = Math.max(0, PLOT_LEFT + FRAME_MARGIN - x0) - Math.max(0, x0 + rectWidth - (PLOT_RIGHT - FRAME_MARGIN));
      const shiftY = Math.max(0, PLOT_TOP + FRAME_MARGIN - y0) - Math.max(0, y0 + rectHeight - (PLOT_BOTTOM - FRAME_MARGIN));
      if (nearOnly && d - Math.max(Math.abs(shiftX), Math.abs(shiftY)) >= MIN_LEADER) return undefined;
      const rect = { x0: x0 + shiftX, x1: x0 + shiftX + rectWidth, y0: y0 + shiftY, y1: y0 + shiftY + rectHeight };
      if (rows >= 2 && kind === 'side') {
        const firstCenter = rect.y0 + 11.5 - 4;
        if (cluster.cy < firstCenter || cluster.cy > firstCenter + span) return undefined;
      }
      const nearest = nearestMember(cluster.members, marks, points, rect);
      const anchor = anchorOf(rect, box);
      return {
        x: rect.x0 + 1,
        anchor,
        firstBaseline: rect.y0 + 11.5,
        rect,
        boxes: boxesOf(rect, anchor),
        gap: nearest.gap,
        leader: nearest.gap >= MIN_LEADER ? leaderTo(points[nearest.index]!, rect) : undefined,
      };
    };
    // 隙間`d`の段の候補。辺の候補を名前の縦の中央が組の中心の高さに近い順に並べ、最後に4つの角を置く。
    // 近さが同じ辺の候補は、右・左の辺は縦の中央からのずれが、上・下の辺は名前の左端を点の箱の左端にそろえた位置からのずれが小さい順に、右・左・下・上の辺の順
    const candidatesAt = (d: number, nearOnly = false): NameCandidate[] => {
      const found: NameCandidate[] = [];
      const add = (x0: number, y0: number, kind: 'side' | 'edge' | 'corner'): void => {
        const candidate = make(x0, y0, d, nearOnly, kind);
        if (candidate !== undefined) found.push(candidate);
      };
      const step = d <= SLIDE_FINE_GAP ? SLIDE_STEP_NEAR : SLIDE_STEP_FAR;
      const reach = Math.ceil((Math.max(rectWidth, rectHeight) + Math.max(box.x1 - box.x0, box.y1 - box.y0) + 2 * d) / step);
      for (let k = 0; k <= reach; k++) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          const dy = centeredY0 + sign * k * step;
          if (dy + rectHeight > box.y0 - d && dy < box.y1 + d) {
            add(box.x1 + d, dy, 'side');
            add(box.x0 - d - rectWidth, dy, 'side');
          }
          const dx = alignedX0 + sign * k * step;
          if (dx + rectWidth > box.x0 - d && dx < box.x1 + d) {
            add(dx, box.y1 + d, 'edge');
            add(dx, box.y0 - d - rectHeight, 'edge');
          }
        }
      }
      // 近さが同じなら、上で並べた順のまま（`sort`は安定）
      found.sort((a, b) => Math.abs((a.rect.y0 + a.rect.y1) / 2 - cluster.cy) - Math.abs((b.rect.y0 + b.rect.y1) / 2 - cluster.cy));
      add(box.x1 + d, box.y1 + d, 'corner');
      add(box.x0 - d - rectWidth, box.y1 + d, 'corner');
      add(box.x1 + d, box.y0 - d - rectHeight, 'corner');
      add(box.x0 - d - rectWidth, box.y0 - d - rectHeight, 'corner');
      return found;
    };
    // 候補の周り（段の上限まで離れた範囲）に掛かるものだけを、費用の計算に使う
    const region = {
      x0: box.x0 - GAP_LEVELS[GAP_LEVELS.length - 1]! - rectWidth,
      x1: box.x1 + GAP_LEVELS[GAP_LEVELS.length - 1]! + rectWidth,
      y0: box.y0 - GAP_LEVELS[GAP_LEVELS.length - 1]! - rectHeight,
      y1: box.y1 + GAP_LEVELS[GAP_LEVELS.length - 1]! + rectHeight,
    };
    const nearMarks = marks.filter((mark) => overlaps(mark, region));
    const nearHitMarks = hitMarks.filter((mark, index) => !own.has(index) && overlaps(mark, region));
    const nearNames = placed.filter((other) => overlaps(other.rect, region) || (other.leader !== undefined && segmentHits(other.leader, region)));
    // 重なりの数。`limit`を超えると数えるのをやめて無限大を返す
    const costOf = (candidate: NameCandidate, others: readonly PlotName[], limit: number): number => {
      const { rect, boxes, leader } = candidate;
      // 枠の外へ出る置き方は、他の名前・点と重なる置き方より必ず後にする。どれも出る時は、出る量が少ない方
      const overshoot =
        Math.max(0, PLOT_LEFT + FRAME_MARGIN - rect.x0) +
        Math.max(0, rect.x1 - (PLOT_RIGHT - FRAME_MARGIN)) +
        Math.max(0, PLOT_TOP + FRAME_MARGIN - rect.y0) +
        Math.max(0, rect.y1 - (PLOT_BOTTOM - FRAME_MARGIN));
      let cost = overshoot > 0 ? 1e6 + overshoot * 1000 : 0;
      if (cost > limit) return Number.POSITIVE_INFINITY;
      // 重なりを1か所数えるごとに上限と比べ、超えたら数えるのをやめる
      const count = (weight: number): boolean => {
        cost += weight;
        return cost > limit;
      };
      for (const mark of nearMarks) {
        if (boxes.some((b) => overlaps(b, mark)) && count(OVERLAP_WEIGHT)) return Number.POSITIVE_INFINITY;
      }
      for (const other of others) {
        if (anyOverlap(boxes, other.boxes) && count(OVERLAP_WEIGHT)) return Number.POSITIVE_INFINITY;
        if (other.leader !== undefined && boxes.some((b) => segmentHits(other.leader!, b)) && count(1)) return Number.POSITIVE_INFINITY;
        if (leader === undefined) continue;
        if (other.boxes.some((b) => segmentHits(leader, b)) && count(1)) return Number.POSITIVE_INFINITY;
        if (other.leader !== undefined && segmentsCross(leader, other.leader) && count(1)) return Number.POSITIVE_INFINITY;
      }
      if (leader !== undefined) {
        for (const mark of nearHitMarks) {
          if (segmentHits(leader, mark) && count(1)) return Number.POSITIVE_INFINITY;
        }
      }
      return cost;
    };
    const blockersOf = (candidate: NameCandidate, others: readonly PlotName[]): readonly PlotName[] | undefined => {
      const { rect, boxes } = candidate;
      if (leavesPlot(rect) || nearMarks.some((mark) => boxes.some((b) => overlaps(b, mark)))) return undefined;
      const found: PlotName[] = [];
      for (const other of others) {
        if (anyOverlap(boxes, other.boxes)) found.push(other);
        if (other.leader !== undefined && boxes.some((b) => segmentHits(other.leader!, b))) return undefined;
      }
      return found;
    };
    // 置く時に作った段ごとの候補。見直す時に作り直さない
    const levelCache = new Map<number, NameCandidate[]>();
    let nearCache: NameCandidate[] | undefined;
    const nearCandidates = (): readonly NameCandidate[] => {
      nearCache ??= GAP_LEVELS.flatMap((d) => levelCache.get(d) ?? candidatesAt(d, true))
        .filter((candidate) => candidate.leader === undefined)
        .sort((a, b) => rankOf(a) - rankOf(b));
      return nearCache;
    };
    const toName = (candidate: NameCandidate): PlotName => ({
      lines: lines.map((line, index) => {
        const column = Math.floor(index / rows);
        const shift = candidate.anchor === 'end' ? columnWidths[column]! : 0;
        return {
          targetKey: line.targetKey,
          text: line.label,
          x: candidate.x + columnOffsets[column]! + shift,
          y: candidate.firstBaseline + NAME_LINE_HEIGHT * (index % rows),
        };
      }),
      anchor: candidate.anchor,
      rect: candidate.rect,
      boxes: candidate.boxes,
      leader: candidate.leader,
    });
    const search = (): { readonly chosen: NameCandidate; readonly cost: number } => {
      // 段を隙間の小さい方から試す。重なりが無い候補が見つかった後は、次の段の隙間がその候補の隙間より大きければ打ち切る
      let best: NameCandidate | undefined;
      let bestCost = Number.POSITIVE_INFINITY;
      for (const d of GAP_LEVELS) {
        if (best !== undefined && bestCost === 0 && d > rankOf(best)) break;
        const level = candidatesAt(d);
        levelCache.set(d, level);
        for (const candidate of level) {
          // 重なりが少ない候補、同じなら隙間が小さい候補が勝つ。同じ順位なら先に並べた候補のまま
          const limit = best === undefined || rankOf(candidate) < rankOf(best) ? bestCost : bestCost - 1;
          const cost = costOf(candidate, nearNames, limit);
          if (cost <= limit) {
            best = candidate;
            bestCost = cost;
          }
        }
      }
      return { chosen: best!, cost: bestCost };
    };
    return { lines, nearNames, costOf, blockersOf, nearCandidates, toName, search };
  };
  const clearance = (rect: Rect, index: number): number => {
    const square = marks[index]!;
    return Math.max(rect.x0 - square.x1, square.x0 - rect.x1, rect.y0 - square.y1, square.y0 - rect.y1);
  };
  // 印が重なる2点（`upper`は縦軸の値が大きい方）の名前を、点ごとに1行で分けて置く。置けなければ`undefined`
  const separate = (upper: number, lower: number): PlotName[] | undefined => {
    const upperGroup = prepare({ members: [upper], cx: points[upper]!.px, cy: points[upper]!.py });
    const lowerGroup = prepare({ members: [lower], cx: points[lower]!.px, cy: points[lower]!.py });
    // 自分の点の名前と読める置き方。自分の点との隙間が`MIN_LEADER`未満（候補の側で満たす）で、もう1つの点との隙間より小さく、
    // 組の2点以外の全ての点との隙間が`MIN_LEADER`以上（他の点の名前を線無しで置ける範囲を、まだ置いていない名前の分まで先に取らない）で、重なりが無い
    const apart = (rect: Rect, own: number, other: number): boolean => {
      for (let index = 0; index < marks.length; index++) {
        if (index !== upper && index !== lower && clearance(rect, index) < MIN_LEADER) return false;
      }
      return clearance(rect, own) < clearance(rect, other);
    };
    const upperRoom = upperGroup.nearCandidates().filter((c) => apart(c.rect, upper, lower) && upperGroup.costOf(c, upperGroup.nearNames, 0) === 0);
    if (upperRoom.length === 0) return undefined;
    const lowerRoom = lowerGroup.nearCandidates().filter((c) => apart(c.rect, lower, upper) && lowerGroup.costOf(c, lowerGroup.nearNames, 0) === 0);
    // 2つの名前の並びが2点の並びと同じ。縦の差が横の差以上なら縦（画面の上の点の名前が上）、そうでなければ横（左の点の名前が左）で、名前の長方形の中央を比べる
    const dx = points[upper]!.px - points[lower]!.px;
    const dy = points[upper]!.py - points[lower]!.py;
    const sameOrder = (u: Rect, l: Rect): boolean => {
      if (Math.abs(dy) >= Math.abs(dx)) {
        const [top, bottom] = dy < 0 ? [u, l] : [l, u];
        return top.y0 + top.y1 < bottom.y0 + bottom.y1;
      }
      const [left, right] = dx < 0 ? [u, l] : [l, u];
      return left.x0 + left.x1 < right.x0 + right.x1;
    };
    for (const u of upperRoom) {
      const l = lowerRoom.find((candidate) => !anyOverlap(u.boxes, candidate.boxes) && sameOrder(u.rect, candidate.rect));
      if (l !== undefined) return [upperGroup.toName(u), lowerGroup.toName(l)];
    }
    return undefined;
  };
  for (const cluster of order) {
    const group = prepare(cluster);
    const { lines, nearNames, costOf, blockersOf, nearCandidates, toName } = group;
    if (lines.length === 2) {
      const separated = separate(cluster.members[0]!, cluster.members[1]!);
      if (separated !== undefined) {
        placed.push(...separated);
        slots.push(undefined, undefined);
        continue;
      }
    }
    const { chosen, cost: bestCost } = group.search();
    // 引き出し線無しで重ならずに置けない2点の組は、点ごとに横へ分けて置けるか試す
    const [first, second] = lines;
    if (lines.length === 2 && !(bestCost === 0 && chosen.leader === undefined) && Math.abs(first!.px - second!.px) >= SPLIT_MIN_DX) {
      const [leftPoint, rightPoint] = first!.px < second!.px ? [first!, second!] : [second!, first!];
      const oneLine = (point: (typeof lines)[number], side: 'left' | 'right'): NameCandidate => {
        const w = estimateTextWidth(point.label);
        const x = side === 'left' ? point.px - NAME_GAP - w : point.px + NAME_GAP;
        const baseline = point.py + 4;
        const rect = { x0: x - 1, x1: x + w + 1, y0: baseline - 11.5, y1: baseline + 4.5 };
        return {
          x,
          anchor: side === 'left' ? 'end' : 'start',
          firstBaseline: baseline,
          rect,
          boxes: [rect],
          gap: NAME_GAP - POINT_CLEARANCE - 1,
          leader: undefined,
        };
      };
      const leftName = oneLine(leftPoint, 'left');
      const rightName = oneLine(rightPoint, 'right');
      const asName = (point: (typeof lines)[number], candidate: NameCandidate): PlotName => ({
        lines: [
          {
            targetKey: point.targetKey,
            text: point.label,
            x: candidate.anchor === 'end' ? candidate.rect.x1 - 1 : candidate.x,
            y: candidate.firstBaseline,
          },
        ],
        anchor: candidate.anchor,
        rect: candidate.rect,
        boxes: candidate.boxes,
        leader: undefined,
      });
      const leftPlaced = asName(leftPoint, leftName);
      if (costOf(leftName, nearNames, 0) === 0 && costOf(rightName, [...nearNames, leftPlaced], 0) === 0) {
        placed.push(leftPlaced, asName(rightPoint, rightName));
        slots.push(undefined, undefined);
        continue;
      }
    }
    placed.push(toName(chosen));
    slots.push({ nearCandidates, costOf, blockersOf, toName });
  }
  if (yieldToNeighbors) yieldNames(placed, slots);
  // 点のすぐ横より離れた名前に、短い線を付けて、どの点の名前かを示す
  const byKey = new Map(points.map((p, i) => [p.targetKey, i]));
  return placed.map((name) => {
    if (name.leader !== undefined) return name;
    const members = name.lines.map((line) => byKey.get(line.targetKey)!);
    const nearest = nearestMember(members, marks, points, name.rect);
    if (nearest.gap < SHORT_LEADER) return name;
    const r = name.rect;
    const inner = { x0: r.x0 + SHORT_LEADER_INSET, x1: r.x1 - SHORT_LEADER_INSET, y0: r.y0 + SHORT_LEADER_INSET, y1: r.y1 - SHORT_LEADER_INSET };
    return { ...name, leader: leaderTo(points[nearest.index]!, inner) };
  });
}

/** 引き出し線の付いた名前のために、線無しの候補をふさぐ名前を1つ動かす。詳しくは`placeNames`。 */
function yieldNames(placed: PlotName[], slots: readonly (NameSlot | undefined)[]): void {
  const moved = new Set<number>();
  for (let a = 0; a < placed.length; a++) {
    const slotA = slots[a];
    if (slotA === undefined || placed[a]!.leader === undefined || moved.has(a)) continue;
    const withoutA = placed.filter((_, index) => index !== a);
    // 置いた時はふさがっていた候補が、先に見直した名前が動いて空いていれば、他の名前を動かさずにそこへ置き直す
    const free = slotA.nearCandidates().find((candidateA) => slotA.blockersOf(candidateA, withoutA)?.length === 0);
    if (free !== undefined) {
      placed[a] = slotA.toName(free);
      moved.add(a);
      continue;
    }
    // 動かす名前ごとの、2つの名前を外した状態で重なりが無い移り先。線の付いていた名前の候補が変わっても同じなので、1度だけ求める
    const roomFor = new Map<number, readonly NameCandidate[]>();
    for (const candidateA of slotA.nearCandidates()) {
      const blockers = slotA.blockersOf(candidateA, withoutA);
      if (blockers?.length !== 1) continue;
      const b = placed.indexOf(blockers[0]!);
      const slotB = slots[b];
      if (slotB === undefined || moved.has(b)) continue;
      let room = roomFor.get(b);
      if (room === undefined) {
        const others = placed.filter((_, index) => index !== a && index !== b);
        room = slotB.nearCandidates().filter((candidateB) => slotB.costOf(candidateB, others, 0) === 0);
        roomFor.set(b, room);
      }
      // 線の付いていた名前の候補は、動かす名前以外とは重ならない。移り先の長方形と重ならなければ、重なりは0
      const target = room.find((candidateB) => !anyOverlap(candidateA.boxes, candidateB.boxes));
      if (target === undefined) continue;
      placed[a] = slotA.toName(candidateA);
      placed[b] = slotB.toName(target);
      moved.add(a);
      moved.add(b);
      break;
    }
  }
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
    names.flatMap((placed) => placed.boxes),
  );
  const occupied: Rect[] = [
    ...names.flatMap((placed) => placed.boxes),
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

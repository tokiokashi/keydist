import { CHART_DOT_LIMIT, CHART_MARGIN, CHART_PLOT_HEIGHT, CHART_PLOT_WIDTH, chartX, formatCoordinate } from '../chart-frame.ts';
import { guideHalfWidth, isPerCharMetric } from '#interpretation/span-metrics.ts';
import type { RunChartSeriesOk } from './extract.ts';
import { displayValue, formatMetricValue, type RunChartMetricId } from './metric-catalog.ts';

/**
 * Run Chartの座標の計算。値は抽出が出した点をそのまま使い、ここでは指標も目安線の係数も計算し直さない
 * （目安線は、抽出が出した係数と点ごとの分母から幅を求めて引くだけ）。描画（`definition.tsx`）はこの結果を並べるだけにする。
 *
 * 描画の寸法と横軸の座標は、打鍵再生の速度グラフと同じ（`chart-frame.ts`）。
 */

export interface RunChartTick {
  readonly value: number;
  readonly position: number;
}

export interface RunChartDot {
  readonly x: number;
  readonly y: number;
  /** 点の文字位置 */
  readonly position: number;
}

export interface RunChartPlotSeries {
  readonly targetKey: string;
  readonly data: RunChartSeriesOk;
}

export interface RunChartModelSeries {
  readonly targetKey: string;
  readonly linePath: string;
  /** 中心線のy座標。系列に点が無い時は `undefined` */
  readonly centerY: number | undefined;
  /** 目安線（中心線の上と下）。点ごとに幅が変わるので、折れ線で引く */
  readonly upperPath: string;
  readonly lowerPath: string;
  /** 点の丸（点が上限以下の時だけ。長い列では空） */
  readonly dots: readonly RunChartDot[];
  /** 押した位置に最も近い点を探すための、値のある点（x座標の昇順） */
  readonly hits: readonly RunChartHit[];
}

export interface RunChartHit {
  readonly x: number;
  readonly y: number;
  /** 系列の点の番号（`RunChartSeriesOk.positions` の添字） */
  readonly pointIndex: number;
  readonly position: number;
}

export interface RunChartModel {
  /** 横軸の長さ（文字数） */
  readonly total: number;
  readonly yMax: number;
  readonly yTicks: readonly RunChartTick[];
  readonly xTicks: readonly RunChartTick[];
  readonly series: readonly RunChartModelSeries[];
}

interface PlotPoint {
  readonly x: number;
  /** `null`なら線を切る */
  readonly y: number | null;
}

/**
 * 点の並びを`M`/`L`のパスにする。`y`が`null`の所で線を切る。
 * 点が横軸の画素数より十分多い時は、1画素の幅に入る点のうち最初・最後・最小・最大だけを残す（見た目は変わらず、パスが短くなる）。
 */
export function linePathOf(points: readonly PlotPoint[]): string {
  const parts: string[] = [];
  let segment: PlotPoint[] = [];
  const flush = () => {
    if (segment.length > 0) {
      const simplified = segment.length > CHART_PLOT_WIDTH * 2 ? simplify(segment) : segment;
      simplified.forEach((point, index) => {
        parts.push(`${index === 0 ? 'M' : 'L'}${formatCoordinate(point.x)},${formatCoordinate(point.y!)}`);
      });
    }
    segment = [];
  };
  for (const point of points) {
    if (point.y === null) flush();
    else segment.push(point);
  }
  flush();
  return parts.join(' ');
}

function simplify(points: readonly PlotPoint[]): PlotPoint[] {
  const kept: PlotPoint[] = [];
  let bucket = Number.NaN;
  let bucketPoints: PlotPoint[] = [];
  const close = () => {
    if (bucketPoints.length === 0) return;
    const first = bucketPoints[0]!;
    const last = bucketPoints.at(-1)!;
    let low = first;
    let high = first;
    for (const point of bucketPoints) {
      if (point.y! < low.y!) low = point;
      if (point.y! > high.y!) high = point;
    }
    const chosen = new Set<PlotPoint>([first, low, high, last]);
    for (const point of bucketPoints) if (chosen.has(point)) kept.push(point);
    bucketPoints = [];
  };
  for (const point of points) {
    const at = Math.floor(point.x);
    if (at !== bucket) {
      close();
      bucket = at;
    }
    bucketPoints.push(point);
  }
  close();
  return kept;
}

/** 系列が描く値の範囲（表示の単位）。値のある点と中心線の最大。 */
function seriesMax(metric: RunChartMetricId, series: RunChartSeriesOk): number {
  let max = displayValue(metric, series.center);
  for (const value of series.values) if (value !== null && Number.isFinite(value)) max = Math.max(max, displayValue(metric, value));
  return max;
}

/** 描く系列が1つも無ければ`undefined`。 */
export function runChartModel(plot: readonly RunChartPlotSeries[], metric: RunChartMetricId): RunChartModel | undefined {
  const total = Math.max(0, ...plot.map((item) => item.data.inputChars));
  if (total === 0 || plot.length === 0) return undefined;

  const yMax = Math.max(...plot.map((item) => seriesMax(metric, item.data))) * 1.1 || 1;
  const yOf = (value: number) => CHART_MARGIN.top + (1 - value / yMax) * CHART_PLOT_HEIGHT;

  const series = plot.map(({ targetKey, data }): RunChartModelSeries => {
    // 位置`e`の点は、文字`e`の右端（`e + 1`）に置く。文字位置0の点が縦軸の線に重ならない
    const xOf = (position: number) => chartX(position + 1, total);
    const line: PlotPoint[] = [];
    const upper: PlotPoint[] = [];
    const lower: PlotPoint[] = [];
    const hits: RunChartHit[] = [];
    const dots: RunChartDot[] = [];
    data.positions.forEach((position, pointIndex) => {
      const x = xOf(position);
      const value = data.values[pointIndex];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        line.push({ x, y: null });
        upper.push({ x, y: null });
        lower.push({ x, y: null });
        return;
      }
      const shown = displayValue(metric, value);
      const half = displayValue(metric, guideHalfWidth(data.guideScale, data.denominators[pointIndex]!));
      const y = yOf(shown);
      line.push({ x, y });
      upper.push({ x, y: yOf(displayValue(metric, data.center) + half) });
      // 指標は0以上の量なので、下側の目安線は0より下に引かない
      lower.push({ x, y: yOf(Math.max(0, displayValue(metric, data.center) - half)) });
      hits.push({ x, y, pointIndex, position });
      dots.push({ x, y, position });
    });
    return {
      targetKey,
      linePath: linePathOf(line),
      centerY: data.positions.length === 0 ? undefined : yOf(displayValue(metric, data.center)),
      upperPath: linePathOf(upper),
      lowerPath: linePathOf(lower),
      dots: dots.length <= CHART_DOT_LIMIT ? dots : [],
      hits,
    };
  });

  return {
    total,
    yMax,
    yTicks: [0, 0.5, 1].map((ratio) => ({ value: yMax * ratio, position: yOf(yMax * ratio) })),
    xTicks: [...new Set([0, Math.round(total / 2), total])].map((at) => ({ value: at, position: chartX(at, total) })),
    series,
  };
}

export interface RunChartTarget {
  /** `model.series` の添字 */
  readonly seriesIndex: number;
  readonly hit: RunChartHit;
}

/** 値のある点のうち、`viewX`に最も近い点の番号。点が無ければ`undefined`。 */
function nearestHitIndex(hits: readonly RunChartHit[], viewX: number): number | undefined {
  if (hits.length === 0) return undefined;
  let low = 0;
  let high = hits.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (hits[middle]!.x < viewX) low = middle + 1;
    else high = middle;
  }
  const after = low;
  const before = Math.max(0, low - 1);
  return Math.abs(hits[before]!.x - viewX) <= Math.abs(hits[after]!.x - viewX) ? before : after;
}

/**
 * 押した位置（図の座標）に最も近い点。系列ごとに横位置が最も近い点を求め、その中から図の上の距離が最も近いものを選ぶ。
 * 長い列で点の丸を描かない時も、線の上のどこを押しても、その横位置に最も近い点が選ばれる。
 */
export function nearestRunChartTarget(model: RunChartModel, viewX: number, viewY: number): RunChartTarget | undefined {
  let best: RunChartTarget | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  model.series.forEach((series, seriesIndex) => {
    const index = nearestHitIndex(series.hits, viewX);
    if (index === undefined) return;
    const hit = series.hits[index]!;
    const distance = (hit.x - viewX) ** 2 + (hit.y - viewY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { seriesIndex, hit };
    }
  });
  return best;
}

/** キーボードで、選んだ系列の隣の点へ動く。端では動かない。 */
export function adjacentRunChartTarget(model: RunChartModel, current: RunChartTarget, step: number): RunChartTarget {
  const hits = model.series[current.seriesIndex]?.hits ?? [];
  const at = hits.findIndex((hit) => hit.pointIndex === current.hit.pointIndex);
  if (at < 0) return current;
  const next = hits[Math.min(hits.length - 1, Math.max(0, at + step))];
  return next === undefined ? current : { seriesIndex: current.seriesIndex, hit: next };
}

/** 図の下に出す、選んだ点の読み上げ。文字位置は、利用者に見せる「何文字目」（先頭が1）で書く。 */
export function runChartReadout(label: string, metric: RunChartMetricId, data: RunChartSeriesOk, pointIndex: number): string {
  const position = data.positions[pointIndex];
  const value = data.values[pointIndex];
  const denominator = data.denominators[pointIndex];
  if (position === undefined || value === null || value === undefined || denominator === undefined) return '';
  const half = guideHalfWidth(data.guideScale, denominator);
  const span = `${denominator}${isPerCharMetric(metric) ? '文字' : '打鍵'}`;
  const lower = formatMetricValue(metric, Math.max(0, data.center - half));
  const upper = formatMetricValue(metric, data.center + half);
  return `${label}、${position + 1}文字目、${formatMetricValue(metric, value)}（直近${span}）、中心線${formatMetricValue(metric, data.center)}、目安線${lower}から${upper}`;
}

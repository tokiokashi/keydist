import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';
import {
  CHART_DOT_LIMIT,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_PLOT_HEIGHT,
  CHART_WIDTH,
  chartAxisInsets,
  chartPositionAt,
  chartX,
  formatCoordinate,
} from '../chart-frame.ts';
import { scaleRangeWithZero, type ScaleRange } from '../shared-scale.ts';

/**
 * 速度グラフの座標の計算。値は抽出が出した点をそのまま使い、ここでは平均も時間も計算しない。
 * 描画（`rate-chart.tsx`）はこの結果を並べるだけにする。
 */

export const RATE_CHART_WIDTH = CHART_WIDTH;
export const RATE_CHART_HEIGHT = CHART_HEIGHT;
export const RATE_CHART_MARGIN = CHART_MARGIN;

/** 点ごとの丸を描く上限。これを超える長い列では線だけにする（点が重なって線と見分けがつかない） */
export const RATE_CHART_DOT_LIMIT = CHART_DOT_LIMIT;

export interface RateChartBand {
  readonly kind: 'chain' | 'arpeggio';
  /** 帯の左端のx座標 */
  readonly x: number;
  readonly width: number;
}

export interface RateChartTick {
  readonly value: number;
  readonly position: number;
}

export interface RateChartDot {
  readonly x: number;
  readonly y: number;
}

export interface RateChartModel {
  /** 再生位置の最大値（打鍵のステップ数） */
  readonly total: number;
  readonly yMax: number;
  readonly yTicks: readonly RateChartTick[];
  readonly xTicks: readonly RateChartTick[];
  readonly kanaPath: string;
  readonly actionPath: string;
  readonly kanaDots: readonly RateChartDot[];
  readonly actionDots: readonly RateChartDot[];
  readonly bands: readonly RateChartBand[];
}

export interface RateChartDisplay {
  readonly chain: boolean;
  readonly arpeggio: boolean;
}

const PLOT_HEIGHT = CHART_PLOT_HEIGHT;

/**
 * グラフの幅に対する、横軸（再生位置0から最後まで）の左端と右端の余白の割合（百分率）。
 * シークバーのつまみの動く範囲をこの横軸に合わせるのに使う。
 */
export const rateChartAxisInsets = chartAxisInsets;

export const rateChartX = chartX;

/** グラフ内のx座標（viewBoxの座標）から、いちばん近い再生位置を求める。 */
export function rateChartPositionAt(viewX: number, total: number): number {
  return Math.round(chartPositionAt(viewX, total));
}

/**
 * 連続する同じ種類の区間を1本の帯にまとめる。位置`c`の点は、ステップ`c`（位置`c-1`から`c`の間）を表す。
 * 表示する種類（`display`）に含まれない帯は作らない。
 */
function bandsOf(points: readonly PlaybackRateChartPoint[], total: number, display: RateChartDisplay): RateChartBand[] {
  const bands: RateChartBand[] = [];
  for (const kind of ['chain', 'arpeggio'] as const) {
    if (!display[kind]) continue;
    let startPosition: number | undefined;
    const close = (endPosition: number) => {
      if (startPosition === undefined) return;
      const x = rateChartX(startPosition, total);
      bands.push({ kind, x, width: rateChartX(endPosition, total) - x });
      startPosition = undefined;
    };
    for (const point of points) {
      if (point.cursor === 0) continue;
      if (point[kind] === true) startPosition ??= point.cursor - 1;
      else close(point.cursor - 1);
    }
    close(total);
  }
  return bands;
}

function finiteRates(points: readonly PlaybackRateChartPoint[]): number[] {
  return points
    .flatMap((point) => [point.kanaPerSecond, point.actionsPerSecond])
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
}

/**
 * このペインが縦軸の共有に報告する範囲（0を含む）。描く値が1つも無ければ`undefined`。
 * 揃えた範囲には依らない（報告が循環しない）。
 */
export function rateChartOwnRange(points: readonly PlaybackRateChartPoint[]): ScaleRange | undefined {
  const values = finiteRates(points);
  return values.length === 0 ? undefined : scaleRangeWithZero(values);
}

/**
 * 点の並びが空（打鍵が無い）の時は`undefined`を返す。
 * `sharedRange`は並んだペイン全部を含む範囲で、縦軸の上限はこの最大値（1未満なら1）の1.1倍で決める。
 * 渡さなければ、このペインの値だけで決める。
 */
export function rateChartModel(
  points: readonly PlaybackRateChartPoint[],
  display: RateChartDisplay,
  sharedRange?: ScaleRange,
): RateChartModel | undefined {
  const total = points.at(-1)?.cursor ?? 0;
  if (total === 0) return undefined;

  const yMax = Math.max(1, sharedRange?.max ?? Math.max(0, ...finiteRates(points))) * 1.1;
  const yOf = (value: number) => RATE_CHART_MARGIN.top + (1 - value / yMax) * PLOT_HEIGHT;

  const seriesOf = (pick: (point: PlaybackRateChartPoint) => number | undefined) => {
    const dots: RateChartDot[] = [];
    for (const point of points) {
      const value = pick(point);
      if (value === undefined || !Number.isFinite(value)) continue;
      dots.push({ x: rateChartX(point.cursor, total), y: yOf(value) });
    }
    const path = dots.map((dot, index) => `${index === 0 ? 'M' : 'L'}${formatCoordinate(dot.x)},${formatCoordinate(dot.y)}`).join(' ');
    return { path, dots: points.length <= RATE_CHART_DOT_LIMIT ? dots : [] };
  };
  const kana = seriesOf((point) => point.kanaPerSecond);
  const action = seriesOf((point) => point.actionsPerSecond);

  return {
    total,
    yMax,
    yTicks: [0, 0.5, 1].map((ratio) => ({ value: yMax * ratio, position: yOf(yMax * ratio) })),
    xTicks: [...new Set([0, Math.round(total / 2), total])].map((at) => ({ value: at, position: rateChartX(at, total) })),
    kanaPath: kana.path,
    actionPath: action.path,
    kanaDots: kana.dots,
    actionDots: action.dots,
    bands: bandsOf(points, total, display),
  };
}

/** かな/秒・アクション/秒の表示。値を出せない時は「—」。 */
export function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

/** グラフの下に出す、1つの再生位置の値の読み上げ。 */
export function rateChartReadout(point: PlaybackRateChartPoint): string {
  const input = point.inputText === '' ? '—' : point.inputText;
  return `${point.cursor}ステップ目、集計入力「${input}」、かな/秒は${formatRate(point.kanaPerSecond)}、アクション/秒は${formatRate(point.actionsPerSecond)}`;
}

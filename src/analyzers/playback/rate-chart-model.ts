import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';

/**
 * 速度グラフの座標の計算。値は抽出が出した点をそのまま使い、ここでは平均も時間も計算しない。
 * 描画（`rate-chart.tsx`）はこの結果を並べるだけにする。
 */

export const RATE_CHART_WIDTH = 760;
export const RATE_CHART_HEIGHT = 260;
export const RATE_CHART_MARGIN = { top: 30, right: 18, bottom: 30, left: 54 } as const;

/** 点ごとの丸を描く上限。これを超える長い列では線だけにする（点が重なって線と見分けがつかない） */
export const RATE_CHART_DOT_LIMIT = 200;

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

const PLOT_WIDTH = RATE_CHART_WIDTH - RATE_CHART_MARGIN.left - RATE_CHART_MARGIN.right;
const PLOT_HEIGHT = RATE_CHART_HEIGHT - RATE_CHART_MARGIN.top - RATE_CHART_MARGIN.bottom;

/**
 * グラフの幅に対する、横軸（再生位置0から最後まで）の左端と右端の余白の割合（百分率）。
 * シークバーのつまみの動く範囲をこの横軸に合わせるのに使う。
 */
export function rateChartAxisInsets(): { readonly left: string; readonly right: string } {
  return {
    left: `${(RATE_CHART_MARGIN.left / RATE_CHART_WIDTH) * 100}%`,
    right: `${(RATE_CHART_MARGIN.right / RATE_CHART_WIDTH) * 100}%`,
  };
}

export function rateChartX(position: number, total: number): number {
  return RATE_CHART_MARGIN.left + (position / total) * PLOT_WIDTH;
}

/** グラフ内のx座標（viewBoxの座標）から、いちばん近い再生位置を求める。 */
export function rateChartPositionAt(viewX: number, total: number): number {
  const position = Math.round(((viewX - RATE_CHART_MARGIN.left) / PLOT_WIDTH) * total);
  return Math.max(0, Math.min(total, position));
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
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

/** 点の並びが空（打鍵が無い）の時は`undefined`を返す。 */
export function rateChartModel(
  points: readonly PlaybackRateChartPoint[],
  display: RateChartDisplay,
): RateChartModel | undefined {
  const total = points.at(-1)?.cursor ?? 0;
  if (total === 0) return undefined;

  const finiteValues = points
    .flatMap((point) => [point.kanaPerSecond, point.actionsPerSecond])
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const yMax = Math.max(1, ...finiteValues) * 1.1;
  const yOf = (value: number) => RATE_CHART_MARGIN.top + (1 - value / yMax) * PLOT_HEIGHT;

  const seriesOf = (valueOf: (point: PlaybackRateChartPoint) => number | undefined) => {
    const dots: RateChartDot[] = [];
    for (const point of points) {
      const value = valueOf(point);
      if (value === undefined || !Number.isFinite(value)) continue;
      dots.push({ x: rateChartX(point.cursor, total), y: yOf(value) });
    }
    const path = dots
      .map((dot, index) => `${index === 0 ? 'M' : 'L'}${formatCoordinate(dot.x)},${formatCoordinate(dot.y)}`)
      .join(' ');
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

function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

/** グラフの下に出す、1つの再生位置の値の読み上げ。 */
export function rateChartReadout(point: PlaybackRateChartPoint): string {
  const input = point.inputText === '' ? '—' : point.inputText;
  return `${point.cursor}ステップ目、集計入力「${input}」、かな/秒は${formatRate(point.kanaPerSecond)}、アクション/秒は${formatRate(point.actionsPerSecond)}`;
}

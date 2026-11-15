import type { RecordMismatchItem } from '#interpretation/record/keystroke-gaps.ts';
import { CHART_MARGIN, CHART_PLOT_HEIGHT, chartX, formatCoordinate } from '../chart-frame.ts';
import type { FigureTableModel } from '../figure-table.ts';
import type { RunChartRecord } from './extract.ts';
import { positionLabel } from './table-model.ts';

/**
 * 打鍵の記録の間隔の図と表の座標・文字（`spec/keystroke-record.md` §6）。値は抽出が出したものをそのまま使い、計算し直さない。
 * 横軸の座標は、指標の図（`chart-model.ts`）と同じ変換（位置`e`の点は文字`e`の右端に置く）なので、同じ文字位置が縦にそろう。
 */

type ReadyRecord = Extract<RunChartRecord, { readonly kind: 'ready' }>;

/** 図に出す文字位置の区間。指標の図の`RunChartModel`の`start`と`total`をそのまま渡す。 */
export interface RecordGapFrame {
  readonly start: number;
  readonly total: number;
}

export interface RecordGapStem {
  readonly x: number;
  readonly y: number;
  /** 点の文字位置`e` */
  readonly position: number;
  readonly ms: number;
}

export interface RecordGapModel {
  readonly yTicks: readonly { readonly value: number; readonly position: number }[];
  /** 値のある点。 */
  readonly stems: readonly RecordGapStem[];
  /** 数えない間隔の点のx座標（欠け）。 */
  readonly missingXs: readonly number[];
  /** 縦の線をまとめた1本のパス。 */
  readonly stemPath: string;
  /** 欠けの印をまとめた1本のパス。 */
  readonly missingPath: string;
}

const MISSING_MARK_HEIGHT = 5;

/** 縦軸の最大。記録の全部の値から決め、表示の範囲によらない。 */
function yMaxOf(record: ReadyRecord): number {
  let max = 0;
  for (const value of record.values) if (value !== null && Number.isFinite(value)) max = Math.max(max, value);
  return max * 1.1 || 1;
}

/** 区間`frame`の点だけを、横軸いっぱいに並べる。記録の範囲の外の区間では、点が無い。 */
export function recordGapModel(record: ReadyRecord, frame: RecordGapFrame): RecordGapModel {
  const yMax = yMaxOf(record);
  const yOf = (value: number) => CHART_MARGIN.top + (1 - value / yMax) * CHART_PLOT_HEIGHT;
  const base = CHART_MARGIN.top + CHART_PLOT_HEIGHT;
  const stems: RecordGapStem[] = [];
  const missingXs: number[] = [];
  record.positions.forEach((position, index) => {
    if (position < frame.start || position >= frame.start + frame.total) return;
    const x = chartX(position + 1 - frame.start, frame.total);
    const value = record.values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      missingXs.push(x);
      return;
    }
    stems.push({ x, y: yOf(value), position, ms: value });
  });
  return {
    yTicks: [0, 0.5, 1].map((ratio) => ({ value: yMax * ratio, position: yOf(yMax * ratio) })),
    stems,
    missingXs,
    stemPath: stems.map((stem) => `M${formatCoordinate(stem.x)},${formatCoordinate(base)}V${formatCoordinate(stem.y)}`).join(''),
    missingPath: missingXs.map((x) => `M${formatCoordinate(x)},${formatCoordinate(base)}v${-MISSING_MARK_HEIGHT}`).join(''),
  };
}

/** 間隔の表示。1ミリ秒の単位に丸める（記録の時刻の分解能は0.1ミリ秒で、ブラウザの時刻の丸めはそれより粗いことがある）。 */
export function formatGapMs(ms: number): string {
  return String(Math.round(ms));
}

/** 間隔の値の表。図に出している区間の点を、文字位置の昇順に1行ずつ並べる。数えない間隔は「欠け」にする。 */
export function recordGapTableModel(record: ReadyRecord, span: { readonly start: number; readonly end: number }, label: string): FigureTableModel {
  const rows = record.positions.flatMap((position, index) => {
    if (position < span.start || position >= span.end) return [];
    const value = record.values[index];
    const cell = value === null || value === undefined || !Number.isFinite(value) ? '欠け' : formatGapMs(value);
    return [{ key: String(position), header: positionLabel(position), cells: [cell] }];
  });
  return { caption: `${label}の打鍵の間隔 [ms]`, rowHeader: '位置', columns: ['間隔'], rows };
}

/** 記録の範囲が、図に出している範囲に当たるか。 */
export function recordCoversSpan(record: ReadyRecord, span: { readonly start: number; readonly end: number }): boolean {
  return record.origin.range.start === span.start && record.origin.range.end === span.end;
}

/** 表示の範囲の境目（先頭が0、最後が字数）から、記録の範囲を表示する範囲の番号（先頭が1）。当たる範囲が無ければ`undefined`。 */
export function rangeNumberOf(bounds: readonly number[], range: { readonly start: number; readonly end: number }): number | undefined {
  const index = bounds.findIndex((bound, at) => bound === range.start && bounds[at + 1] === range.end);
  return index === -1 ? undefined : index + 1;
}

const MISMATCH_LABELS: Readonly<Record<RecordMismatchItem, string>> = {
  target: '対象',
  shape: '物理配列',
  fingerAssignment: '指の割当',
  conditions: '条件',
  version: 'モデルの版',
  text: 'テキスト',
  range: '範囲',
  keys: '打鍵の列',
};

export function mismatchLabel(item: RecordMismatchItem): string {
  return MISMATCH_LABELS[item];
}

/** 記録した日時を、ローカルの日時で書く。 */
export function recordedAtLabel(recordedAt: string): string {
  const date = new Date(recordedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 範囲の表示。文字位置は、利用者に見せる「何文字目」（先頭が1）で書く。 */
export function recordRangeLabel(start: number, end: number): string {
  return `${(start + 1).toLocaleString('ja-JP')}〜${end.toLocaleString('ja-JP')}文字目`;
}

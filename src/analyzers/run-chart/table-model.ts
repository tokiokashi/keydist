import type { TextLanguage } from '#input/text/language.ts';
import type { FigureTableModel } from '../figure-table.ts';
import type { RunChartSeriesOk } from './extract.ts';
import { formatMetricValue, runChartMetrics, type RunChartMetricId } from './metric-catalog.ts';
import type { RunChartSpan } from './chart-model.ts';

/** 表の1列になる系列。図に描く系列（`RunChartPlotSeries`）に表示名を足したもの。 */
export interface RunChartTableSeries {
  readonly targetKey: string;
  readonly label: string;
  readonly data: RunChartSeriesOk;
}

/**
 * Run Chartの値の表。図に出している範囲（`span`）の点だけを、文字位置の昇順に1行ずつ並べ、系列ごとの値を列にする。
 * 値は図の点（`data.values`）をそのまま、点の読み上げ（`runChartReadout`）と同じ書式で文字にする。
 * 系列が値を持たない位置（範囲の分母が0の点・その系列に点が無い位置）は「—」にする。
 * 文字位置は、利用者に見せる「何文字目」（先頭が1）で書く。
 */
export function runChartTableModel(
  series: readonly RunChartTableSeries[],
  metric: RunChartMetricId,
  span: RunChartSpan,
  language: TextLanguage,
): FigureTableModel {
  const definition = runChartMetrics(language)[metric];
  const valueAt = series.map(({ data }) => new Map(data.positions.map((position, index) => [position, data.values[index]] as const)));
  const positions = [...new Set(series.flatMap(({ data }) => data.positions.filter((position) => position >= span.start && position < span.end)))].sort(
    (a, b) => a - b,
  );
  return {
    caption: `${definition.label} [${definition.unit}]の推移`,
    rowHeader: '位置',
    columns: series.map((item) => item.label),
    rows: positions.map((position) => ({
      key: String(position),
      header: `${position + 1}文字目`,
      cells: valueAt.map((values) => {
        const value = values.get(position);
        return value === null || value === undefined || !Number.isFinite(value) ? '—' : formatMetricValue(metric, value, language);
      }),
    })),
  };
}

import type { FigureTableModel } from '../figure-table.ts';
import { distanceText, type BoxDisplayRow } from './figure-model.ts';
import { BOX_PLOT_QUANTITY_NAME, BOX_PLOT_UNIT } from './pane-meta.ts';

/** 箱ひげ図の5つの値。図の上端から下端の順（行を押した時の表もこの順）。 */
export const QUANTILE_ROWS = [
  { key: 'upperWhisker', name: '90%点（ひげの上端）' },
  { key: 'upperQuartile', name: '75%点（箱の上端）' },
  { key: 'median', name: '中央値（箱の中の線）' },
  { key: 'lowerQuartile', name: '25%点（箱の下端）' },
  { key: 'lowerWhisker', name: '10%点（ひげの下端）' },
] as const;

/**
 * 箱ひげ図の値の表。行は図に渡した箱の行（`rows`）と同じ順で、5つの値と文節の数を、値の表と同じ書式で並べる。
 * 列は小さい値から大きい値の順に並べる。
 */
export function boxPlotTableModel(rows: readonly BoxDisplayRow[], caption: string = BOX_PLOT_QUANTITY_NAME): FigureTableModel {
  const columns = [...QUANTILE_ROWS].reverse();
  return {
    caption: `${caption}の5つの値 [${BOX_PLOT_UNIT}]`,
    rowHeader: '配列',
    columns: [...columns.map((column) => column.name), '文節の数'],
    rows: rows.map((row) => ({
      key: row.targetKey,
      header: row.label,
      title: row.fullName || row.label,
      cells: [...columns.map((column) => distanceText(row.row.box[column.key])), String(row.row.box.count)],
    })),
  };
}

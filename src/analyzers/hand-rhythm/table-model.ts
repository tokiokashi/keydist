import type { FigureTableModel } from '../figure-table.ts';
import type { DistributionRow } from './distribution.ts';

/**
 * 連続の長さの分布の表。行は図の行（`rows`）と同じ順で、長さ（アクション数）ごとの件数を並べる。
 * 長い連続を1行にまとめた行は、図と同じ「10以上」の見出しになる。
 */
export function handRhythmDistributionTableModel(title: string, rows: readonly DistributionRow[]): FigureTableModel {
  return {
    caption: title,
    rowHeader: '長さ（アクション）',
    columns: ['件数'],
    rows: rows.map((row) => ({ key: row.key, header: row.label, cells: [String(row.count)] })),
  };
}

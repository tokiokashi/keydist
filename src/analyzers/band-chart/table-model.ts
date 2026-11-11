import type { TextLanguage } from '#input/text/language.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { percentText, type BandChartModel } from './figure-model.ts';
import { BAND_QUANTITIES, bandCaption, bandSampleText } from './quantities.ts';

/**
 * 帯グラフの値の表。行は図に渡した帯の行（`model.rows`。並べ替えを選んだ時はその順）と同じ順で、
 * 区分ごとの割合を帯の中の文字・行を押した時の表と同じ書式（小数1桁の%）で並べ、最後に数えた量の合計を付ける。
 */
export function bandChartTableModel(model: BandChartModel, language: TextLanguage): FigureTableModel {
  const { labels } = BAND_QUANTITIES[model.quantity];
  const sample = bandSampleText(model.quantity, language);
  return {
    caption: bandCaption(model.quantity, language),
    rowHeader: '配列',
    columns: [...labels, sample.totalLabel],
    rows: model.rows.map((row) => ({
      key: row.targetKey,
      header: row.label,
      title: row.fullName || row.label,
      cells: [...row.row.shares.map((share) => percentText(share, 1)), sample.total(row.row.total)],
    })),
  };
}

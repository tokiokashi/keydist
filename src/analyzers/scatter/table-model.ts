import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_FORMAT } from '../comparison-column-text.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { axisName, axisTitle } from './axis-names.ts';
import type { ScatterFigureModel } from './figure-model.ts';
import { contourValue } from './quantity-help.ts';

/**
 * 散布図1つぶんの値の表。行は図に渡した点（`figure.model.points`）と同じ順・同じ座標で、
 * 値の書式は点の読み取り（`readoutParts`）と同じにする。細い線を引く組は、線の量の列も付ける。
 * 図に描けない対象は図にも表にも出ない（図の下の一覧に出る）。
 */
export function scatterTableModel(figure: ScatterFigureModel, language: TextLanguage): FigureTableModel {
  const { axes, contour, plotted, model } = figure;
  const plottedByKey = new Map(plotted.map((row) => [row.targetKey, row] as const));
  const lineColumn = contour?.drawsLines === true ? contour.column : undefined;
  return {
    caption: `${axisName(axes.y, language)}と${axisName(axes.x, language)}の値`,
    rowHeader: '対象',
    columns: [axisTitle(axes.x, language), axisTitle(axes.y, language), ...(lineColumn === undefined ? [] : [axisTitle(lineColumn, language)])],
    rows: model.points.map((point) => {
      const row = plottedByKey.get(point.targetKey);
      const line = row === undefined || contour === undefined ? undefined : contourValue({ ...row, x: point.x, y: point.y }, contour);
      return {
        key: point.targetKey,
        header: point.label,
        title: row?.fullName,
        cells: [
          COMPARISON_COLUMN_FORMAT[axes.x](point.x),
          COMPARISON_COLUMN_FORMAT[axes.y](point.y),
          ...(lineColumn === undefined ? [] : [line === undefined ? '—' : COMPARISON_COLUMN_FORMAT[lineColumn](line)]),
        ],
      };
    }),
  };
}

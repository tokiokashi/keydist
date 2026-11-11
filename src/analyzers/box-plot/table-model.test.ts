import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoxPlotExtracted, BoxPlotOkRow } from './extract.ts';
import { boxPlotModel, distanceText, type BoxRowContext } from './figure-model.ts';
import { boxPlotTableModel, QUANTILE_ROWS } from './table-model.ts';

function okRow(targetKey: string, median: number): BoxPlotOkRow {
  return {
    kind: 'ok',
    targetKey,
    box: {
      count: 7,
      lowerWhisker: median * 0.5,
      lowerQuartile: median * 0.75,
      median,
      upperQuartile: median * 1.25,
      upperWhisker: median * 1.5,
    },
    sameText: true,
  };
}

const CONTEXT: ReadonlyMap<string, BoxRowContext> = new Map(
  ['a', 'b', 'c'].map((key) => [key, { targetKey: key, label: key.toUpperCase(), fullName: `配列${key}` }] as const),
);

test('箱ひげ図の表は、図に渡した箱の行と同じ順・同じ5つの値を持つ', () => {
  const extracted: BoxPlotExtracted = {
    source: { splitter: { name: 'テスト用', version: '1' }, origin: 'kana-only' },
    referenceTargetKey: 'a',
    rows: [okRow('c', 1.234), okRow('a', 3.456), okRow('b', 2.345)],
  };
  const { rows } = boxPlotModel(extracted, ['b', 'c', 'a'], CONTEXT);
  const table = boxPlotTableModel(rows);
  assert.deepEqual(
    table.rows.map((row) => row.key),
    rows.map((row) => row.targetKey),
  );
  assert.equal(table.columns.length, 6);
  for (const [index, row] of table.rows.entries()) {
    const { box } = rows[index]!.row;
    // 列は小さい値から大きい値の順
    assert.deepEqual(row.cells, [
      distanceText(box.lowerWhisker),
      distanceText(box.lowerQuartile),
      distanceText(box.median),
      distanceText(box.upperQuartile),
      distanceText(box.upperWhisker),
      String(box.count),
    ]);
  }
  assert.deepEqual(
    table.columns.slice(0, 5),
    [...QUANTILE_ROWS].reverse().map((column) => column.name),
  );
});

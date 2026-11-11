import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChartModel } from './chart-model.ts';
import type { RunChartSeriesOk } from './extract.ts';
import { formatMetricValue } from './metric-catalog.ts';
import { runChartTableModel } from './table-model.ts';

function seriesOf(targetKey: string, positions: readonly number[], values: readonly (number | null)[]): RunChartSeriesOk {
  return {
    kind: 'ok',
    targetKey,
    inputChars: 6,
    ranges: [0, 6],
    positions,
    values,
    denominators: positions.map(() => 50),
    center: 1,
    guideScale: 0.3,
  };
}

test('Run Chartの表は、図が点を置く位置と値を、文字位置の順に並べる', () => {
  const a = seriesOf('a', [0, 1, 2, 3, 4, 5], [1.1, null, 1.3, 1.4, 1.5, 1.6]);
  const b = seriesOf('b', [1, 2, 3], [2.1, 2.2, 2.3]);
  const span = { start: 1, end: 5 };
  const series = [
    { targetKey: 'a', label: 'A', data: a },
    { targetKey: 'b', label: 'B', data: b },
  ];
  const model = runChartModel(series, 'perCharUnits', span)!;
  const table = runChartTableModel(series, 'perCharUnits', span, 'ja');
  assert.deepEqual(table.columns, ['A', 'B']);
  // 表の行の位置は、図に渡した範囲の点の位置の和集合
  const plotted = new Set(model.series.flatMap((item) => item.hits.map((hit) => hit.position)));
  const tabled = table.rows.map((row) => Number(row.key));
  assert.deepEqual(tabled, [1, 2, 3, 4]);
  for (const position of plotted) assert.ok(tabled.includes(position));
  assert.deepEqual(
    table.rows.map((row) => row.header),
    ['2文字目', '3文字目', '4文字目', '5文字目'],
  );
  // 図の点（hits）の値と同じ値を、同じ書式で出す。値の欠けた点と、点の無い位置は「—」
  for (const [column, item] of model.series.entries()) {
    const data = column === 0 ? a : b;
    for (const hit of item.hits) {
      const row = table.rows.find((candidate) => candidate.key === String(hit.position));
      assert.equal(row?.cells[column], formatMetricValue('perCharUnits', data.values[hit.pointIndex]!, 'ja'));
    }
  }
  assert.deepEqual(table.rows[0]!.cells, ['—', formatMetricValue('perCharUnits', 2.1, 'ja')]);
  assert.deepEqual(table.rows[3]!.cells, [formatMetricValue('perCharUnits', 1.5, 'ja'), '—']);
});

test('割合の指標の表は、図の縦軸と同じ%の値を出す', () => {
  const a = seriesOf('a', [0, 1], [0.125, 0.5]);
  const series = [{ targetKey: 'a', label: 'A', data: a }];
  const table = runChartTableModel(series, 'sameFingerRate', { start: 0, end: 6 }, 'ja');
  assert.deepEqual(
    table.rows.map((row) => row.cells[0]),
    [formatMetricValue('sameFingerRate', 0.125, 'ja'), formatMetricValue('sameFingerRate', 0.5, 'ja')],
  );
  assert.ok(table.rows[0]!.cells[0]!.includes('12.5'));
});

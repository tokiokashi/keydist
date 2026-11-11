import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BandChartExtracted, BandChartOkRow } from './extract.ts';
import { bandChartModel, percentText, type BandRowContext } from './figure-model.ts';
import { BAND_QUANTITIES, bandSampleText } from './quantities.ts';
import { bandChartTableModel } from './table-model.ts';

function okRow(targetKey: string, counts: readonly number[]): BandChartOkRow {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return { kind: 'ok', targetKey, counts, shares: counts.map((count) => count / total), total, skippedChars: [], sameText: true };
}

const CONTEXT: ReadonlyMap<string, BandRowContext> = new Map(
  ['a', 'b', 'c'].map((key) => [`layout:${key}`, { targetKey: `layout:${key}`, label: key.toUpperCase(), fullName: `配列${key}` }] as const),
);

test('帯グラフの表は、並べ替えを選んだ時も、図に渡した帯の行と同じ順・同じ割合を持つ', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [okRow('layout:a', [1, 1, 1, 1]), okRow('layout:b', [4, 0, 0, 0]), okRow('layout:c', [0, 2, 1, 1])],
    referenceTargetKey: 'layout:a',
  };
  const order = ['layout:a', 'layout:b', 'layout:c'];
  for (const sort of [undefined, { boundary: 1, direction: 'desc' as const }, { boundary: 2, direction: 'asc' as const }]) {
    const model = bandChartModel(extracted, order, CONTEXT, sort);
    const table = bandChartTableModel(model, 'ja');
    assert.deepEqual(
      table.rows.map((row) => row.key),
      model.rows.map((row) => row.targetKey),
    );
    const bandCount = BAND_QUANTITIES.distance.labels.length;
    assert.equal(table.columns.length, bandCount + 1);
    for (const [index, row] of table.rows.entries()) {
      const source = model.rows[index]!.row;
      assert.deepEqual(
        row.cells.slice(0, bandCount),
        source.shares.map((share) => percentText(share, 1)),
      );
      assert.equal(row.cells[bandCount], bandSampleText('distance', 'ja').total(source.total));
    }
  }
  // 並べ替えを選ぶと、表の行の順も変わる
  const sorted = bandChartTableModel(bandChartModel(extracted, order, CONTEXT, { boundary: 1, direction: 'desc' }), 'ja');
  assert.deepEqual(
    sorted.rows.map((row) => row.header),
    ['B', 'A', 'C'],
  );
});

test('移動距離を数える量の表は、合計を小数1桁のuで出す', () => {
  const extracted: BandChartExtracted = {
    quantity: 'fingerDistance',
    rows: [{ ...okRow('layout:a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), total: 12.345 }],
    referenceTargetKey: 'layout:a',
  };
  const table = bandChartTableModel(bandChartModel(extracted, ['layout:a'], CONTEXT), 'ja');
  assert.equal(table.rows[0]!.cells.at(-1), '12.3u');
});

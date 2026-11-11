import assert from 'node:assert/strict';
import test from 'node:test';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { ALL_FINGERS } from '#input/shapes/geometry.ts';
import type { FingerDistanceExtracted } from './extract.ts';
import { chartSpecOf, distributionSpecsOf, formatPercent, formatState, HAND_LABEL } from './chart-data.ts';
import { chartTableModel, distributionTableModel } from './table-model.ts';

/** 10本の指と、隣り合う6組を持つ最小の抽出結果。値は指ごとに違う。 */
function extractedOf(): FingerDistanceExtracted {
  const fingers = ALL_FINGERS.map((finger, index) => ({
    finger,
    hand: index < 5 ? 'left' : 'right',
    distance: 10.55 + index * 123.456,
    distanceShare: (index + 1) / 55,
    presses: 100 + index * 37,
    pressShare: (index + 1) / 55,
  }));
  const pairs = [
    [ALL_FINGERS[0]!, ALL_FINGERS[1]!, 'left'],
    [ALL_FINGERS[1]!, ALL_FINGERS[2]!, 'left'],
    [ALL_FINGERS[2]!, ALL_FINGERS[3]!, 'left'],
    [ALL_FINGERS[6]!, ALL_FINGERS[7]!, 'right'],
    [ALL_FINGERS[7]!, ALL_FINGERS[8]!, 'right'],
    [ALL_FINGERS[8]!, ALL_FINGERS[9]!, 'right'],
  ] as const;
  const adjacent = pairs.map(([a, b, hand], index) => ({
    pair: [a, b],
    hand,
    stdDev: 0.1234 + index,
    meanExcess: 0.2345 + index,
    maxExcess: 0.3456 + index,
    distribution: [
      { state: 0, share: 60.55, count: 6 + index },
      { state: 0.5 + index / 10, share: 39.45, count: 4 },
    ],
  }));
  return { fingers, adjacent } as unknown as FingerDistanceExtracted;
}

test('棒グラフの表は、図に渡した棒と同じ順・同じ値の行を持つ（棒の上の縮めた値ではなく縮めない値）', () => {
  const extracted = extractedOf();
  for (const metric of ['distance', 'presses', 'stdDev', 'mean', 'max'] as const) {
    const spec = chartSpecOf(extracted, metric);
    const table = chartTableModel(spec);
    assert.deepEqual(
      table.rows.map((row) => row.key),
      spec.bars.map((bar) => bar.key),
      metric,
    );
    for (const [index, row] of table.rows.entries()) {
      const bar = spec.bars[index]!;
      assert.ok(bar.tip.includes(row.cells[0]!), `${metric}: ${bar.tip} / ${row.cells[0]}`);
      assert.ok(row.header.startsWith(HAND_LABEL[bar.hand]));
      assert.equal(row.cells.length, table.columns.length);
    }
  }
  const distance = chartSpecOf(extracted, 'distance');
  assert.equal(chartTableModel(distance).rows[9]!.cells[0], (10.55 + 9 * 123.456).toFixed(1));
  assert.ok(chartSpecOf(extracted, 'distance').bars[0]!.tip.includes(FINGER_LABEL[ALL_FINGERS[0]!]));
});

test('分布の表は、図の行と同じ順・同じ値の行を持つ', () => {
  const specs = distributionSpecsOf(extractedOf());
  const table = distributionTableModel(specs);
  const expected = specs.flatMap((spec) => spec.bars.map((bar) => [formatState(bar.state), formatPercent(bar.share), String(bar.count)]));
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    expected,
  );
  assert.equal(table.rows.length, 12);
});

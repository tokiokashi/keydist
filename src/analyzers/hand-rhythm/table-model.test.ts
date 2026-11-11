import assert from 'node:assert/strict';
import test from 'node:test';
import { DISTRIBUTION_CAP, distributionRowsOf } from './distribution.ts';
import { handRhythmDistributionTableModel } from './table-model.ts';

test('分布の表は、図の行と同じ順・同じ件数を持ち、まとめた行の件数も図と同じ', () => {
  const counts = [
    { length: 3, count: 4 },
    { length: 5, count: 2 },
    { length: DISTRIBUTION_CAP, count: 1 },
    { length: DISTRIBUTION_CAP + 4, count: 3 },
  ];
  const rows = distributionRowsOf(counts, 3);
  const table = handRhythmDistributionTableModel('交互打鍵の連続（件）', rows);
  assert.deepEqual(
    table.rows.map((row) => [row.header, row.cells[0]]),
    rows.map((row) => [row.label, String(row.count)]),
  );
  // 長さ0件の途中の行も残り、まとめた行の件数は合計になる
  assert.deepEqual(
    table.rows.map((row) => row.cells[0]),
    ['4', '0', '2', '0', '0', '0', '0', '4'],
  );
});

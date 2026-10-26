import assert from 'node:assert/strict';
import test from 'node:test';
import { DISTRIBUTION_CAP, distributionRowsOf } from './distribution.ts';

test('連続が無ければ行も無い', () => {
  assert.deepEqual(distributionRowsOf([], 3), []);
});

test('下限から最も長い連続までを並べ、途中の数が0の長さも残す', () => {
  const rows = distributionRowsOf(
    [
      { length: 3, count: 4 },
      { length: 6, count: 1 },
    ],
    3,
  );
  assert.deepEqual(
    rows.map((row) => [row.label, row.count]),
    [
      ['3', 4],
      ['4', 0],
      ['5', 0],
      ['6', 1],
    ],
  );
});

test('上限以上の連続は1行にまとめ、数の合計は変わらない', () => {
  const counts = [
    { length: 1, count: 5 },
    { length: DISTRIBUTION_CAP - 1, count: 2 },
    { length: DISTRIBUTION_CAP, count: 3 },
    { length: DISTRIBUTION_CAP + 7, count: 4 },
  ];
  const rows = distributionRowsOf(counts, 1);
  assert.equal(rows.length, DISTRIBUTION_CAP);
  const last = rows[rows.length - 1];
  assert.equal(last.label, `${DISTRIBUTION_CAP}以上`);
  assert.equal(last.count, 7);
  assert.equal(
    rows.reduce((sum, row) => sum + row.count, 0),
    counts.reduce((sum, item) => sum + item.count, 0),
  );
});

test('上限に届かない連続だけなら、そこで行が終わる', () => {
  const rows = distributionRowsOf([{ length: 2, count: 1 }], 1);
  assert.deepEqual(
    rows.map((row) => row.label),
    ['1', '2'],
  );
});

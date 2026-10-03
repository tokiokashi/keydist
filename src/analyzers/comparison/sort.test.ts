import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComparisonRow, ComparisonRowValues } from './extract.ts';
import { nextComparisonSort, sortComparisonOrder } from './sort.ts';

function ok(targetKey: string, totalUnits: number): ComparisonRow {
  return { kind: 'ok', targetKey, values: { totalUnits } as ComparisonRowValues };
}

const rows: readonly ComparisonRow[] = [
  ok('a', 30),
  ok('b', 10),
  ok('c', 20),
  ok('d', 10),
  { kind: 'failed', targetKey: 'e', failureKind: 'target-missing', message: '' },
];
const order = ['a', 'b', 'c', 'd', 'e', 'f'];

test('nextComparisonSort: 昇順 → 降順 → 解除、別の列は昇順から', () => {
  const first = nextComparisonSort(null, 'totalUnits');
  assert.deepEqual(first, { column: 'totalUnits', direction: 'asc' });
  const second = nextComparisonSort(first, 'totalUnits');
  assert.deepEqual(second, { column: 'totalUnits', direction: 'desc' });
  assert.equal(nextComparisonSort(second, 'totalUnits'), null);
  assert.deepEqual(nextComparisonSort(second, 'actions'), { column: 'actions', direction: 'asc' });
});

test('sortComparisonOrder: 並び替えなしは集合の順のまま', () => {
  assert.equal(sortComparisonOrder(order, rows, null), order);
});

test('sortComparisonOrder: 同じ値は集合の順を保ち、値の無い行は向きによらず末尾', () => {
  assert.deepEqual(sortComparisonOrder(order, rows, { column: 'totalUnits', direction: 'asc' }), ['b', 'd', 'c', 'a', 'e', 'f']);
  assert.deepEqual(sortComparisonOrder(order, rows, { column: 'totalUnits', direction: 'desc' }), ['a', 'c', 'b', 'd', 'e', 'f']);
});

test('sortComparisonOrder: 入力の順を書き換えない', () => {
  const copy = [...order];
  sortComparisonOrder(order, rows, { column: 'totalUnits', direction: 'asc' });
  assert.deepEqual(order, copy);
});

test('sortComparisonOrder: 値が有限でない行は値の無い行と同じく末尾', () => {
  const withNaN = [ok('a', 3), ok('b', Number.NaN), ok('c', 1)];
  assert.deepEqual(sortComparisonOrder(['a', 'b', 'c'], withNaN, { column: 'totalUnits', direction: 'asc' }), ['c', 'a', 'b']);
});

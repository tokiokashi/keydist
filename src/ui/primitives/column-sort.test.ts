import assert from 'node:assert/strict';
import test from 'node:test';
import { nextColumnSort, sortOrderByColumn } from './column-sort.ts';

type Column = 'a' | 'b';

const values: Readonly<Record<string, number>> = { x: 30, y: 10, z: 20, w: 10, n: Number.NaN };
const valueOf = (key: string): number | undefined => values[key];
// 末尾の2件は値を持たない行（計算中・失敗）
const order = ['x', 'y', 'z', 'w', 'u', 'v'];

test('nextColumnSort: 昇順 → 降順 → 解除、別の列は昇順から', () => {
  const first = nextColumnSort<Column>(null, 'a');
  assert.deepEqual(first, { column: 'a', direction: 'asc' });
  const second = nextColumnSort(first, 'a');
  assert.deepEqual(second, { column: 'a', direction: 'desc' });
  assert.equal(nextColumnSort(second, 'a'), null);
  assert.deepEqual(nextColumnSort(second, 'b'), { column: 'b', direction: 'asc' });
});

test('sortOrderByColumn: 並び替えなしは元の順のまま', () => {
  assert.equal(sortOrderByColumn<Column>(order, valueOf, null), order);
});

test('sortOrderByColumn: 同じ値は元の順を保ち、値の無い行は向きによらず末尾', () => {
  assert.deepEqual(sortOrderByColumn<Column>(order, valueOf, { column: 'a', direction: 'asc' }), ['y', 'w', 'z', 'x', 'u', 'v']);
  assert.deepEqual(sortOrderByColumn<Column>(order, valueOf, { column: 'a', direction: 'desc' }), ['x', 'z', 'y', 'w', 'u', 'v']);
});

test('sortOrderByColumn: 入力の順を書き換えない', () => {
  const copy = [...order];
  sortOrderByColumn<Column>(order, valueOf, { column: 'a', direction: 'asc' });
  assert.deepEqual(order, copy);
});

test('sortOrderByColumn: 値が有限でない行は値の無い行と同じく末尾', () => {
  assert.deepEqual(sortOrderByColumn<Column>(['x', 'n', 'y'], valueOf, { column: 'a', direction: 'asc' }), ['y', 'x', 'n']);
});

test('sortOrderByColumn: 値は列ごとに引く', () => {
  const byColumn = (key: string, column: Column): number | undefined => (column === 'a' ? values[key] : key === 'x' ? 1 : 2);
  assert.deepEqual(sortOrderByColumn<Column>(['y', 'x'], byColumn, { column: 'b', direction: 'asc' }), ['x', 'y']);
});

import type { ComparisonRow } from './extract.ts';
import type { ComparisonColumnId, ComparisonSort } from './options.ts';

/**
 * 列の見出しを押した時の次の状態。同じ列を押すたびに 昇順 → 降順 → 解除、別の列を押したらその列の昇順から。
 */
export function nextComparisonSort(current: ComparisonSort, column: ComparisonColumnId): ComparisonSort {
  if (current === null || current.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

/**
 * 表の行の順を、列の値で並べ替える。`order`（対象の集合の順）は変えず、並べ直した新しい配列を返す。
 *
 * - 並べるのは表に出ている値そのもの。基準の割合では並べない（基準が負の値の時に割合の大小が逆転し、
 *   表の主役の値と見え方が食い違うため）
 * - 同じ値の行は`order`の順を保つ（安定ソート）
 * - 値を持たない行（計算中・失敗）と、値が有限でない行は、向きによらず末尾に`order`の順で置く
 *   （並びの比較に加えない。「0」のような値を当てはめない）
 */
export function sortComparisonOrder(
  order: readonly string[],
  rows: readonly ComparisonRow[],
  sort: ComparisonSort,
): readonly string[] {
  if (sort === null) return order;
  const valueOf = new Map<string, number>();
  for (const row of rows) {
    if (row.kind !== 'ok') continue;
    const value = row.values[sort.column];
    if (Number.isFinite(value)) valueOf.set(row.targetKey, value);
  }
  const sign = sort.direction === 'asc' ? 1 : -1;
  const indexed = order.map((key, index) => ({ key, index, value: valueOf.get(key) }));
  const withValue = indexed.filter((item) => item.value !== undefined);
  const withoutValue = indexed.filter((item) => item.value === undefined);
  withValue.sort((a, b) => sign * (a.value! - b.value!) || a.index - b.index);
  return [...withValue, ...withoutValue].map((item) => item.key);
}

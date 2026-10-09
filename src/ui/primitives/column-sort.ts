/**
 * 表の列の見出しで切り替える並び替え。列のidの種類はAnalyzerごとに違うので型引数で受ける。
 * 並べ替えるのは表の表示だけで、行の元の順（対象の集合の順）は変えない。
 */

export type ColumnSortDirection = 'asc' | 'desc';

/** 並び替えの状態。`null`は並び替えなし（行の元の順のまま）。 */
export type ColumnSort<Column extends string> = { readonly column: Column; readonly direction: ColumnSortDirection } | null;

/**
 * 列の見出しを押した時の次の状態。同じ列を押すたびに 昇順 → 降順 → 解除、別の列を押したらその列の昇順から。
 */
export function nextColumnSort<Column extends string>(current: ColumnSort<Column>, column: Column): ColumnSort<Column> {
  if (current === null || current.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

/**
 * 表の行の順を、列の値で並べ替える。`order`（行の元の順）は変えず、並べ直した新しい配列を返す。
 *
 * - 並べるのは表に出ている値そのもの（`valueOf`が返す値）
 * - 同じ値の行は`order`の順を保つ（安定ソート）
 * - 値を持たない行（`valueOf`が`undefined`か有限でない値を返す行。計算中・失敗・割り算の分母が0の行など）は、
 *   向きによらず末尾に`order`の順で置く（並びの比較に加えない。「0」のような値を当てはめない）
 */
export function sortOrderByColumn<Column extends string>(
  order: readonly string[],
  valueOf: (targetKey: string, column: Column) => number | undefined,
  sort: ColumnSort<Column>,
): readonly string[] {
  if (sort === null) return order;
  const sign = sort.direction === 'asc' ? 1 : -1;
  const indexed = order.map((key, index) => {
    const value = valueOf(key, sort.column);
    return { key, index, value: value !== undefined && Number.isFinite(value) ? value : undefined };
  });
  const withValue = indexed.filter((item) => item.value !== undefined);
  const withoutValue = indexed.filter((item) => item.value === undefined);
  withValue.sort((a, b) => sign * (a.value! - b.value!) || a.index - b.index);
  return [...withValue, ...withoutValue].map((item) => item.key);
}

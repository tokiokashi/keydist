import type { ItemScope } from './types.ts';

/**
 * idをキーにしたrecord（Analyzer idごとの解析設定など）の`ItemScope`。
 * キーの有無が他のキーに影響しないので、件の追加・削除も項目単位で戻す（`'free'`）。
 */
export function recordItemScope<V extends Readonly<Record<string, unknown>>>(): ItemScope<V> {
  return {
    items: (value) => new Map(Object.entries(value)),
    withItem: (value, id, item) => {
      const entries = Object.entries(value);
      const rest = entries.filter(([key]) => key !== id);
      if (item === undefined) return Object.fromEntries(rest) as V;
      // 既にある件は元の位置で差し替え、無ければ末尾に足す
      const replaced = entries.some(([key]) => key === id)
        ? entries.map((entry) => (entry[0] === id ? ([id, item] as const) : entry))
        : [...rest, [id, item] as const];
      return Object.fromEntries(replaced) as V;
    },
    membership: 'free',
  };
}

/**
 * idを持つ件の配列（Workspaceの一覧など）の`ItemScope`。並びが意味を持ち、件の追加・削除は位置や
 * 番号に影響するので、中身だけを変えた項目に限る（`'fixed'`）。
 */
export function arrayItemScope<T>(idOf: (item: T) => string): ItemScope<readonly T[]> {
  return {
    items: (value) => new Map(value.map((item) => [idOf(item), item] as const)),
    withItem: (value, id, item) => value.map((entry) => (idOf(entry) === id ? (item as T) : entry)),
    membership: 'fixed',
  };
}

/**
 * 文字の列から、n-gram（連続する文字の並び）の出現回数の表を作る（定義は `docs/kana-chain-comparison.md`）。
 *
 * 次数 `r` の表は、連続する `r + 1` 文字の並びと出現回数を持つ。0次は1文字、1次は2文字、2次は3文字の並び。
 * 文字は評価に渡すテキストのコードポイント1つで、句読点・長音・打鍵できない文字も区別せず1文字に数える。
 * 並びの鍵は、その文字を続けて書いた文字列。
 */

/** 次数ごとの表。添字が次数。 */
export type NgramTables = readonly ReadonlyMap<string, number>[];

function emptyTables(maxOrder: number): Map<string, number>[] {
  return Array.from({ length: maxOrder + 1 }, () => new Map<string, number>());
}

function addOne(table: Map<string, number>, key: string): void {
  table.set(key, (table.get(key) ?? 0) + 1);
}

/** 開始位置が `[from, to)` にある `order + 1` 文字の並びを数える。 */
function countStartingIn(chars: readonly string[], order: number, from: number, to: number, table: Map<string, number>): void {
  const last = Math.min(to, chars.length - order);
  for (let start = Math.max(0, from); start < last; start++) {
    let key = '';
    for (let offset = 0; offset <= order; offset++) key += chars[start + offset]!;
    addOne(table, key);
  }
}

/** 0次から `maxOrder` 次までの表。 */
export function countNgrams(chars: readonly string[], maxOrder: number): Map<string, number>[] {
  const tables = emptyTables(maxOrder);
  for (let order = 0; order <= maxOrder; order++) countStartingIn(chars, order, 0, chars.length, tables[order]!);
  return tables;
}

/**
 * 文字位置の範囲 `[from, to)` の文字を1つでも含む並びだけを数えた表。
 * 次数 `r` では、開始位置が `[from − r, to)` にある並びにあたる（文字列 `[from − r, to + r)` の中の並びを端で切ったもの）。
 */
export function countNgramsOverlapping(chars: readonly string[], from: number, to: number, maxOrder: number): Map<string, number>[] {
  const tables = emptyTables(maxOrder);
  for (let order = 0; order <= maxOrder; order++) countStartingIn(chars, order, from - order, to, tables[order]!);
  return tables;
}

/** 表を足す。 */
export function addNgramTables(a: NgramTables, b: NgramTables): Map<string, number>[] {
  const count = Math.max(a.length, b.length);
  const sum = emptyTables(count - 1);
  for (let order = 0; order < count; order++) {
    for (const table of [a[order], b[order]]) {
      if (table === undefined) continue;
      for (const [key, value] of table) sum[order]!.set(key, (sum[order]!.get(key) ?? 0) + value);
    }
  }
  return sum;
}

/** `whole` から `part` を引く。出現回数が0になった並びは表から外す。`part` が `whole` より多い並びがあれば例外を投げる。 */
export function subtractNgramTables(whole: NgramTables, part: NgramTables): Map<string, number>[] {
  const result: Map<string, number>[] = whole.map((table) => new Map(table));
  for (let order = 0; order < part.length; order++) {
    const table = result[order];
    if (table === undefined) throw new Error(`${order}次の表が引かれる側に無い`);
    for (const [key, value] of part[order]!) {
      const left = (table.get(key) ?? 0) - value;
      if (left < 0) throw new Error(`${order}次の並び ${JSON.stringify(key)} の出現回数が足りない`);
      if (left === 0) table.delete(key);
      else table.set(key, left);
    }
  }
  return result;
}

/**
 * 全体の表から、範囲 `[from, to)` の文字を含む並びをすべて引いた表。範囲の前 `[0, from)` と後 `[to, 末尾)` を別々に数えて足した表と一致する。
 * 範囲の前と後をつないだ所に、新しい並びは作らない。
 */
export function ngramTablesWithoutRange(whole: NgramTables, chars: readonly string[], from: number, to: number): Map<string, number>[] {
  return subtractNgramTables(whole, countNgramsOverlapping(chars, from, to, whole.length - 1));
}

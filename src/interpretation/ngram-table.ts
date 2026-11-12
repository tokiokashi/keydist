/**
 * 文字の列から、n-gram（連続する文字の並び）の出現回数の表を作る（定義は `docs/kana-chain-comparison.md`）。
 *
 * 次数 `r` の表は、連続する `r + 1` 文字の並びと出現回数を持つ。0次は1文字、1次は2文字、2次は3文字の並び。
 * 文字は評価に渡すテキストのコードポイント1つで、句読点・長音・打鍵できない文字も区別せず1文字に数える。
 * 並びの鍵は、その文字を続けて書いた文字列。
 * 単位が文字でなく文字列（文節の読み）の時は、単位の区切りを鍵に入れて数える（`countNgrams`の`separator`）。
 * 同じ表の形で、文節の読みの系列とかなの系列を数える定義は`docs/corpus-ngram.md`。
 */

/** 次数ごとの表。添字が次数。 */
export type NgramTables = readonly ReadonlyMap<string, number>[];

function emptyTables(maxOrder: number): Map<string, number>[] {
  return Array.from({ length: maxOrder + 1 }, () => new Map<string, number>());
}

function addOne(table: Map<string, number>, key: string): void {
  table.set(key, (table.get(key) ?? 0) + 1);
}

/** 開始位置が`[from, to)`にある`order + 1`単位の並びを数える。鍵は単位を`separator`でつないだ文字列。 */
function countStartingIn(chars: readonly string[], order: number, from: number, to: number, table: Map<string, number>, separator: string): void {
  const last = Math.min(to, chars.length - order);
  for (let start = Math.max(0, from); start < last; start++) {
    let key = chars[start]!;
    for (let offset = 1; offset <= order; offset++) key += separator + chars[start + offset]!;
    addOne(table, key);
  }
}

/** 鍵が単位の区切りを曖昧にしないことを確かめる。`separator`が空でない時、どの単位も`separator`を含まない。 */
function assertUnambiguousKeys(units: readonly string[], separator: string): void {
  if (separator === '') return;
  for (const unit of units) {
    if (unit.includes(separator)) throw new Error(`単位 ${JSON.stringify(unit)} が鍵の区切り ${JSON.stringify(separator)} を含む`);
  }
}

/**
 * 0次から`maxOrder`次までの表。
 * 単位が1コードポイントの文字なら、`separator`は空にして文字を続けて書いた鍵にする。
 * 単位が文字列（文節の読みなど）なら、単位に含まれない`separator`を渡す。`['ab', 'c']`と`['a', 'bc']`が同じ鍵にならないようにするため。
 */
export function countNgrams(chars: readonly string[], maxOrder: number, separator = ''): Map<string, number>[] {
  assertUnambiguousKeys(chars, separator);
  const tables = emptyTables(maxOrder);
  for (let order = 0; order <= maxOrder; order++) countStartingIn(chars, order, 0, chars.length, tables[order]!, separator);
  return tables;
}

/**
 * 単位の列の集まり（走り）ごとに数えて、表を足した結果。走りの間をまたぐ並びは数えない。
 * 走りのつなぎ目に、新しい並びを作らない。
 */
export function countNgramsInRuns(runs: readonly (readonly string[])[], maxOrder: number, separator = ''): Map<string, number>[] {
  const tables = emptyTables(maxOrder);
  for (const run of runs) {
    assertUnambiguousKeys(run, separator);
    for (let order = 0; order <= maxOrder; order++) countStartingIn(run, order, 0, run.length, tables[order]!, separator);
  }
  return tables;
}

/**
 * 文字位置の範囲 `[from, to)` の文字を1つでも含む並びだけを数えた表。
 * 次数 `r` では、開始位置が `[from − r, to)` にある並びにあたる（文字列 `[from − r, to + r)` の中の並びを端で切ったもの）。
 */
export function countNgramsOverlapping(chars: readonly string[], from: number, to: number, maxOrder: number): Map<string, number>[] {
  const tables = emptyTables(maxOrder);
  for (let order = 0; order <= maxOrder; order++) countStartingIn(chars, order, from - order, to, tables[order]!, '');
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

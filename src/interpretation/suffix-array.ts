/**
 * 整数の列の接尾辞配列とLCP配列（定義は`docs/corpus-ngram.md`の「文字列の候補の一覧」）。
 * 接尾辞配列は、列の位置を、その位置から始まる接尾辞の辞書順に並べたもの。
 * LCP配列は、並びが隣り合う2つの接尾辞の、先頭から一致する長さ。
 */

/**
 * 接尾辞配列。`symbols`の値は`0`以上`alphabet`未満の整数。
 * 倍加法で、各段を基数ソートで並べるので、時間は`O(n log n)`。
 * 接尾辞が列の終わりで尽きる時は、尽きた方を先に並べる。
 */
export function buildSuffixArray(symbols: Int32Array, alphabet: number): Int32Array {
  const n = symbols.length;
  const sa = new Int32Array(n);
  if (n === 0) return sa;
  let rank = new Int32Array(n);
  let next = new Int32Array(n);
  const byName = new Int32Array(n);
  const counts = new Int32Array(Math.max(alphabet, n) + 1);

  for (let i = 0; i < n; i++) counts[symbols[i]!]++;
  for (let i = 1; i < alphabet; i++) counts[i]! += counts[i - 1]!;
  for (let i = n - 1; i >= 0; i--) sa[--counts[symbols[i]!]!] = i;
  rank.set(symbols);
  let ranks = alphabet;

  for (let width = 1; ; width <<= 1) {
    // 2つ目の鍵（width先の順位）の順に並べる。先が尽きる位置は最小として先頭に置く
    let p = 0;
    for (let i = n - width; i < n; i++) if (i >= 0) byName[p++] = i;
    for (let j = 0; j < n; j++) if (sa[j]! >= width) byName[p++] = sa[j]! - width;
    // 1つ目の鍵（今の順位）で、安定に並べ直す
    counts.fill(0, 0, ranks + 1);
    for (let i = 0; i < n; i++) counts[rank[i]!]++;
    for (let i = 1; i < ranks; i++) counts[i]! += counts[i - 1]!;
    for (let j = n - 1; j >= 0; j--) {
      const position = byName[j]!;
      sa[--counts[rank[position]!]!] = position;
    }
    // 新しい順位。2つの鍵が同じ接尾辞は同じ順位
    next[sa[0]!] = 0;
    let top = 0;
    for (let j = 1; j < n; j++) {
      const a = sa[j - 1]!;
      const b = sa[j]!;
      const same = rank[a] === rank[b] && (a + width < n ? rank[a + width]! : -1) === (b + width < n ? rank[b + width]! : -1);
      if (!same) top++;
      next[b] = top;
    }
    [rank, next] = [next, rank];
    ranks = top + 1;
    if (ranks === n) break;
  }
  return sa;
}

/** LCP配列（Kasaiらの線形時間の方法）。`lcp[i]`は`sa[i - 1]`と`sa[i]`の接尾辞の共通の長さで、`lcp[0]`は0。 */
export function buildLcpArray(symbols: Int32Array, sa: Int32Array): Int32Array {
  const n = symbols.length;
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) rank[sa[i]!] = i;
  const lcp = new Int32Array(n);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const r = rank[i]!;
    if (r === 0) {
      h = 0;
      continue;
    }
    const j = sa[r - 1]!;
    while (i + h < n && j + h < n && symbols[i + h] === symbols[j + h]) h++;
    lcp[r] = h;
    if (h > 0) h--;
  }
  return lcp;
}

/** LCP区間。`lcp`は共通の長さ、`[left, right]`は接尾辞配列の範囲（両端を含む）。出現回数は`right - left + 1`。 */
export interface LcpInterval {
  readonly lcp: number;
  readonly left: number;
  readonly right: number;
}

/**
 * 共通の長さが1以上のLCP区間を、すべて1度ずつ渡す（接尾辞木の、根を除く内部の節に当たる）。
 * 区間の文字列は、右に1文字伸ばすと出現回数が減る繰り返し（右に極大）になる。
 */
export function forEachLcpInterval(lcp: Int32Array, visit: (interval: LcpInterval) => void): void {
  const n = lcp.length;
  const lengths: number[] = [0];
  const lefts: number[] = [0];
  for (let i = 1; i <= n; i++) {
    const current = i < n ? lcp[i]! : 0;
    let left = i - 1;
    while (current < lengths[lengths.length - 1]!) {
      const length = lengths.pop()!;
      left = lefts.pop()!;
      visit({ lcp: length, left, right: i - 1 });
    }
    if (current > lengths[lengths.length - 1]!) {
      lengths.push(current);
      lefts.push(left);
    }
  }
}

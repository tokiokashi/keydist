/**
 * 挿入順を保つ`Map`を使った素朴なLRU。`get`で当たったキーを末尾へ動かし、
 * `set`で上限を超えたら先頭（最も長く触っていない）を1件捨てる。
 */
export class LruCache<K, V> {
  private readonly store = new Map<K, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: K): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    // 触ったキーを最新として末尾へ動かす。
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size <= this.max) return;
    const oldest = this.store.keys().next();
    if (!oldest.done) this.store.delete(oldest.value);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

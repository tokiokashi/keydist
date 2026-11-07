/**
 * 共有リンクで届いた解析設定を、保存済みの解析設定へ部分マージする。
 * リンクに載っていない項目は保存済みの値が残り、載っている項目だけが置き換わる。
 * リンクから読めた項目が無ければ`undefined`を返し、書き込みを起こさない。
 */
export function mergeSharedOptions<V>(current: V, shared: Partial<V>): V | undefined {
  if (Object.keys(shared).length === 0) return undefined;
  return { ...current, ...shared } as V;
}

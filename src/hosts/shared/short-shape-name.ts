/**
 * 物理配列の短い名前（スマホ幅の文脈バーのチップに出す）。
 *
 * 物理配列の定義には短い名前が無いので、名前から作る。組み込みの名前は
 * 「種類（規格・補足）」の形なので、次の2つだけを削る。
 * - 括弧の前の「スタッガード」（「ロウスタッガード」→「ロウ」。種類の区別は残る）
 * - 括弧の中の「・」以降（「ANSI・分割想定」→「ANSI」）
 * どちらにも当てはまらない名前（自作の物理配列など）はそのまま返す。
 */
export function shortShapeName(name: string): string {
  return name
    .replace(/スタッガード(?=（)/, '')
    .replace(/（([^（）・]+)・[^（）]*）$/, '（$1）');
}

/**
 * 一覧の中で短い名前が重なる物理配列は、区別がつかなくなるので全名のままにする。
 */
export function shortShapeNames(
  shapes: readonly { readonly id: string; readonly name: string }[],
): ReadonlyMap<string, string> {
  const shorts = shapes.map((shape) => ({ id: shape.id, name: shape.name, short: shortShapeName(shape.name) }));
  const counts = new Map<string, number>();
  for (const { short } of shorts) counts.set(short, (counts.get(short) ?? 0) + 1);
  return new Map(shorts.map(({ id, name, short }) => [id, (counts.get(short) ?? 0) > 1 ? name : short] as const));
}

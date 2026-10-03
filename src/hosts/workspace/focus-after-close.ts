/**
 * ペインを閉じた後に、キーボードのフォーカスをどのペインへ置くかの規則（純粋な部分）。
 * フォーカスのあった要素ごと消えると、フォーカスは`body`へ落ち、キーボードの利用者は
 * 操作の続きをページの先頭から探し直すことになる。落とさずに、閉じたペインの隣へ置く。
 *
 * `order`は閉じる前のペインの並び（画面の読み順）、`remaining`は閉じた後に残るペインのid。
 * 読み順で閉じたペインの次の、残るペイン。次が無ければ前の、残るペイン。残るペインが無ければ`undefined`
 * （呼び出し側が「ペインを追加」のボタンへ置く）。同時に消えるペインは候補にしない。
 */
export function pickAfterClose(order: readonly string[], closed: string, remaining: readonly string[]): string | undefined {
  const index = order.indexOf(closed);
  if (index < 0) return undefined;
  const alive = (id: string) => id !== closed && remaining.includes(id);
  return order.slice(index + 1).find(alive) ?? order.slice(0, index).reverse().find(alive);
}

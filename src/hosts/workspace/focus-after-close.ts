/**
 * ペインを閉じた後に、キーボードのフォーカスをどこへ置くかの規則（純粋な部分）。
 * フォーカスのあった要素ごと消えると、フォーカスは`body`へ落ち、キーボードの利用者は
 * 操作の続きをページの先頭から探し直すことになる。落とさずに、閉じたペインの隣へ置く。
 */

/** タブの帯に並ぶ1枚。`groupId`は同じタブの組（Dockviewのグループ）かどうかを見分けるための印。 */
export interface TabSlot {
  readonly paneId: string;
  readonly groupId: string;
}

/**
 * 閉じたペインの後で、フォーカスを置くタブの組を決める。
 * `order`は閉じる前のタブの並び（左→右・上→下の読み順）で、`remaining`は閉じた後に残るペインのid。
 * 1. 同じ組に残るタブがあれば、その組
 * 2. 無ければ（組ごと消えた）、読み順で閉じたタブの次のタブの組、それも無ければ前のタブの組
 * 残るタブが無ければ`undefined`（呼び出し側が「追加」のボタンへ置く）。
 * 戻り値は組の印で、組のどのタブへ置くか（選択中のタブ）は呼び出し側がDOMから決める。
 */
export function pickGroupAfterClose(
  order: readonly TabSlot[],
  closedPaneId: string,
  remaining: readonly string[],
): string | undefined {
  const closedIndex = order.findIndex((slot) => slot.paneId === closedPaneId);
  if (closedIndex < 0) return undefined;
  const alive = order.filter((slot) => slot.paneId !== closedPaneId && remaining.includes(slot.paneId));
  const closedGroup = order[closedIndex]!.groupId;
  if (alive.some((slot) => slot.groupId === closedGroup)) return closedGroup;
  const next = order.slice(closedIndex + 1).find((slot) => alive.includes(slot));
  if (next !== undefined) return next.groupId;
  const previous = order.slice(0, closedIndex).reverse().find((slot) => alive.includes(slot));
  return previous?.groupId;
}

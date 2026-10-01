import { useEffect, useRef, useState, type RefCallback } from 'react';
import { pickGroupAfterClose, type TabSlot } from './focus-after-close.ts';

/**
 * ペインを閉じた後に、フォーカスが`body`へ落ちないようにする（タブの×・Deleteキー・⋯の「閉じる」・Undoの
 * どれで閉じても同じ規則。規則は`focus-after-close.ts`、操作の説明は`docs/architecture.md`「Workspace」）。
 *
 * 閉じる経路ごとに処理を書くと、経路が増えた時に抜ける。そこで経路を問わず、次の2つだけを見る:
 * - フォーカスが入ったペイン（タブか、ペインの中）と、その時のタブの並びを覚える
 * - 覚えたペインが資産から無くなり、フォーカスが`body`へ落ちていたら、規則に沿って置き直す
 * フォーカスが別の場所（開いている小窓など）へ移っていたら奪わない。
 */

/** ペインに属する要素から、そのペインのid。タブは`data-tab-panel-id`（Dockview）、中身は`data-pane-id`。 */
function paneIdOf(element: Element): string | undefined {
  return element.closest('[data-tab-panel-id]')?.getAttribute('data-tab-panel-id')
    ?? element.closest('[data-pane-id]')?.getAttribute('data-pane-id')
    ?? undefined;
}

let nextGroupSerial = 0;
const groupSerials = new WeakMap<Element, string>();
function groupIdOf(group: Element): string {
  let id = groupSerials.get(group);
  if (id === undefined) {
    id = `g${nextGroupSerial++}`;
    groupSerials.set(group, id);
  }
  return id;
}

function readTabOrder(root: Element): { readonly slots: TabSlot[] } {
  const slots: TabSlot[] = [];
  for (const tab of root.querySelectorAll('.dv-tab[data-tab-panel-id]')) {
    const group = tab.closest('.dv-groupview');
    if (group === null) continue;
    const groupId = groupIdOf(group);
    slots.push({ paneId: tab.getAttribute('data-tab-panel-id')!, groupId });
  }
  return { slots };
}

function focusableAddButton(root: Element): HTMLElement | null {
  return root.querySelector<HTMLElement>('.workspace-add-pane-button');
}

/**
 * 戻り値のref（コールバック）を、フォーカスを見張る入れ物（Workspaceの画面の根）に付ける。
 * 根は資産の読み込み前は描かれないので、`useRef`ではなく、付いた時に見張り始めるコールバックにする。
 */
export function useFocusAfterClose(paneIds: readonly string[]): RefCallback<HTMLElement> {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const lastRef = useRef<{ readonly paneId: string; readonly order: ReturnType<typeof readTabOrder> } | undefined>(undefined);

  useEffect(() => {
    if (root === null) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const paneId = event.target instanceof Element ? paneIdOf(event.target) : undefined;
      lastRef.current = paneId === undefined ? undefined : { paneId, order: readTabOrder(root) };
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [root]);

  useEffect(() => {
    const last = lastRef.current;
    if (root === null || last === undefined || paneIds.includes(last.paneId)) return undefined;
    lastRef.current = undefined;
    const restore = () => {
      const active = document.activeElement;
      // 別の場所へ移っている（小窓・メニューなど）なら、そこを尊重する
      if (active !== null && active !== document.body) return;
      const groupId = pickGroupAfterClose(last.order.slots, last.paneId, paneIds);
      // 描き直しで組の要素が作り直されることがあるので、組は要素ではなく、残ったペインのタブから引き直す
      const survivors = groupId === undefined
        ? []
        : last.order.slots.filter((slot) => slot.groupId === groupId && paneIds.includes(slot.paneId));
      let tab: HTMLElement | null = null;
      for (const slot of survivors) {
        const member = root.querySelector(`.dv-tab[data-tab-panel-id="${CSS.escape(slot.paneId)}"]`);
        const group = member?.closest('.dv-groupview');
        if (group === null || group === undefined) continue;
        tab = group.querySelector<HTMLElement>('.dv-tab[aria-selected="true"]') ?? member as HTMLElement;
        break;
      }
      tab?.focus({ preventScroll: true });
      if (document.activeElement === null || document.activeElement === document.body) {
        focusableAddButton(root)?.focus({ preventScroll: true });
      }
    };
    // ペインの部品・メニューの片付けが終わってから落ちるフォーカスもあるので、1フレーム後にもう一度見る
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [root, paneIds]);
  return setRoot;
}

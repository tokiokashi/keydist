import { useEffect, useRef, useState, type RefCallback } from 'react';

/**
 * ペインを閉じた後に、フォーカスが`body`へ落ちないようにする（⋯の「閉じる」・Undoのどれで閉じても同じ規則）。
 * フォーカスのあった要素ごと消えると、フォーカスは`body`へ落ち、キーボードの利用者は操作の続きを
 * ページの先頭から探し直すことになる。
 *
 * 閉じる経路ごとに処理を書くと、経路が増えた時に抜ける。そこで経路を問わず、次の2つだけを見る:
 * - フォーカスが入ったペインと、その時のペインの並び（読み順）を覚える
 * - 覚えたペインが資産から無くなり、フォーカスが`body`へ落ちていたら、読み順で次（無ければ前）のペインの
 *   ⋯のボタンへ、それも無ければ「追加」のボタンへ置く
 * フォーカスが別の場所（開いている小窓など）へ移っていたら奪わない。
 */

/** ペインに属する要素から、そのペインのid。 */
function paneIdOf(element: Element): string | undefined {
  return element.closest('[data-pane-id]')?.getAttribute('data-pane-id') ?? undefined;
}

/** 閉じたペインの次（無ければ前）の、残っているペイン。 */
function pickAfterClose(order: readonly string[], closed: string, remaining: readonly string[]): string | undefined {
  const index = order.indexOf(closed);
  if (index < 0) return undefined;
  const alive = (id: string) => id !== closed && remaining.includes(id);
  return order.slice(index + 1).find(alive) ?? order.slice(0, index).reverse().find(alive);
}

/**
 * 戻り値のref（コールバック）を、フォーカスを見張る入れ物（Workspaceの画面の根）に付ける。
 * 根は資産の読み込み前は描かれないので、`useRef`ではなく、付いた時に見張り始めるコールバックにする。
 * `paneIds`は画面の読み順のペインのid。
 */
export function useFocusAfterClose(paneIds: readonly string[]): RefCallback<HTMLElement> {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const lastRef = useRef<{ readonly paneId: string; readonly order: readonly string[] } | undefined>(undefined);
  const orderRef = useRef(paneIds);

  useEffect(() => {
    if (root === null) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const paneId = event.target instanceof Element ? paneIdOf(event.target) : undefined;
      lastRef.current = paneId === undefined ? undefined : { paneId, order: orderRef.current };
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [root]);

  useEffect(() => {
    orderRef.current = paneIds;
    const last = lastRef.current;
    if (root === null || last === undefined || paneIds.includes(last.paneId)) return undefined;
    lastRef.current = undefined;
    const restore = () => {
      const active = document.activeElement;
      // 別の場所へ移っている（小窓・メニューなど）なら、そこを尊重する
      if (active !== null && active !== document.body) return;
      const next = pickAfterClose(last.order, last.paneId, paneIds);
      const target = next === undefined
        ? undefined
        : root.querySelector<HTMLElement>(`.workspace-grid-item[data-pane-id="${CSS.escape(next)}"] .pane-menu-button, .workspace-stack-pane[data-pane-id="${CSS.escape(next)}"] .pane-menu-button`);
      (target ?? root.querySelector<HTMLElement>('.workspace-add-pane-button'))?.focus({ preventScroll: true });
    };
    // ペインの部品・メニューの片付けが終わってから落ちるフォーカスもあるので、1フレーム後にもう一度見る
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [root, paneIds]);
  return setRoot;
}

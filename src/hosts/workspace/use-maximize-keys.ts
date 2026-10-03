import { useEffect, useRef } from 'react';

/** 入力欄・選択欄での押下か（Escapeは入力の取り消しに使われるので、拡大は解かない）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Escapeで先に閉じるべきものが開いているか。開閉の状態は各部品が持つので、画面に出ているものをDOMで見る。
 * `aria-expanded="true"`は、メニュー・解析設定・対象の選択・条件・ⓘなど、開いている間だけ付くボタンの印。
 */
const OVERLAY_SELECTOR = 'dialog[open], [aria-expanded="true"]';

/**
 * 拡大表示のキー操作とフォーカス。
 * - Escapeで元に戻す。ただし拡大中に開いたもの（メニュー・小窓・モーダル等）が開いている間は、それらを閉じるだけにする
 *   （内側から1枚ずつ）。各部品は自分のEscapeで閉じるので、それより先に（captureで）開いているかを見る。
 *   閉じた後に見ると、閉じたのと同じ押下で拡大まで解けてしまう
 * - 戻した後、フォーカスが行き場を失っていれば（bodyにあれば）、拡大していたペインの⋯へ置く
 */
export function useMaximizeKeys(maximizedId: string | undefined, restore: () => void): void {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    if (maximizedId === undefined) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (isTypingTarget(event.target) || document.querySelector(OVERLAY_SELECTOR) !== null) return;
      restoreRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [maximizedId]);

  const previousRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const before = previousRef.current;
    previousRef.current = maximizedId;
    if (before === undefined || maximizedId !== undefined) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    document.querySelector<HTMLElement>(`.workspace-grid-item[data-pane-id="${CSS.escape(before)}"] .pane-menu-button[aria-label$="の操作"]`)?.focus({ preventScroll: true });
  }, [maximizedId]);
}

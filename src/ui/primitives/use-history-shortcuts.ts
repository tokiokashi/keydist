import { useEffect, useRef } from 'react';
import { historyShortcutOf, isMacPlatform, isTextEntryTarget } from './history-shortcut.ts';

export interface HistoryShortcutHandlers {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

/**
 * 元に戻す・やり直すのキー操作を、押せるボタンと同じ処理へ結ぶ。
 *
 * 動かさない場面:
 * - `enabled`が偽（個人速度の測定中など、ボタンも押せない間）
 * - 文字を入力する欄にフォーカスがある（欄の中の元に戻すを優先する）
 * - `<dialog>`のモーダルが開いている（削除や破棄の確認のダイアログ。条件のモーダルは自分で受ける）
 * - 戻せる・やり直せる項目が無い（ブラウザの既定の動作を妨げない）
 *
 * 浮かぶ小窓（操作を止めない窓）は`<dialog>`のモーダルではないので、開いていても動く。
 */
export function useHistoryShortcuts(handlers: HistoryShortcutHandlers, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;
    const isMac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = historyShortcutOf(event, isMac);
      if (shortcut === undefined) return;
      if (isTextEntryTarget(event.target instanceof HTMLElement ? event.target : null)) return;
      if (document.querySelector('dialog[open]') !== null) return;
      const { canUndo, canRedo, undo, redo } = latest.current;
      if (shortcut === 'undo' ? !canUndo : !canRedo) return;
      event.preventDefault();
      (shortcut === 'undo' ? undo : redo)();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

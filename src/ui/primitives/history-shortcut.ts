/**
 * 元に戻す・やり直すのキー操作の判定（DOMを持たない部分）。
 * Ctrl+Z（macOSは⌘Z）で元に戻す。Ctrl+Shift+ZとCtrl+Y（macOSは⌘⇧Z）でやり直す。
 */

export type HistoryShortcut = 'undo' | 'redo';

/** `KeyboardEvent`のうち判定に使う部分。 */
export interface ShortcutKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export function historyShortcutOf(event: ShortcutKeyEvent, isMac: boolean): HistoryShortcut | undefined {
  if (event.altKey) return undefined;
  // 主たる修飾キーはmacOSなら⌘、他はCtrl。もう片方が一緒に押されている組み合わせは別の操作として扱う
  const primary = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!primary) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !isMac && !event.shiftKey) return 'redo';
  return undefined;
}

/** macOS（iPadOSを含む）か。キー操作の主たる修飾キーが⌘になる。 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/** `Element`のうち判定に使う部分。 */
export interface ShortcutTarget {
  readonly tagName: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
}

/** 文字を入れない`input`の種類。これらは欄そのものに元に戻すが無い。 */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'image', 'file', 'color']);

/**
 * 文字を入力する欄（文字を入れる種類の`input`・`textarea`・`contenteditable`）か。ここにフォーカスがある間は、
 * 欄の中の元に戻すを優先して、資産の履歴は動かさない。チェックボックス・スライダー・ラジオボタン・
 * 選択欄は含めない（欄そのものに元に戻すが無く、解析設定はこれらの部品でできているため）。
 */
export function isTextEntryTarget(target: ShortcutTarget | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') return !NON_TEXT_INPUT_TYPES.has((target.type ?? 'text').toLowerCase());
  return false;
}

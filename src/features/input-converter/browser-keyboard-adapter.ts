import type { PhysicalKeyEvent } from '../../core/input-converter/index.ts';

export interface BrowserKeyboardEventLike {
  readonly type: string;
  readonly code: string;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

const CODE_TO_KEY: Readonly<Record<string, PhysicalKeyEvent['key']>> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Tab: 'tab',
  Escape: 'escape',
  CapsLock: 'caps-lock',
  Backquote: 'backquote',
  Backslash: 'backslash',
  Space: 'thumb-r',
  Convert: 'thumb-r',
  NonConvert: 'thumb-l',
  ShiftLeft: 'shift-l',
  ShiftRight: 'shift-r',
};

export function isBrowserTextInputCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code)
    || /^Digit[0-9]$/.test(code)
    || [
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Semicolon',
      'Quote',
      'Backquote',
      'Backslash',
      'Comma',
      'Period',
      'Slash',
    ].includes(code);
}

export function browserCodeToPhysicalKey(
  code: string,
): PhysicalKeyEvent['key'] | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_TO_KEY[code];
}

/**
 * keydownをlayout inputとしてbrowserから所有するかを判定する。
 *
 * repeatはここでは除外しない。layout所有keyに加え、英数字・記号の標準文字keyは
 * 未定義でもbrowser既定文字入力を抑止する。domain eventへの変換側でrepeat自体は捨てる。
 * IME compositionとOS/browser shortcutは従来どおりbrowser側へ残す。
 */
export function shouldCaptureBrowserKeyDown(
  event: BrowserKeyboardEventLike,
  ownedPhysicalKeys: ReadonlySet<PhysicalKeyEvent['key']>,
): boolean {
  if (event.type !== 'keydown' || event.isComposing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  const key = browserCodeToPhysicalKey(event.code);
  return key !== undefined
    && (ownedPhysicalKeys.has(key) || isBrowserTextInputCode(event.code));
}

/**
 * BrowserのKeyboardEventをdomain eventへ落とす薄いadapter。
 *
 * 物理位置をsource of truthにするため `key` ではなく `code` を使う。
 * IME composition / OS shortcut / key repeatはapplication edgeで除外し、
 * coreへDOM event objectを渡さない。
 */
export function browserKeyboardEventToPhysicalKeyEvent(
  event: BrowserKeyboardEventLike,
): PhysicalKeyEvent | undefined {
  if (event.type !== 'keydown' && event.type !== 'keyup') return undefined;
  if (event.isComposing) return undefined;
  if (
    event.type === 'keydown'
    && (event.ctrlKey || event.altKey || event.metaKey)
  ) return undefined;
  if (event.type === 'keydown' && event.repeat) return undefined;

  const key = browserCodeToPhysicalKey(event.code);
  if (key === undefined) return undefined;

  return {
    type: event.type === 'keydown' ? 'down' : 'up',
    key,
  };
}

import type { PhysicalKeyEvent } from './engine/index.ts';
import {
  CODE_TO_KEY,
  EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
  browserCodeToPhysicalKey,
  type BrowserKeyBindingOverrides,
} from '#input/shapes/browser-key-codes.ts';

export interface BrowserKeyboardEventLike {
  readonly type: string;
  readonly code: string;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

const LETTER_CODES = Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`);
const DIGIT_CODES = Array.from({ length: 10 }, (_, index) => `Digit${index}`);
const KNOWN_BROWSER_CODES = [...LETTER_CODES, ...DIGIT_CODES, ...Object.keys(CODE_TO_KEY), 'IntlYen', 'IntlRo'] as const;

export function browserCodesForPhysicalKey(
  key: PhysicalKeyEvent['key'],
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): readonly string[] {
  const codes = new Set<string>([...KNOWN_BROWSER_CODES, ...Object.keys(overrides)]);
  return [...codes].filter((code) => browserCodeToPhysicalKey(code, overrides) === key).sort();
}

export function isBrowserTextInputCode(code: string): boolean {
  return (
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    [
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Semicolon',
      'Quote',
      'Backquote',
      'Backslash',
      'IntlYen',
      'IntlRo',
      'Comma',
      'Period',
      'Slash',
    ].includes(code)
  );
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
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): boolean {
  if (event.type !== 'keydown' || event.isComposing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  const key = browserCodeToPhysicalKey(event.code, overrides);
  return key !== undefined && (ownedPhysicalKeys.has(key) || isBrowserTextInputCode(event.code));
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
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): PhysicalKeyEvent | undefined {
  if (event.type !== 'keydown' && event.type !== 'keyup') return undefined;
  if (event.isComposing) return undefined;
  if (event.type === 'keydown' && (event.ctrlKey || event.altKey || event.metaKey)) return undefined;
  if (event.type === 'keydown' && event.repeat) return undefined;

  const key = browserCodeToPhysicalKey(event.code, overrides);
  if (key === undefined) return undefined;

  return {
    type: event.type === 'keydown' ? 'down' : 'up',
    key,
  };
}

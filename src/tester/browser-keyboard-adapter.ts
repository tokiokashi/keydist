import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { PhysicalKeyEvent } from './engine/index.ts';
import {
  EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
  type BrowserKeyBindingOverrides,
} from './browser-keyboard-bindings.ts';

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


const LETTER_CODES = Array.from({ length: 26 }, (_, index) =>
  `Key${String.fromCharCode(65 + index)}`);
const DIGIT_CODES = Array.from({ length: 10 }, (_, index) => `Digit${index}`);
const KNOWN_BROWSER_CODES = [
  ...LETTER_CODES,
  ...DIGIT_CODES,
  ...Object.keys(CODE_TO_KEY),
  'IntlYen',
  'IntlRo',
] as const;

export function browserCodesForPhysicalKey(
  key: PhysicalKeyEvent['key'],
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): readonly string[] {
  const codes = new Set<string>([
    ...KNOWN_BROWSER_CODES,
    ...Object.keys(overrides),
  ]);
  return [...codes]
    .filter((code) => browserCodeToPhysicalKey(code, overrides) === key)
    .sort();
}

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
      'IntlYen',
      'IntlRo',
      'Comma',
      'Period',
      'Slash',
    ].includes(code);
}

export function browserCodeToPhysicalKey(
  code: string,
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): PhysicalKeyEvent['key'] | undefined {
  if (Object.prototype.hasOwnProperty.call(overrides, code)) {
    return overrides[code] ?? undefined;
  }
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
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): boolean {
  if (event.type !== 'keydown' || event.isComposing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  const key = browserCodeToPhysicalKey(event.code, overrides);
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
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): PhysicalKeyEvent | undefined {
  if (event.type !== 'keydown' && event.type !== 'keyup') return undefined;
  if (event.isComposing) return undefined;
  if (
    event.type === 'keydown'
    && (event.ctrlKey || event.altKey || event.metaKey)
  ) return undefined;
  if (event.type === 'keydown' && event.repeat) return undefined;

  const key = browserCodeToPhysicalKey(event.code, overrides);
  if (key === undefined) return undefined;

  return {
    type: event.type === 'keydown' ? 'down' : 'up',
    key,
  };
}

// KeyboardEvent.codeはブラウザの識別子（KeyA・NonConvert等）なので、画面にはキーキャップの刻印で出す。
// codeはUS配列の位置で名付けられているため、JISキーボードでは刻印が違うキーを引き直す。
const CODE_LABELS: Readonly<Record<string, string>> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Backslash: '\\',
  IntlYen: '¥',
  IntlRo: '\\ (ろ)',
  Space: 'Space',
  Convert: '変換',
  NonConvert: '無変換',
  KanaMode: 'かな',
  Lang1: 'かな',
  Lang2: '英数',
  Tab: 'Tab',
  Escape: 'Esc',
  CapsLock: 'Caps Lock',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ShiftLeft: '左Shift',
  ShiftRight: '右Shift',
  ControlLeft: '左Ctrl',
  ControlRight: '右Ctrl',
  AltLeft: '左Alt',
  AltRight: '右Alt',
  MetaLeft: '左Win/⌘',
  MetaRight: '右Win/⌘',
  ContextMenu: 'メニュー',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const JIS_CODE_LABELS: Readonly<Record<string, string>> = {
  Equal: '^',
  BracketLeft: '@',
  BracketRight: '[',
  Quote: ':',
  Backslash: ']',
  Backquote: '半角/全角',
};

/** ブラウザのキーcodeを、利用者が手元のキーボードで見る刻印に直す。 */
export function browserCodeDisplayLabel(
  code: string,
  standard?: PhysicalKeyboardStandard,
): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `テンキー${code.slice(6)}`;
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  if (standard === 'jis') {
    const jis = JIS_CODE_LABELS[code];
    if (jis !== undefined) return jis;
  }
  return CODE_LABELS[code] ?? code;
}

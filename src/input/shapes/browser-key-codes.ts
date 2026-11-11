import type { PhysicalKeyId } from '#input/semantics/types.ts';
import { isPresetGeometryKind, presetGeometryStandard, resolveKeyId } from './geometry.ts';

/** `KeyboardEvent.code`から物理キーのidへの、利用者が決めた対応。`null`はそのcodeを割り当てなしにする。 */
export type BrowserKeyBindingOverrides = Readonly<Record<string, PhysicalKeyId | null>>;

export const EMPTY_BROWSER_KEY_BINDING_OVERRIDES: BrowserKeyBindingOverrides = {};

/** 通常の文字キー（`Key*`・`Digit*`）以外の、`KeyboardEvent.code`から物理キーのidへの標準の対応。 */
export const CODE_TO_KEY: Readonly<Record<string, PhysicalKeyId>> = {
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

/** JISの物理配列では、`\`・`¥`・`ろ`のキーが格子の中の別の位置にある。 */
export const JIS_BROWSER_BINDINGS: BrowserKeyBindingOverrides = {
  Backslash: 'r2c11',
  IntlYen: 'r0c12',
  IntlRo: 'r3c10',
};

/**
 * `event.code`から物理キーのidを引く。`overrides`にあるcodeは、標準の対応より先に使う。
 */
export function browserCodeToPhysicalKey(
  code: string,
  overrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): PhysicalKeyId | undefined {
  if (Object.hasOwn(overrides, code)) {
    return overrides[code] ?? undefined;
  }
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_TO_KEY[code];
}

/**
 * 物理配列に応じた対応に、利用者が決めた対応を重ねたもの。重ねる順は、標準の対応、JISの物理配列の対応、利用者の対応。
 * Testerと文章を打つ測定が同じ対応でキーを引くために、ここに置く。
 */
export function browserKeyBindingsForShape(
  shapeId: string,
  userOverrides: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): BrowserKeyBindingOverrides {
  return {
    ...(isPresetGeometryKind(shapeId) && presetGeometryStandard(shapeId) === 'jis' ? JIS_BROWSER_BINDINGS : {}),
    ...userOverrides,
  };
}

/** 画面に出す`event.code`の名前。名前を決めていないcodeは、codeそのままにする。 */
export function browserCodeLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return { Convert: '変換', NonConvert: '無変換' }[code] ?? code;
}

/**
 * `bindings`の対応で`keyId`に引ける`event.code`。標準の対応にあるcodeを先に、利用者の対応にだけあるcodeを後に、重複なく並べる。
 * 割り当てなしにしたcodeと、別のキーに割り当て直したcodeは含まない。
 */
export function browserCodesOfKey(keyId: string, bindings: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES): string[] {
  const target = resolveKeyId(keyId);
  const codes = new Set([...Object.keys(CODE_TO_KEY), ...Object.keys(bindings)]);
  return [...codes].filter((code) => {
    const found = browserCodeToPhysicalKey(code, bindings);
    return found !== undefined && resolveKeyId(found) === target;
  });
}

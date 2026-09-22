import type { CanonicalInputMap } from '../../core/semantic-input/index.ts';
import type { PhysicalKeyEvent } from '../../core/input-converter/index.ts';
import { EXTRA_KEY, resolveKeyId } from '../../geometry.ts';

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
  Escape: EXTRA_KEY.ESCAPE,
  Tab: EXTRA_KEY.TAB,
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'thumb-r',
  Convert: 'thumb-r',
  NonConvert: 'thumb-l',
  ShiftLeft: 'shift-l',
  ShiftRight: 'shift-r',
};

export function browserCodeToPhysicalKey(
  code: string,
): PhysicalKeyEvent['key'] | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_TO_KEY[code];
}

/**
 * BrowserのKeyboardEventをdomain eventへ落とす薄いadapter。
 *
 * 物理位置をsource of truthにするため `key` ではなく `code` を使う。
 * IME composition / OS shortcut / key repeatはapplication edgeで除外し、
 * coreへDOM event objectを渡さない。
 */
export function canonicalInputPhysicalKeys(
  inputs: CanonicalInputMap,
): ReadonlySet<PhysicalKeyEvent['key']> {
  const keys = new Set<PhysicalKeyEvent['key']>();
  for (const alternatives of inputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        for (const key of input.physicalKeys) keys.add(resolveKeyId(key));
      }
    }
  }
  return keys;
}

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

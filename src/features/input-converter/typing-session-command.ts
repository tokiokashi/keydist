import {
  TypingInputEngine,
  type RecognizedTypingInput,
} from '../../core/input-converter/index.ts';

export type TypingEditCommand = 'backspace' | 'enter';

export type TypingTextEdit =
  | { readonly kind: 'delete-last' }
  | { readonly kind: 'append'; readonly value: string };

export interface TypingEditCommandResult {
  readonly recognized: readonly RecognizedTypingInput[];
  readonly textEdit: TypingTextEdit;
}

const withoutLastCodePoint = (value: string): string => {
  const codePoints = Array.from(value);
  codePoints.pop();
  return codePoints.join('');
};

/**
 * 編集commandは文字列だけでなく未確定recognition stateの境界でもある。
 * Phase 1では物理hold継続を先回りせず、command後はengine全体をresetする。
 */
export function executeTypingEditCommand(
  engine: TypingInputEngine,
  command: TypingEditCommand,
): TypingEditCommandResult {
  if (command === 'backspace') {
    engine.reset();
    return {
      recognized: [],
      textEdit: { kind: 'delete-last' },
    };
  }

  const flushed = engine.flush();
  engine.reset();
  return {
    recognized: flushed.recognized,
    textEdit: {
      kind: 'append',
      value: flushed.recognized.map((entry) => entry.output).join('') + '\n',
    },
  };
}

export function applyTypingTextEdit(
  current: string,
  edit: TypingTextEdit,
): string {
  if (edit.kind === 'delete-last') return withoutLastCodePoint(current);
  return current + edit.value;
}

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

export function applyRecognizedTypingInputs(
  current: string,
  recognized: readonly RecognizedTypingInput[],
): string {
  let next = current;
  for (const entry of recognized) {
    const replaced = entry.replacePreviousText;
    if (replaced !== undefined && replaced.length > 0 && next.endsWith(replaced)) {
      next = next.slice(0, next.length - replaced.length);
    }
    next += entry.output;
  }
  return next;
}

/**
 * 編集commandは文字列だけでなくrecognition stateの境界でもある。
 * Backspaceはhistoryを破棄し、Enterはpending physical operationをflushしてからresetする。
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
      value: '\n',
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

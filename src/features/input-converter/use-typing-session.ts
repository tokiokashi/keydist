import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  TypingInputEngine,
  type RecognizedTypingInput,
  type TypingInputResult,
} from '../../core/input-converter/index.ts';
import type { Layout } from '../../layouts/index.ts';
import { browserKeyboardEventToPhysicalKeyEvent } from './browser-keyboard-adapter.ts';

export interface TypingSession {
  readonly captureRef: RefObject<HTMLDivElement | null>;
  readonly text: string;
  readonly pressedKeys: readonly string[];
  readonly lastRecognized: readonly RecognizedTypingInput[];
  readonly active: boolean;
  readonly composing: boolean;
  clear(): void;
}

const withoutLastCodePoint = (value: string): string => {
  const codePoints = Array.from(value);
  codePoints.pop();
  return codePoints.join('');
};

export function useTypingSession(layout: Layout): TypingSession {
  const captureRef = useRef<HTMLDivElement>(null);
  const engine = useMemo(
    () => new TypingInputEngine(layout.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    }),
    [layout],
  );

  const [text, setText] = useState('');
  const [pressedKeys, setPressedKeys] = useState<readonly string[]>([]);
  const [lastRecognized, setLastRecognized] = useState<readonly RecognizedTypingInput[]>([]);
  const [active, setActive] = useState(false);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const target = captureRef.current;
    if (target === null) return;

    let isComposing = false;

    const applyResult = (result: TypingInputResult) => {
      setPressedKeys(result.pressedKeys);
      if (result.recognized.length === 0) return;

      setLastRecognized(result.recognized);
      setText((current) =>
        current + result.recognized.map((entry) => entry.output).join(''));
    };

    const resetRecognition = () => {
      engine.reset();
      setPressedKeys([]);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        target.blur();
        return;
      }

      if (!isComposing && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.key === 'Backspace' && !event.repeat) {
          event.preventDefault();
          setText(withoutLastCodePoint);
          return;
        }

        if (event.key === 'Enter' && !event.repeat) {
          event.preventDefault();
          applyResult(engine.flush());
          setText((current) => current + '\n');
          return;
        }
      }

      const physical = browserKeyboardEventToPhysicalKeyEvent(event);
      if (physical === undefined) return;

      event.preventDefault();
      applyResult(engine.handle(physical));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const physical = browserKeyboardEventToPhysicalKeyEvent(event);
      if (physical === undefined) return;

      event.preventDefault();
      applyResult(engine.handle(physical));
    };

    const onFocus = () => setActive(true);
    const onBlur = () => {
      setActive(false);
      resetRecognition();
    };
    const onWindowBlur = () => resetRecognition();
    const onCompositionStart = () => {
      isComposing = true;
      setComposing(true);
      resetRecognition();
    };
    const onCompositionEnd = () => {
      isComposing = false;
      setComposing(false);
      resetRecognition();
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('focus', onFocus);
    target.addEventListener('blur', onBlur);
    target.addEventListener('compositionstart', onCompositionStart);
    target.addEventListener('compositionend', onCompositionEnd);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('focus', onFocus);
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('compositionstart', onCompositionStart);
      target.removeEventListener('compositionend', onCompositionEnd);
      window.removeEventListener('blur', onWindowBlur);
      engine.reset();
    };
  }, [engine]);

  const clear = () => {
    engine.reset();
    setText('');
    setPressedKeys([]);
    setLastRecognized([]);
  };

  return {
    captureRef,
    text,
    pressedKeys,
    lastRecognized,
    active,
    composing,
    clear,
  };
}

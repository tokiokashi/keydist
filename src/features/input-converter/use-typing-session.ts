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
import { physicalKeysUsedByLayout } from '../../layout-physical-keys.ts';
import {
  browserKeyboardEventToPhysicalKeyEvent,
  shouldCaptureBrowserKeyDown,
} from './browser-keyboard-adapter.ts';
import {
  applyRecognizedTypingInputs,
  applyTypingTextEdit,
  executeTypingEditCommand,
} from './typing-session-command.ts';

export interface TypingSession {
  readonly captureRef: RefObject<HTMLTextAreaElement | null>;
  readonly text: string;
  readonly pressedKeys: readonly string[];
  readonly lastRecognized: readonly RecognizedTypingInput[];
  readonly active: boolean;
  readonly composing: boolean;
  readonly readyLayoutId: string | undefined;
  clear(): void;
}

export function useTypingSession(layout: Layout): TypingSession {
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const engine = useMemo(
    () => new TypingInputEngine(layout.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    }),
    [layout],
  );
  const ownedPhysicalKeys = useMemo(() => physicalKeysUsedByLayout(layout), [layout]);

  const [text, setText] = useState('');
  const [pressedKeys, setPressedKeys] = useState<readonly string[]>([]);
  const [lastRecognized, setLastRecognized] = useState<readonly RecognizedTypingInput[]>([]);
  const [active, setActive] = useState(false);
  const [composing, setComposing] = useState(false);
  const [readyLayoutId, setReadyLayoutId] = useState<string>();

  useEffect(() => {
    const target = captureRef.current;
    if (target === null) return;

    let isComposing = false;

    const applyResult = (result: TypingInputResult) => {
      setPressedKeys(result.pressedKeys);
      if (result.recognized.length === 0) return;

      setLastRecognized(result.recognized);
      setText((current) => applyRecognizedTypingInputs(current, result.recognized));
    };

    const resetRecognition = () => {
      engine.reset();
      setPressedKeys([]);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const layoutOwnsPhysicalKey = shouldCaptureBrowserKeyDown(event, ownedPhysicalKeys);

      if (event.key === 'Escape' && !layoutOwnsPhysicalKey) {
        event.preventDefault();
        target.blur();
        return;
      }

      if (!isComposing && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (
          event.key === 'Backspace'
          || (event.key === 'Enter' && !event.repeat)
        ) {
          event.preventDefault();
          const command = executeTypingEditCommand(
            engine,
            event.key === 'Backspace' ? 'backspace' : 'enter',
          );
          setPressedKeys([]);
          if (command.recognized.length > 0) {
            setLastRecognized(command.recognized);
          }
          setText((current) => applyTypingTextEdit(
            applyRecognizedTypingInputs(current, command.recognized),
            command.textEdit,
          ));
          return;
        }
      }

      if (!layoutOwnsPhysicalKey) return;

      event.preventDefault();
      const physical = browserKeyboardEventToPhysicalKeyEvent(event);
      if (physical === undefined) return;
      applyResult(engine.handle(physical));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const physical = browserKeyboardEventToPhysicalKeyEvent(event);
      if (physical === undefined || !ownedPhysicalKeys.has(physical.key)) return;

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
    setReadyLayoutId(layout.id);

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
  }, [engine, layout.id, ownedPhysicalKeys]);

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
    readyLayoutId,
    clear,
  };
}

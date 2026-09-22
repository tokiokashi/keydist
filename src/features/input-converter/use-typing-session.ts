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
import { kanaToRomaji } from '../../romaji/kunrei.ts';
import { physicalKeysUsedByLayout } from '../../layout-physical-keys.ts';
import {
  advanceKeyPatternPresentation,
  EMPTY_KEY_PATTERN_PRESENTATION_STATE,
  type KeyPatternPresentationState,
} from '../../key-pattern-picker.ts';
import {
  browserKeyboardEventToPhysicalKeyEvent,
  isBrowserTextInputCode,
  shouldCaptureBrowserKeyDown,
} from './browser-keyboard-adapter.ts';
import {
  EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
  type BrowserKeyBindingOverrides,
} from './browser-keyboard-bindings.ts';
import {
  liveRomajiContextSatisfied,
  romajiToKana,
} from './live-romaji.ts';
import {
  applyRecognizedTypingInputs,
  applyTypingTextEdit,
  executeTypingEditCommand,
} from './typing-session-command.ts';

export interface TypingSession {
  readonly captureRef: RefObject<HTMLTextAreaElement | null>;
  readonly text: string;
  readonly pressedKeys: readonly string[];
  readonly recognitionKeys: readonly string[];
  readonly presentation: KeyPatternPresentationState;
  readonly lastRecognized: readonly RecognizedTypingInput[];
  readonly active: boolean;
  readonly composing: boolean;
  readonly readyLayoutId: string | undefined;
  clear(): void;
}

export function useTypingSession(
  layout: Layout,
  browserBindings: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): TypingSession {
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const rawTextRef = useRef('');
  const engine = useMemo(
    () => new TypingInputEngine(layout.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
      contextSatisfied: (requirements) =>
        liveRomajiContextSatisfied(requirements, rawTextRef.current),
    }),
    [layout],
  );
  const ownedPhysicalKeys = useMemo(() => physicalKeysUsedByLayout(layout), [layout]);

  const [text, setText] = useState('');
  const [pressedKeys, setPressedKeys] = useState<readonly string[]>([]);
  const [recognitionKeys, setRecognitionKeys] = useState<readonly string[]>([]);
  const [presentation, setPresentation] = useState<KeyPatternPresentationState>(
    EMPTY_KEY_PATTERN_PRESENTATION_STATE,
  );
  const [lastRecognized, setLastRecognized] = useState<readonly RecognizedTypingInput[]>([]);
  const [active, setActive] = useState(false);
  const [composing, setComposing] = useState(false);
  const [readyLayoutId, setReadyLayoutId] = useState<string>();

  const displayFromRaw = (raw: string): string =>
    layout.romajiTable === undefined
      ? raw
      : romajiToKana(raw, layout.romajiTable);

  const rawFromDisplay = (display: string): string =>
    layout.romajiTable === undefined
      ? display
      : kanaToRomaji(display, layout.romajiTable);

  useEffect(() => {
    rawTextRef.current = rawFromDisplay(text);
  }, [layout, text]);

  useEffect(() => {
    const target = captureRef.current;
    if (target === null) return;

    let isComposing = false;

    const applyResult = (
      result: TypingInputResult,
      physical: { type: 'down' | 'up'; key: string },
    ) => {
      setPressedKeys(result.pressedKeys);
      setRecognitionKeys(result.recognitionKeys);
      setPresentation((current) =>
        advanceKeyPatternPresentation(layout, current, physical, result));
      if (result.recognized.length === 0) return;

      setLastRecognized(result.recognized);
      const nextRaw = applyRecognizedTypingInputs(
        rawTextRef.current,
        result.recognized,
      );
      rawTextRef.current = nextRaw;
      setText(displayFromRaw(nextRaw));
    };

    const resetRecognition = () => {
      engine.reset();
      setPressedKeys([]);
      setRecognitionKeys([]);
      setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const capturesPhysicalKey = shouldCaptureBrowserKeyDown(
        event,
        ownedPhysicalKeys,
        browserBindings,
      );

      if (event.key === 'Escape' && !capturesPhysicalKey) {
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
          setRecognitionKeys([]);
          setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
          if (command.recognized.length > 0) {
            setLastRecognized(command.recognized);
          }
          if (command.textEdit.kind === 'delete-last') {
            setText((current) => {
              const nextDisplay = applyTypingTextEdit(current, command.textEdit);
              rawTextRef.current = rawFromDisplay(nextDisplay);
              return nextDisplay;
            });
          } else {
            const recognizedRaw = applyRecognizedTypingInputs(
              rawTextRef.current,
              command.recognized,
            );
            const nextRaw = applyTypingTextEdit(recognizedRaw, command.textEdit);
            rawTextRef.current = nextRaw;
            setText(displayFromRaw(nextRaw));
          }
          return;
        }
      }

      if (!capturesPhysicalKey) return;

      event.preventDefault();
      const physical = browserKeyboardEventToPhysicalKeyEvent(event, browserBindings);
      if (physical === undefined) return;
      applyResult(engine.handle(physical), physical);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const physical = browserKeyboardEventToPhysicalKeyEvent(event, browserBindings);
      if (physical === undefined) return;
      if (
        !ownedPhysicalKeys.has(physical.key)
        && !isBrowserTextInputCode(event.code)
      ) return;

      event.preventDefault();
      applyResult(engine.handle(physical), physical);
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
  }, [browserBindings, engine, layout, ownedPhysicalKeys]);

  const clear = () => {
    engine.reset();
    rawTextRef.current = '';
    setText('');
    setPressedKeys([]);
    setRecognitionKeys([]);
    setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
    setLastRecognized([]);
  };

  return {
    captureRef,
    text,
    pressedKeys,
    recognitionKeys,
    presentation,
    lastRecognized,
    active,
    composing,
    readyLayoutId,
    clear,
  };
}

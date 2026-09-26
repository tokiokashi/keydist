import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from 'react';
import {
  TypingInputEngine,
  type RecognizedTypingInput,
  type TypingInputResult,
} from '../../core/input-converter/index.ts';
import type { Layout } from '#input/layouts/index.ts';
import { kanaToRomaji } from '#input/romaji/kunrei.ts';
import { physicalKeysUsedByLayout } from '#input/layouts/physical-keys.ts';
import {
  advanceKeyPatternPresentation,
  EMPTY_KEY_PATTERN_PRESENTATION_STATE,
  type KeyPatternPresentationState,
} from '#input/layouts/key-pattern-picker.ts';
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
  readonly captureRefCallback: RefCallback<HTMLTextAreaElement>;
  readonly text: string;
  readonly pressedKeys: readonly string[];
  readonly recognitionKeys: readonly string[];
  readonly presentation: KeyPatternPresentationState;
  readonly lastRecognized: readonly RecognizedTypingInput[];
  readonly active: boolean;
  readonly composing: boolean;
  readonly readyLayoutId: string | undefined;
  replaceText(text: string): void;
  clear(): void;
}

export function useTypingSession(
  layout: Layout,
  browserBindings: BrowserKeyBindingOverrides = EMPTY_BROWSER_KEY_BINDING_OVERRIDES,
): TypingSession {
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const [captureTarget, setCaptureTarget] = useState<HTMLTextAreaElement | null>(null);
  const captureRefCallback = useCallback<RefCallback<HTMLTextAreaElement>>((element) => {
    captureRef.current = element;
    setCaptureTarget(element);
  }, []);
  const rawTextRef = useRef('');
  const pressedKeysRef = useRef<readonly string[]>([]);
  const recognitionKeysRef = useRef<readonly string[]>([]);
  const presentationRef = useRef<KeyPatternPresentationState>(
    EMPTY_KEY_PATTERN_PRESENTATION_STATE,
  );
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
    const target = captureTarget;
    if (target === null) return;

    let isComposing = false;

    const applyResult = (
      result: TypingInputResult,
      physical: { type: 'down' | 'up'; key: string },
    ) => {
      const nextPresentation = advanceKeyPatternPresentation(
        layout,
        presentationRef.current,
        physical,
        result,
      );
      pressedKeysRef.current = result.pressedKeys;
      recognitionKeysRef.current = result.recognitionKeys;
      presentationRef.current = nextPresentation;
      setPressedKeys(result.pressedKeys);
      setRecognitionKeys(result.recognitionKeys);
      setPresentation(nextPresentation);
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
      pressedKeysRef.current = [];
      recognitionKeysRef.current = [];
      presentationRef.current = EMPTY_KEY_PATTERN_PRESENTATION_STATE;
      setPressedKeys([]);
      setRecognitionKeys([]);
      setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
    };

    const reseedRecognition = (keys: readonly string[]) => {
      engine.reset();
      let nextPresentation = EMPTY_KEY_PATTERN_PRESENTATION_STATE;
      let latest: TypingInputResult = {
        recognized: [],
        pressedKeys: [],
        recognitionKeys: [],
      };

      for (const key of keys) {
        const physical = { type: 'down' as const, key };
        latest = engine.handle(physical);
        nextPresentation = advanceKeyPatternPresentation(
          layout,
          nextPresentation,
          physical,
          latest,
        );
      }

      pressedKeysRef.current = latest.pressedKeys;
      recognitionKeysRef.current = latest.recognitionKeys;
      presentationRef.current = nextPresentation;
      setPressedKeys(latest.pressedKeys);
      setRecognitionKeys(latest.recognitionKeys);
      setPresentation(nextPresentation);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const capturesPhysicalKey = shouldCaptureBrowserKeyDown(
        event,
        ownedPhysicalKeys,
        browserBindings,
      );

      if (event.key === 'Escape' && !capturesPhysicalKey) {
        event.preventDefault();
        resetRecognition();
        rawTextRef.current = '';
        setText('');
        setLastRecognized([]);
        return;
      }

      if (!isComposing && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (
          event.key === 'Backspace'
          || (event.key === 'Enter' && !event.repeat)
        ) {
          event.preventDefault();
          const preservingKeys = event.key === 'Backspace'
            ? recognitionKeysRef.current.filter(
              (key) => pressedKeysRef.current.includes(key),
            )
            : [];
          const command = executeTypingEditCommand(
            engine,
            event.key === 'Backspace' ? 'backspace' : 'enter',
          );
          if (event.key === 'Backspace') {
            reseedRecognition(preservingKeys);
          } else {
            pressedKeysRef.current = [];
            recognitionKeysRef.current = [];
            presentationRef.current = EMPTY_KEY_PATTERN_PRESENTATION_STATE;
            setPressedKeys([]);
            setRecognitionKeys([]);
            setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
          }
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
  }, [browserBindings, captureTarget, engine, layout, ownedPhysicalKeys]);

  const replaceText = (nextText: string) => {
    engine.reset();
    rawTextRef.current = rawFromDisplay(nextText);
    pressedKeysRef.current = [];
    recognitionKeysRef.current = [];
    presentationRef.current = EMPTY_KEY_PATTERN_PRESENTATION_STATE;
    setText(nextText);
    setPressedKeys([]);
    setRecognitionKeys([]);
    setPresentation(EMPTY_KEY_PATTERN_PRESENTATION_STATE);
    setLastRecognized([]);
  };

  const clear = () => replaceText('');

  return {
    captureRef,
    captureRefCallback,
    text,
    pressedKeys,
    recognitionKeys,
    presentation,
    lastRecognized,
    active,
    composing,
    readyLayoutId,
    replaceText,
    clear,
  };
}

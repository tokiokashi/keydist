import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  ANALYZER_SAMPLE_NAMES,
  analyzerSampleText,
  isAnalyzerSampleText,
} from './analyzer-samples.ts';
import type { ModeId } from './layout-selection.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import { MAX_SAVED_TEXT_LENGTH } from './ui-state.ts';

export interface AnalyzerReactShellOptions {
  root: HTMLElement;
  modeSlot: HTMLElement;
  textSlot: HTMLElement;
  stateOwner: AnalyzerUiStateOwner;
  onModeChange: () => void;
  onTextInput: () => void;
  onTextCommit: () => void;
}

export interface AnalyzerReactShellController {
  getText(): string;
  unmount(): void;
}

interface AnalyzerTextModel {
  value: string;
}

function AnalyzerReactShell({
  modeSlot,
  textSlot,
  stateOwner,
  textModel,
  onModeChange,
  onTextInput,
  onTextCommit,
}: Omit<AnalyzerReactShellOptions, 'root'> & { textModel: AnalyzerTextModel }) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const mode = state.ui.input.mode;
  const [text, setTextState] = useState(textModel.value);

  const setText = (value: string) => {
    textModel.value = value;
    setTextState(value);
  };

  const commitTextState = (value: string, debounce: boolean) => {
    const isSample = isAnalyzerSampleText(value);
    const tooLong = value.length > MAX_SAVED_TEXT_LENGTH;
    stateOwner.update((draft) => {
      if (isSample || tooLong) delete draft.ui.input.customText;
      else draft.ui.input.customText = value;
    }, debounce);
  };

  const changeMode = (nextMode: ModeId) => {
    if (nextMode === mode) return;
    const replaceSample = isAnalyzerSampleText(textModel.value);
    stateOwner.update((draft) => {
      draft.ui.input.mode = nextMode;
    });
    if (replaceSample) {
      setText(analyzerSampleText(
        nextMode,
        stateOwner.getSnapshot().ui.input.selectedSampleByMode[nextMode],
      ));
    }
    onModeChange();
  };

  const changeSample = (sampleId: string) => {
    const nextText = analyzerSampleText(mode, sampleId);
    setText(nextText);
    stateOwner.update((draft) => {
      draft.ui.input.selectedSampleByMode[mode] = sampleId;
      delete draft.ui.input.customText;
    });
    onTextCommit();
  };

  const resetSample = () => {
    setText(analyzerSampleText(mode, state.ui.input.selectedSampleByMode[mode]));
    stateOwner.update((draft) => {
      delete draft.ui.input.customText;
    });
    onTextCommit();
  };

  const updateText = (value: string) => {
    setText(value);
    commitTextState(value, true);
    onTextInput();
  };

  const commitText = () => {
    commitTextState(textModel.value, false);
    onTextCommit();
  };

  const tooLong = text.length > MAX_SAVED_TEXT_LENGTH;

  return (
    <>
      {createPortal(
        <label className="ctl">
          <span>入力方式</span>
          <select
            id="mode"
            value={mode}
            onChange={(event) => changeMode(event.currentTarget.value as ModeId)}
          >
            <option value="ja">日本語（かな → 訓令式ローマ字）</option>
            <option value="en">英文（英字配列そのまま）</option>
          </select>
        </label>,
        modeSlot,
      )}
      {createPortal(
        <>
          <label className="ctl">
            <span>サンプル</span>
            <span className="sample-controls">
              <select
                id="sample"
                value={state.ui.input.selectedSampleByMode[mode]}
                onChange={(event) => changeSample(event.currentTarget.value)}
              >
                {Object.entries(ANALYZER_SAMPLE_NAMES[mode]).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <button type="button" className="secondary" id="sample-reset" onClick={resetSample}>
                サンプルへ戻す
              </button>
            </span>
          </label>
          <textarea
            id="text"
            rows={12}
            spellCheck={false}
            value={text}
            onChange={(event) => updateText(event.currentTarget.value)}
            onBlur={commitText}
          />
          <p className="note" id="text-save-status" hidden={!tooLong}>
            {tooLong
              ? `本文が ${MAX_SAVED_TEXT_LENGTH.toLocaleString()} 文字を超えたため、この本文は保存しません。`
              : ''}
          </p>
        </>,
        textSlot,
      )}
    </>
  );
}

export function mountAnalyzerReactShell(
  options: AnalyzerReactShellOptions,
): AnalyzerReactShellController {
  const snapshot = options.stateOwner.getSnapshot();
  const mode = snapshot.ui.input.mode;
  const textModel: AnalyzerTextModel = {
    value: snapshot.ui.input.customText
      ?? analyzerSampleText(mode, snapshot.ui.input.selectedSampleByMode[mode]),
  };
  const root: Root = createRoot(options.root);
  options.root.dataset.analyzerReactShell = 'mounted';
  root.render(
    <AnalyzerReactShell
      modeSlot={options.modeSlot}
      textSlot={options.textSlot}
      stateOwner={options.stateOwner}
      textModel={textModel}
      onModeChange={options.onModeChange}
      onTextInput={options.onTextInput}
      onTextCommit={options.onTextCommit}
    />,
  );
  return {
    getText: () => textModel.value,
    unmount() {
      delete options.root.dataset.analyzerReactShell;
      root.unmount();
    },
  };
}

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  ANALYZER_SAMPLE_NAMES,
  analyzerSampleText,
  isAnalyzerSampleText,
} from './analyzer-samples.ts';
import type { ModeId } from './layout-selection.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import type { AnalyzerComparisonModel } from './analyzer-comparison-model.ts';
import type { AnalyzerPlaybackSurfaceModel } from './analyzer-playback-surface-model.ts';
import type { AnalyzerPlaybackSettingsModel } from './analyzer-playback-settings-model.ts';
import type { AnalyzerConditionsSurfaceModel, AnalyzerConditionsSurfaceSnapshot } from './analyzer-conditions-surface-model.ts';
import { AnalyzerLayoutEditor } from './analyzer-layout-editor.tsx';
import { AnalyzerCalibrationDialog } from './analyzer-calibration-dialog.tsx';
import type { AnalyzerLayoutEditorModel } from './analyzer-layout-editor-model.ts';
import type { UserLayout } from './user-layouts.ts';
import { MAX_SAVED_TEXT_LENGTH } from './ui-state.ts';

export interface AnalyzerReactShellOptions {
  root: HTMLElement;
  modeSlot: HTMLElement;
  textSlot: HTMLElement;
  comparisonSlot: HTMLElement;
  sensitivitySlot: HTMLElement;
  playbackSlot: HTMLElement;
  playbackSettingsSlot: HTMLElement;
  conditionsSlot: HTMLElement;
  layoutEditorSlot: HTMLElement;
  calibrationDialogSlot: HTMLDialogElement;
  stateOwner: AnalyzerUiStateOwner;
  comparisonModel: AnalyzerComparisonModel;
  playbackSurfaceModel: AnalyzerPlaybackSurfaceModel;
  playbackSettingsModel: AnalyzerPlaybackSettingsModel;
  conditionsSurfaceModel: AnalyzerConditionsSurfaceModel;
  layoutEditorModel: AnalyzerLayoutEditorModel;
  onModeChange: () => void;
  onTextInput: () => void;
  onTextCommit: () => void;
  onMetricsChange: () => void;
  onPlaybackSurfaceCommit: () => void;
  onPlaybackSettingsCommit: () => void;
  onConditionsSurfaceCommit: (snapshot: AnalyzerConditionsSurfaceSnapshot) => void;
  onAddLayout: (definition: UserLayout) => void;
  onCalibrationMount: () => void;
}

export interface AnalyzerReactShellController {
  getText(): string;
  unmount(): void;
}

interface AnalyzerTextModel {
  value: string;
}

function AnalyzerPlaybackSurface({
  model,
  onCommit,
}: {
  model: AnalyzerPlaybackSurfaceModel;
  onCommit: () => void;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );

  useLayoutEffect(() => {
    if (snapshot.html) onCommit();
  }, [snapshot.revision, snapshot.html, onCommit]);

  return (
    <div
      data-react-feature="playback"
      dangerouslySetInnerHTML={{ __html: snapshot.html }}
    />
  );
}

function AnalyzerPlaybackSettings({
  model,
  onCommit,
}: {
  model: AnalyzerPlaybackSettingsModel;
  onCommit: () => void;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );

  useLayoutEffect(() => {
    if (snapshot.html) onCommit();
  }, [snapshot.revision, snapshot.html, onCommit]);

  return (
    <div
      data-react-feature="playback-settings"
      dangerouslySetInnerHTML={{ __html: snapshot.html }}
    />
  );
}

function AnalyzerConditionsSurface({
  model,
  onCommit,
}: {
  model: AnalyzerConditionsSurfaceModel;
  onCommit: (snapshot: AnalyzerConditionsSurfaceSnapshot) => void;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!snapshot.content || !rootRef.current) return;
    rootRef.current.replaceChildren(snapshot.content);
    onCommit(snapshot);
  }, [snapshot.revision, snapshot.content, onCommit]);

  return <div ref={rootRef} data-react-feature="conditions" />;
}

function AnalyzerReactShell({
  modeSlot,
  textSlot,
  comparisonSlot,
  sensitivitySlot,
  playbackSlot,
  playbackSettingsSlot,
  conditionsSlot,
  layoutEditorSlot,
  calibrationDialogSlot,
  stateOwner,
  comparisonModel,
  playbackSurfaceModel,
  playbackSettingsModel,
  conditionsSurfaceModel,
  layoutEditorModel,
  textModel,
  onModeChange,
  onTextInput,
  onTextCommit,
  onMetricsChange,
  onPlaybackSurfaceCommit,
  onPlaybackSettingsCommit,
  onConditionsSurfaceCommit,
  onAddLayout,
  onCalibrationMount,
}: Omit<AnalyzerReactShellOptions, 'root'> & { textModel: AnalyzerTextModel }) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const comparison = useSyncExternalStore(
    comparisonModel.subscribe,
    comparisonModel.getSnapshot,
    comparisonModel.getSnapshot,
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

  const setBaseline = (value: string) => {
    stateOwner.update((draft) => {
      if (value) draft.ui.comparison.baselineByMode[mode] = value;
      else delete draft.ui.comparison.baselineByMode[mode];
    });
    onMetricsChange();
  };

  const setChartMetric = (value: string) => {
    stateOwner.update((draft) => {
      draft.ui.comparison.chartColumn = Number(value);
    });
    onMetricsChange();
  };

  const setSensitivityScale = (scale: 'relative' | 'absolute') => {
    stateOwner.update((draft) => {
      draft.ui.sensitivity.scale = scale;
    });
    onMetricsChange();
  };

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
      {createPortal(
        <div data-react-feature="comparison-metrics">
          <label className="ctl">
            <span>比較元</span>
            <select
              id="compare-baseline"
              title="選ぶと比較元を100%とした比率を表示する。比較できない項目は — と表示する。"
              value={state.ui.comparison.baselineByMode[mode] ?? ''}
              onChange={(event) => setBaseline(event.currentTarget.value)}
            >
              {comparison.baselineOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="ctl">
            <span>棒グラフの項目</span>
            <select
              id="compare-chart-metric"
              title="棒グラフの項目を選ぶ。表を並び替えるとその列に追従する。"
              value={String(state.ui.comparison.chartColumn)}
              onChange={(event) => setChartMetric(event.currentTarget.value)}
            >
              {comparison.chartMetricOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>,
        comparisonSlot,
      )}
      {createPortal(
        <div
          className="seg"
          role="group"
          aria-label="N感度の縦軸"
          data-react-feature="sensitivity-scale"
        >
          {(['relative', 'absolute'] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              data-scale={scale}
              aria-pressed={state.ui.sensitivity.scale === scale}
              onClick={() => setSensitivityScale(scale)}
            >
              {scale === 'relative' ? '相対 [%]' : '絶対 [u]'}
            </button>
          ))}
        </div>,
        sensitivitySlot,
      )}
      {createPortal(
        <AnalyzerPlaybackSurface
          model={playbackSurfaceModel}
          onCommit={onPlaybackSurfaceCommit}
        />,
        playbackSlot,
      )}
      {createPortal(
        <AnalyzerPlaybackSettings
          model={playbackSettingsModel}
          onCommit={onPlaybackSettingsCommit}
        />,
        playbackSettingsSlot,
      )}
      {createPortal(
        <AnalyzerConditionsSurface
          model={conditionsSurfaceModel}
          onCommit={onConditionsSurfaceCommit}
        />,
        conditionsSlot,
      )}
      {createPortal(
        <AnalyzerLayoutEditor
          model={layoutEditorModel}
          onAddLayout={onAddLayout}
        />,
        layoutEditorSlot,
      )}
      {createPortal(
        <AnalyzerCalibrationDialog onMount={onCalibrationMount} />,
        calibrationDialogSlot,
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
      comparisonSlot={options.comparisonSlot}
      sensitivitySlot={options.sensitivitySlot}
      playbackSlot={options.playbackSlot}
      playbackSettingsSlot={options.playbackSettingsSlot}
      conditionsSlot={options.conditionsSlot}
      layoutEditorSlot={options.layoutEditorSlot}
      calibrationDialogSlot={options.calibrationDialogSlot}
      stateOwner={options.stateOwner}
      comparisonModel={options.comparisonModel}
      playbackSurfaceModel={options.playbackSurfaceModel}
      playbackSettingsModel={options.playbackSettingsModel}
      conditionsSurfaceModel={options.conditionsSurfaceModel}
      layoutEditorModel={options.layoutEditorModel}
      textModel={textModel}
      onModeChange={options.onModeChange}
      onTextInput={options.onTextInput}
      onTextCommit={options.onTextCommit}
      onMetricsChange={options.onMetricsChange}
      onPlaybackSurfaceCommit={options.onPlaybackSurfaceCommit}
      onPlaybackSettingsCommit={options.onPlaybackSettingsCommit}
      onConditionsSurfaceCommit={options.onConditionsSurfaceCommit}
      onAddLayout={options.onAddLayout}
      onCalibrationMount={options.onCalibrationMount}
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

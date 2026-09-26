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
import type { AnalyzerComparisonModel } from './analyzer-comparison-model.ts';
import type {
  AnalyzerPlaybackSurfaceActions,
  AnalyzerPlaybackSurfaceModel,
} from './analyzer-playback-surface-model.ts';
import { AnalyzerPlaybackSurface } from './analyzer-playback-surface.tsx';
import type {
  AnalyzerPlaybackSettingsActions,
  AnalyzerPlaybackSettingsModel,
} from './analyzer-playback-settings-model.ts';
import { AnalyzerPlaybackSettings } from './analyzer-playback-settings.tsx';
import type {
  AnalyzerConditionsActions,
  AnalyzerConditionsModel,
} from './analyzer-conditions-model.ts';
import { AnalyzerLayoutEditor } from './analyzer-layout-editor.tsx';
import { AnalyzerCalibrationDialog } from './analyzer-calibration-dialog.tsx';
import type { AnalyzerCalibrationModel } from './analyzer-calibration-model.ts';
import { AnalyzerGeometryDialog } from './analyzer-geometry-dialog.tsx';
import type { AnalyzerGeometryEditorModel } from './analyzer-geometry-editor-model.ts';
import { AnalyzerRomajiDialog } from './analyzer-romaji-dialog.tsx';
import type { AnalyzerRomajiDialogModel } from './analyzer-romaji-dialog-model.ts';
import { AnalyzerBigramFlow } from './analyzer-bigram-flow.tsx';
import type { AnalyzerLayoutEditorModel } from './analyzer-layout-editor-model.ts';
import type { AnalyzerBigramFlowModel } from './analyzer-bigram-flow-model.ts';
import type { AnalyzerMetricsModel } from './analyzer-metrics-model.ts';
import { AnalyzerHeatmap } from './analyzer-heatmap-content.tsx';
import {
  AnalyzerAdjacentChart,
  AnalyzerComparisonChart,
  AnalyzerComparisonTable,
  AnalyzerDetailConditions,
  AnalyzerFingerChart,
  AnalyzerMatrixResult,
  AnalyzerSensitivityResults,
  AnalyzerTextMetricsStatus,
} from './analyzer-metrics-content.tsx';
import type { AnalyzerControlsModel } from './analyzer-controls-model.ts';
import {
  AnalyzerConditionsDialog,
  AnalyzerDialogActions,
  AnalyzerGeometryControls,
  AnalyzerHowDialog,
  AnalyzerStatefulPanel,
  AnalyzerThemeControls,
  AnalyzerSidebarControls,
} from './analyzer-remaining-ui.tsx';
import type { GeometryKind } from '#input/shapes/geometry.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import { MAX_SAVED_TEXT_LENGTH } from './ui-state.ts';

export interface AnalyzerReactShellOptions {
  root: HTMLElement;
  appElement: HTMLElement;
  themeControlsSlot: HTMLElement;
  modeSlot: HTMLElement;
  textPanelSlot: HTMLElement;
  comparisonSlot: HTMLElement;
  compareChartSlot: HTMLElement;
  compareTableSlot: HTMLTableElement;
  detailConditionsSlot: HTMLElement;
  heatmapSlot: HTMLElement;
  fingerChartSlot: HTMLElement;
  adjacentChartSlot: HTMLElement;
  pressMatrixSlot: HTMLElement;
  fingerMatrixSlot: HTMLElement;
  adjacentMeanMatrixSlot: HTMLElement;
  adjacentStdDevMatrixSlot: HTMLElement;
  sensitivityPanelSlot: HTMLElement;
  playbackSlot: HTMLElement;
  playbackSettingsSlot: HTMLElement;
  addPanelSlot: HTMLElement;
  geometryPanelSlot: HTMLElement;
  calibrationDialogSlot: HTMLDialogElement;
  geometryDialogSlot: HTMLDialogElement;
  romajiDialogSlot: HTMLDialogElement;
  bigramFlowSlot: HTMLElement;
  dialogActionsSlot: HTMLElement;
  sidebarControlsSlot: HTMLElement;
  howDialogSlot: HTMLDialogElement;
  conditionsDialogSlot: HTMLDialogElement;
  stateOwner: AnalyzerUiStateOwner;
  comparisonModel: AnalyzerComparisonModel;
  playbackSurfaceModel: AnalyzerPlaybackSurfaceModel;
  playbackSurfaceActions: AnalyzerPlaybackSurfaceActions;
  playbackSettingsModel: AnalyzerPlaybackSettingsModel;
  playbackSettingsActions: AnalyzerPlaybackSettingsActions;
  conditionsModel: AnalyzerConditionsModel;
  conditionsActions: AnalyzerConditionsActions;
  layoutEditorModel: AnalyzerLayoutEditorModel;
  bigramFlowModel: AnalyzerBigramFlowModel;
  metricsModel: AnalyzerMetricsModel;
  controlsModel: AnalyzerControlsModel;
  calibrationModel: AnalyzerCalibrationModel;
  geometryEditorModel: AnalyzerGeometryEditorModel;
  romajiDialogModel: AnalyzerRomajiDialogModel;
  onModeChange: () => void;
  onTextInput: () => void;
  onTextCommit: () => void;
  onMetricsChange: () => void;
  onAddLayout: (definition: UserLayout) => void;
  onToggleLayout: (layoutId: string, enabled: boolean) => void;
  onRemoveLayout: (layoutId: string) => void;
  onDetailLayoutChange: (layoutId: string) => void;
  onDetailGeometryChange: (layoutId: string, geometry: GeometryKind) => void;
  onWindowSizeChange: (value: number) => void;
  onSfbHomeChange: (value: boolean) => void;
  onPreferOppositeThumbChange: (value: boolean) => void;
  onDefaultGeometryChange: (geometry: GeometryKind) => void;
  onGeometryEdit: () => void;
  onGeometryExport: () => void;
  onGeometryImport: (file: File) => void | Promise<void>;
  onOpenHow: () => void;
  onOpenConditions: () => void;
  onOpenRomaji: () => void;
  onSensitivityToggle: (open: boolean) => void;
}

export interface AnalyzerReactShellController {
  getText(): string;
  unmount(): void;
}

interface AnalyzerTextModel {
  value: string;
}

function AnalyzerReactShell({
  appElement,
  themeControlsSlot,
  modeSlot,
  textPanelSlot,
  comparisonSlot,
  compareChartSlot,
  compareTableSlot,
  detailConditionsSlot,
  heatmapSlot,
  fingerChartSlot,
  adjacentChartSlot,
  pressMatrixSlot,
  fingerMatrixSlot,
  adjacentMeanMatrixSlot,
  adjacentStdDevMatrixSlot,
  sensitivityPanelSlot,
  playbackSlot,
  playbackSettingsSlot,
  addPanelSlot,
  geometryPanelSlot,
  calibrationDialogSlot,
  geometryDialogSlot,
  romajiDialogSlot,
  bigramFlowSlot,
  dialogActionsSlot,
  sidebarControlsSlot,
  howDialogSlot,
  conditionsDialogSlot,
  stateOwner,
  comparisonModel,
  playbackSurfaceModel,
  playbackSurfaceActions,
  playbackSettingsModel,
  playbackSettingsActions,
  conditionsModel,
  conditionsActions,
  layoutEditorModel,
  bigramFlowModel,
  metricsModel,
  controlsModel,
  calibrationModel,
  geometryEditorModel,
  romajiDialogModel,
  textModel,
  onModeChange,
  onTextInput,
  onTextCommit,
  onMetricsChange,
  onAddLayout,
  onToggleLayout,
  onRemoveLayout,
  onDetailLayoutChange,
  onDetailGeometryChange,
  onWindowSizeChange,
  onSfbHomeChange,
  onPreferOppositeThumbChange,
  onDefaultGeometryChange,
  onGeometryEdit,
  onGeometryExport,
  onGeometryImport,
  onOpenHow,
  onOpenConditions,
  onOpenRomaji,
  onSensitivityToggle,
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
        <AnalyzerStatefulPanel
          stateOwner={stateOwner}
          panel="text"
          id="text-panel"
          className="panel text-panel"
          summary={(
            <>
              <span className="text-title">評価テキスト</span>
              <span className="text-status">
                <AnalyzerTextMetricsStatus model={metricsModel} />
              </span>
            </>
          )}
        >
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
        </AnalyzerStatefulPanel>,
        textPanelSlot,
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
        <AnalyzerComparisonChart model={metricsModel} stateOwner={stateOwner} />,
        compareChartSlot,
      )}
      {createPortal(
        <AnalyzerComparisonTable model={metricsModel} stateOwner={stateOwner} />,
        compareTableSlot,
      )}
      {createPortal(
        <AnalyzerDetailConditions model={metricsModel} stateOwner={stateOwner} />,
        detailConditionsSlot,
      )}
      {createPortal(
        <AnalyzerHeatmap model={metricsModel} stateOwner={stateOwner} />,
        heatmapSlot,
      )}
      {createPortal(
        <AnalyzerFingerChart model={metricsModel} />,
        fingerChartSlot,
      )}
      {createPortal(
        <AnalyzerAdjacentChart model={metricsModel} />,
        adjacentChartSlot,
      )}
      {createPortal(
        <AnalyzerMatrixResult model={metricsModel} stateOwner={stateOwner} kind="press" />,
        pressMatrixSlot,
      )}
      {createPortal(
        <AnalyzerMatrixResult model={metricsModel} stateOwner={stateOwner} kind="finger" />,
        fingerMatrixSlot,
      )}
      {createPortal(
        <AnalyzerMatrixResult model={metricsModel} stateOwner={stateOwner} kind="adjacentMean" />,
        adjacentMeanMatrixSlot,
      )}
      {createPortal(
        <AnalyzerMatrixResult model={metricsModel} stateOwner={stateOwner} kind="adjacentStdDev" />,
        adjacentStdDevMatrixSlot,
      )}
      {createPortal(
        <AnalyzerStatefulPanel
          stateOwner={stateOwner}
          panel="sensitivity"
          id="sensitivity-panel"
          className="panel"
          summaryClassName="panel-head"
          onOpenChange={onSensitivityToggle}
          summary={(
            <>
              <h2>
                N感度
                <button
                  type="button"
                  className="info"
                  data-tip="Nを0〜10で振った時の総移動距離。ホームポジションから離れたキーを多用する場合傾きが大きくなる傾向がある。"
                  aria-label="Nを0〜10で振った時の総移動距離。ホームポジションから離れたキーを多用する場合傾きが大きくなる傾向がある。"
                >
                  i
                </button>
              </h2>
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
              </div>
            </>
          )}
        >
          <AnalyzerSensitivityResults model={metricsModel} stateOwner={stateOwner} />
          <p className="note">
            Nを増やすと距離は減るか変わらない。見るべきは傾きの差。<br />
            傾きが大きいほど、ホームから離れた連続打鍵が多い。<br />
            配列ごとの現在条件を使い、Nだけを0〜10で変化させる。
          </p>
        </AnalyzerStatefulPanel>,
        sensitivityPanelSlot,
      )}
      {createPortal(
        <AnalyzerPlaybackSurface
          model={playbackSurfaceModel}
          actions={playbackSurfaceActions}
          appElement={appElement}
          settingsPanelElement={playbackSettingsSlot}
        />,
        playbackSlot,
      )}
      {createPortal(
        <AnalyzerPlaybackSettings
          model={playbackSettingsModel}
          actions={playbackSettingsActions}
        />,
        playbackSettingsSlot,
      )}
      {createPortal(
        <AnalyzerThemeControls />,
        themeControlsSlot,
      )}
      {createPortal(
        <AnalyzerDialogActions
          onOpenHow={onOpenHow}
          onOpenConditions={onOpenConditions}
        />,
        dialogActionsSlot,
      )}
      {createPortal(
        <AnalyzerSidebarControls
          stateOwner={stateOwner}
          model={controlsModel}
          onToggleLayout={onToggleLayout}
          onRemoveLayout={onRemoveLayout}
          onDetailLayoutChange={onDetailLayoutChange}
          onDetailGeometryChange={onDetailGeometryChange}
          onWindowSizeChange={onWindowSizeChange}
          onSfbHomeChange={onSfbHomeChange}
          onPreferOppositeThumbChange={onPreferOppositeThumbChange}
          onOpenConditions={onOpenConditions}
          onOpenRomaji={onOpenRomaji}
        />,
        sidebarControlsSlot,
      )}
      {createPortal(
        <details className="panel" id="geometry-panel" data-react-feature="panel-geometry">
          <summary>打ち手と機材</summary>
          <AnalyzerGeometryControls
            stateOwner={stateOwner}
            model={controlsModel}
            onGeometryChange={onDefaultGeometryChange}
            onEdit={onGeometryEdit}
            onExport={onGeometryExport}
            onImport={onGeometryImport}
          />
        </details>,
        geometryPanelSlot,
      )}
      {createPortal(
        <AnalyzerHowDialog dialog={howDialogSlot} />,
        howDialogSlot,
      )}
      {createPortal(
        <AnalyzerConditionsDialog
          dialog={conditionsDialogSlot}
          stateOwner={stateOwner}
          model={conditionsModel}
          actions={conditionsActions}
        />,
        conditionsDialogSlot,
      )}
      {createPortal(
        <AnalyzerStatefulPanel
          stateOwner={stateOwner}
          panel="addLayout"
          id="add-panel"
          className="panel"
          summary="配列を追加"
        >
          <AnalyzerLayoutEditor
            model={layoutEditorModel}
            onAddLayout={onAddLayout}
          />
          <p className="note">
            数字段が空ならQWERTYを使う。重複した文字は先に書いたキーで打つ。<br />
            追加した配列はこのブラウザに保存する。
          </p>
        </AnalyzerStatefulPanel>,
        addPanelSlot,
      )}
      {createPortal(
        <AnalyzerCalibrationDialog
          dialog={calibrationDialogSlot}
          model={calibrationModel}
        />,
        calibrationDialogSlot,
      )}
      {createPortal(
        <AnalyzerGeometryDialog
          dialog={geometryDialogSlot}
          stateOwner={stateOwner}
          model={geometryEditorModel}
        />,
        geometryDialogSlot,
      )}
      {createPortal(
        <AnalyzerRomajiDialog model={romajiDialogModel} />,
        romajiDialogSlot,
      )}
      {createPortal(
        <AnalyzerBigramFlow model={bigramFlowModel} />,
        bigramFlowSlot,
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
      appElement={options.appElement}
      themeControlsSlot={options.themeControlsSlot}
      modeSlot={options.modeSlot}
      textPanelSlot={options.textPanelSlot}
      comparisonSlot={options.comparisonSlot}
      compareChartSlot={options.compareChartSlot}
      compareTableSlot={options.compareTableSlot}
      detailConditionsSlot={options.detailConditionsSlot}
      heatmapSlot={options.heatmapSlot}
      fingerChartSlot={options.fingerChartSlot}
      adjacentChartSlot={options.adjacentChartSlot}
      pressMatrixSlot={options.pressMatrixSlot}
      fingerMatrixSlot={options.fingerMatrixSlot}
      adjacentMeanMatrixSlot={options.adjacentMeanMatrixSlot}
      adjacentStdDevMatrixSlot={options.adjacentStdDevMatrixSlot}
      sensitivityPanelSlot={options.sensitivityPanelSlot}
      playbackSlot={options.playbackSlot}
      playbackSettingsSlot={options.playbackSettingsSlot}
      addPanelSlot={options.addPanelSlot}
      geometryPanelSlot={options.geometryPanelSlot}
      calibrationDialogSlot={options.calibrationDialogSlot}
      geometryDialogSlot={options.geometryDialogSlot}
      romajiDialogSlot={options.romajiDialogSlot}
      bigramFlowSlot={options.bigramFlowSlot}
      dialogActionsSlot={options.dialogActionsSlot}
      sidebarControlsSlot={options.sidebarControlsSlot}
      howDialogSlot={options.howDialogSlot}
      conditionsDialogSlot={options.conditionsDialogSlot}
      stateOwner={options.stateOwner}
      comparisonModel={options.comparisonModel}
      playbackSurfaceModel={options.playbackSurfaceModel}
      playbackSurfaceActions={options.playbackSurfaceActions}
      playbackSettingsModel={options.playbackSettingsModel}
      playbackSettingsActions={options.playbackSettingsActions}
      conditionsModel={options.conditionsModel}
      conditionsActions={options.conditionsActions}
      layoutEditorModel={options.layoutEditorModel}
      bigramFlowModel={options.bigramFlowModel}
      metricsModel={options.metricsModel}
      controlsModel={options.controlsModel}
      calibrationModel={options.calibrationModel}
      geometryEditorModel={options.geometryEditorModel}
      romajiDialogModel={options.romajiDialogModel}
      textModel={textModel}
      onModeChange={options.onModeChange}
      onTextInput={options.onTextInput}
      onTextCommit={options.onTextCommit}
      onMetricsChange={options.onMetricsChange}
      onAddLayout={options.onAddLayout}
      onToggleLayout={options.onToggleLayout}
      onRemoveLayout={options.onRemoveLayout}
      onDetailLayoutChange={options.onDetailLayoutChange}
      onDetailGeometryChange={options.onDetailGeometryChange}
      onWindowSizeChange={options.onWindowSizeChange}
      onSfbHomeChange={options.onSfbHomeChange}
      onPreferOppositeThumbChange={options.onPreferOppositeThumbChange}
      onDefaultGeometryChange={options.onDefaultGeometryChange}
      onGeometryEdit={options.onGeometryEdit}
      onGeometryExport={options.onGeometryExport}
      onGeometryImport={options.onGeometryImport}
      onOpenHow={options.onOpenHow}
      onOpenConditions={options.onOpenConditions}
      onOpenRomaji={options.onOpenRomaji}
      onSensitivityToggle={options.onSensitivityToggle}
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

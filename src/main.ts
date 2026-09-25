import {
  customGeometryKind,
  isCustomGeometryKind,
  isPresetGeometryKind,
  PHYSICAL_SHAPES,
  type GeometryKind,
  type PhysicalShape,
} from './geometry.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from './layouts/index.ts';
import { bindTips, hideTip, showTip } from './chart.ts';
import {
  load as loadUserLayouts,
  save as saveUserLayouts,
  toLayout,
  type RomajiRuleId,
  type UserLayout,
} from './user-layouts.ts';
import {
  defaultRomajiRuleId,
  loadRomajiSettings,
  tableForRule,
  allRomajiRules,
  saveRomajiSettings,
} from './romaji/rules.ts';
import { loadPlaybackCalibration } from './playback-calibration.ts';
import type { ModeId } from './layout-selection.ts';
import {
  type UiPlaybackState,
  type UiStateConditionsDefaults,
  type UiStateStorage,
  type UiStateLayoutConditions,
  type UiStateV1,
} from './ui-state.ts';
import { createAnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import { createAnalyzerUiStateBootstrap } from './analyzer-ui-state-bootstrap.ts';
import {
  mountAnalyzerReactShell,
  type AnalyzerReactShellController,
} from './analyzer-react-shell.tsx';
import { createAnalyzerComparisonModel } from './analyzer-comparison-model.ts';
import { createAnalyzerPlaybackSurfaceModel } from './analyzer-playback-surface-model.ts';
import { createAnalyzerPlaybackSettingsModel } from './analyzer-playback-settings-model.ts';
import {
  createAnalyzerConditionsModel,
  type AnalyzerConditionsActions,
} from './analyzer-conditions-model.ts';
import { createAnalyzerLayoutEditorModel } from './analyzer-layout-editor-model.ts';
import { createAnalyzerBigramFlowModel } from './analyzer-bigram-flow-model.ts';
import { createAnalyzerMetricsModel } from './analyzer-metrics-model.ts';
import { createAnalyzerControlsModel } from './analyzer-controls-model.ts';
import { createAnalyzerGeometryEditorModel } from './analyzer-geometry-editor-model.ts';
import { el } from './app-dom.ts';
import { createAnalyzerRomajiDialogModel } from './analyzer-romaji-dialog-model.ts';
import { createAnalyzerCalibrationModel } from './analyzer-calibration-model.ts';
import { createPlaybackView, type PlaybackViewController } from './playback-view.ts';
import { createResultsView, type ResultsViewController } from './results-view.ts';
import {
  clonePhysicalShape,
  geometrySettingsForPreset,
  type GeometrySettings,
} from './geometry-settings.ts';
import {
  load as loadUserGeometryShapes,
  newId as newGeometryId,
  save as saveUserGeometryShapes,
} from './user-geometries.ts';
import {
  allConditionPresets,
  loadConditionPresets,
  newConditionPresetId,
  saveConditionPresets,
  type ConditionPreset,
} from './condition-presets.ts';
import { setLayoutGeometryOverride } from './condition-resolution.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import {
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import {
  conditionBundleFromState,
  parseConditionBundle,
  serializeConditionBundle,
} from './condition-bundle.ts';
import { downloadText } from './browser-download.ts';

let userLayouts: UserLayout[] = loadUserLayouts();
let userGeometryShapes: PhysicalShape[] = loadUserGeometryShapes();
let romajiSettings = loadRomajiSettings();
let conditionPresets: ConditionPreset[] = loadConditionPresets();
const layoutEditorModel = createAnalyzerLayoutEditorModel(allRomajiRules(romajiSettings.rules));
const bigramFlowModel = createAnalyzerBigramFlowModel();
const controlsModel = createAnalyzerControlsModel();
const ROMAJI_TABLE_CACHE = new Map<string, Map<string, string>>();
let conditionState: UiStateV1 | undefined;

/** 同じルールのテーブルは描画間で共有し、設定を保存した時だけ捨てる。 */
function cachedRomajiTable(ruleId: RomajiRuleId): Map<string, string> {
  const cached = ROMAJI_TABLE_CACHE.get(ruleId);
  if (cached) return cached;
  const table = tableForRule(ruleId, romajiSettings.rules);
  ROMAJI_TABLE_CACHE.set(ruleId, table);
  return table;
}

/** 組み込みの配列に自作のものを足した一覧。自作は末尾に並ぶ */
function layoutsOf(mode: ModeId): Layout[] {
  const built = mode === 'en' ? LAYOUTS : LAYOUTS_JA;
  if (mode === 'en') return [...built, ...userLayouts.map(toLayout)];
  const assigned = built.map((layout) => {
    if (!layout.romajiTable) return layout;
    const ruleId = conditionState?.conditions.perLayout[layout.id]?.romajiRule
      ?? romajiSettings.assignments[layout.id]
      ?? defaultRomajiRuleId(layout.id);
    return { ...layout, romajiTable: cachedRomajiTable(ruleId) };
  });
  const mine = userLayouts.map((d) => d.direct
    ? toLayout(d)
    : withRomaji(toLayout(d), cachedRomajiTable(
      conditionState?.conditions.perLayout[d.id]?.romajiRule ?? d.romaji,
    )));
  return [...assigned, ...mine];
}

/** 配列に紐づくローマ字規則を、Metricsへ保存する識別子として解決する。 */
function romajiRuleIdForLayout(layout: Layout): string | null {
  if (!layout.romajiTable) return null;
  const user = userLayouts.find((definition) => definition.id === layout.id);
  return conditionState?.conditions.perLayout[layout.id]?.romajiRule
    ?? romajiSettings.assignments[layout.id]
    ?? (user && !user.direct ? user.romaji : undefined)
    ?? defaultRomajiRuleId(layout.id);
}

const MODES = {
  en: { get layouts() { return layoutsOf('en'); } },
  ja: { get layouts() { return layoutsOf('ja'); } },
};

function browserStorage(): UiStateStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const uiStorage = browserStorage();
let playbackCalibration = loadPlaybackCalibration(uiStorage);
const uiStateBootstrap = createAnalyzerUiStateBootstrap({
  builtInLayoutIds: {
    en: LAYOUTS.map((layout) => layout.id),
    ja: LAYOUTS_JA.map((layout) => layout.id),
  },
  userLayoutIds: userLayouts.map((layout) => layout.id),
  textPanelOpen: !window.matchMedia('(max-width: 900px)').matches,
  usePlaybackCalibration: playbackCalibration !== undefined,
});
const uiStateDefaults = uiStateBootstrap.defaults;
const uiStateChoices = uiStateBootstrap.choices;

function addLayoutChoices(layoutIds: readonly string[]): void {
  for (const mode of ['en', 'ja'] as const) {
    uiStateChoices.layouts[mode] = [...new Set([...uiStateChoices.layouts[mode], ...layoutIds])];
  }
}

function removeLayoutChoice(layoutId: string): void {
  for (const mode of ['en', 'ja'] as const) {
    uiStateChoices.layouts[mode] = uiStateChoices.layouts[mode].filter((id) => id !== layoutId);
  }
}

const uiStateOwner = createAnalyzerUiStateOwner(uiStorage, uiStateDefaults, uiStateChoices);
let uiState = uiStateOwner.getSnapshot();
conditionState = uiState;
uiStateOwner.subscribe(() => {
  uiState = uiStateOwner.getSnapshot();
  conditionState = uiState;
});
if (uiStateOwner.loadResult.migratedArpeggioModel) {
  queueMicrotask(() => window.alert(
    'Arpeggio構造判定を刷新し、旧幾何条件と旧Arpeggio Timingモードを廃止しました。',
  ));
}

/** 永続化する画面状態は必ずAnalyzer state ownerを通して更新する。 */
function updateUiState(change: (draft: UiStateV1) => void, debounce = false): void {
  uiStateOwner.update(change, debounce);
}

/** 旧形式の単一custom設定を、名前付き形状の先頭要素へ移行する。 */
function migrateCurrentGeometryShape(): void {
  const current = uiState.conditions.geometrySettings.shape;
  const presetId = current.id;
  if (isPresetGeometryKind(presetId)) {
    if (!isPresetGeometryKind(uiState.conditions.defaults.geometry)) {
      updateUiState((draft) => {
        draft.conditions.defaults.geometry = presetId;
        draft.ui.input.geometry = presetId;
      });
    }
    return;
  }
  const existing = userGeometryShapes.find((shape) => shape.id === current.id);
  if (!existing) {
    const migrated = clonePhysicalShape(current);
    migrated.id = current.id.startsWith('shape-') ? current.id : newGeometryId();
    if (migrated.name === 'カスタム形状') migrated.name = 'カスタム形状 1';
    userGeometryShapes = [...userGeometryShapes, migrated];
    saveUserGeometryShapes(userGeometryShapes);
    updateUiState((draft) => {
      draft.conditions.geometrySettings.shape = clonePhysicalShape(migrated);
      draft.conditions.defaults.geometry = customGeometryKind(migrated.id);
      draft.ui.input.geometry = customGeometryKind(migrated.id);
    });
  } else if (uiState.conditions.defaults.geometry !== customGeometryKind(existing.id)) {
    updateUiState((draft) => {
      draft.conditions.defaults.geometry = customGeometryKind(existing.id);
      draft.ui.input.geometry = customGeometryKind(existing.id);
    });
  }
}

migrateCurrentGeometryShape();

window.addEventListener('pagehide', () => {
  uiStateOwner.flush();
});

if (!playbackCalibration && uiState.ui.playback.useCalibration) {
  updateUiState((draft) => { draft.ui.playback.useCalibration = false; });
}


/** 表示する配列のidは、正規化済みAppStateから都度導出する。 */
function selectedLayoutIds(mode: ModeId): ReadonlySet<string> {
  return new Set(uiState.ui.layouts.selectedByMode[mode]);
}

/** 選択集合の更新経路を集約し、配列への変換もここだけで行う。 */
function updateSelectedLayouts(
  draft: UiStateV1,
  mode: ModeId,
  change: (selected: Set<string>) => void,
): void {
  const selected = new Set(draft.ui.layouts.selectedByMode[mode]);
  change(selected);
  draft.ui.layouts.selectedByMode[mode] = [...selected];
}

const currentModeId = () => uiState.ui.input.mode;
const currentMode = () => MODES[currentModeId()];

/** 選択されている配列。色のスロットは選択順ではなく一覧順に固定する */
function activeLayouts(): Layout[] {
  const selected = selectedLayoutIds(currentModeId());
  return currentMode().layouts.filter((layout) => selected.has(layout.id));
}

function addUserLayout(definition: UserLayout): void {
  userLayouts = [...userLayouts, definition];
  saveUserLayouts(userLayouts);
  addLayoutChoices([definition.id]);

  updateUiState((draft) => {
    for (const mode of ['en', 'ja'] as const) {
      updateSelectedLayouts(draft, mode, (selected) => {
        selected.add(definition.id);
      });
    }
  });

  fillPicker();
  fillDetailOptions();
  render();
}

const romajiDialogModel = createAnalyzerRomajiDialogModel({
  getRomajiSettings: () => romajiSettings,
  getUserLayouts: () => userLayouts,
  commitRomajiSettings: (settings, rulesChanged) => {
    romajiSettings = settings;
    saveRomajiSettings(settings);
    if (rulesChanged) {
      ROMAJI_TABLE_CACHE.clear();
      layoutEditorModel.setRomajiRules(allRomajiRules(settings.rules));
    }
  },
  commitUserLayouts: (layouts) => {
    userLayouts = layouts;
    saveUserLayouts(layouts);
    ROMAJI_TABLE_CACHE.clear();
  },
  onApplied: () => {
    fillPicker();
    fillDetailOptions();
    render();
  },
});

function removeUserLayout(id: string) {
  userLayouts = userLayouts.filter((l) => l.id !== id);
  saveUserLayouts(userLayouts);
  removeLayoutChoice(id);
  updateUiState((draft) => {
    for (const mode of ['en', 'ja'] as const) {
      updateSelectedLayouts(draft, mode, (selected) => {
        selected.delete(id);
      });
    }
    if (draft.ui.layouts.detailByMode.en === id) delete draft.ui.layouts.detailByMode.en;
    if (draft.ui.layouts.detailByMode.ja === id) delete draft.ui.layouts.detailByMode.ja;
    if (draft.ui.comparison.baselineByMode.en === id) delete draft.ui.comparison.baselineByMode.en;
    if (draft.ui.comparison.baselineByMode.ja === id) delete draft.ui.comparison.baselineByMode.ja;
  });
  playbackView?.preserveNextRender('input-position');
  fillPicker();
  fillDetailOptions();
  render();
}

/** React sidebarが参照する、現在の詳細表示対象をDOMに依存せず解決する。 */
function currentDetailLayoutId(): string | undefined {
  const layouts = activeLayouts();
  const requested = uiState.ui.layouts.detailByMode[currentModeId()];
  return requested && layouts.some((layout) => layout.id === requested)
    ? requested
    : layouts[0]?.id;
}

function refreshAnalyzerControlsCatalog(): void {
  const layoutsByMode = Object.fromEntries(
    (['en', 'ja'] as const).map((mode) => [
      mode,
      layoutsOf(mode).map((layout, slot) => ({
        id: layout.id,
        name: layout.name,
        isRomaji: layout.romajiTable !== undefined,
        isUser: userLayouts.some((definition) => definition.id === layout.id),
        slot,
      })),
    ]),
  ) as Record<ModeId, {
    id: string;
    name: string;
    isRomaji: boolean;
    isUser: boolean;
    slot: number;
  }[]>;

  controlsModel.setCatalog(
    layoutsByMode,
    [
      { value: 'row-staggered', label: 'ロウスタッガード' },
      { value: 'ortholinear', label: 'オーソリニア' },
      { value: 'column-staggered', label: 'カラムスタッガード' },
      ...userGeometryShapes.map((shape) => ({
        value: customGeometryKind(shape.id),
        label: `自作: ${shape.name}`,
      })),
    ],
    `現在: ${uiState.conditions.geometrySettings.shape.name} / ${uiState.conditions.geometrySettings.assignment.name}`,
  );
}

/** 移行中の既存call siteはcatalog refreshへ集約する。 */
function fillPicker(): void {
  refreshAnalyzerControlsCatalog();
}

function fillDetailGeometryOptions(_layoutId: string | undefined): void {
  refreshAnalyzerControlsCatalog();
}

function fillDetailOptions(): void {
  refreshAnalyzerControlsCatalog();
}

function fillGeometryOptions(): void {
  const current = uiState.conditions.defaults.geometry;
  const valid = isPresetGeometryKind(current)
    || (isCustomGeometryKind(current)
      && userGeometryShapes.some((shape) => customGeometryKind(shape.id) === current));
  if (!valid) {
    const fallback: GeometryKind = 'row-staggered';
    updateUiState((draft) => {
      draft.conditions.defaults.geometry = fallback;
      draft.ui.input.geometry = fallback;
      draft.conditions.geometrySettings.shape = clonePhysicalShape(PHYSICAL_SHAPES[fallback]);
    });
  }
  refreshAnalyzerControlsCatalog();
}

function selectedShapeForKind(kind: GeometryKind): PhysicalShape | undefined {
  if (isPresetGeometryKind(kind)) return clonePhysicalShape(geometrySettingsForPreset(kind).shape);
  if (isCustomGeometryKind(kind)) {
    const id = kind.startsWith('custom:') ? kind.slice('custom:'.length) : uiState.conditions.geometrySettings.shape.id;
    const stored = userGeometryShapes.find((shape) => shape.id === id);
    return stored ? clonePhysicalShape(stored) : clonePhysicalShape(uiState.conditions.geometrySettings.shape);
  }
  return undefined;
}

/** 配列行で選ばれた形状だけを差し替え、運指設定は共通の現在値を使う。 */
function geometrySettingsForKind(kind: GeometryKind): GeometrySettings {
  const current = uiState.conditions.geometrySettings;
  return {
    assignment: current.assignment,
    shape: selectedShapeForKind(kind) ?? current.shape,
  };
}

function conditionOverrideEnabled(layoutId: string, state: UiStateV1 = uiState): boolean {
  return Object.prototype.hasOwnProperty.call(state.conditions.perLayout, layoutId);
}

function commitCondition(
  layoutId: string | undefined,
  key: keyof UiStateConditionsDefaults | keyof UiStateLayoutConditions,
  value: unknown,
): void {
  updateUiState((draft) => {
    if (layoutId === undefined) {
      if (key === 'romajiRule') return;
      Object.assign(draft.conditions.defaults, { [key]: structuredClone(value) });
      return;
    }
    if (key === 'playbackRateWindow') return;
    const target = draft.conditions.perLayout[layoutId] ?? {};
    Object.assign(target, { [key]: structuredClone(value) });
    draft.conditions.perLayout[layoutId] = target;
  });
  if (key === 'geometry') {
    fillGeometryOptions();
    fillDetailGeometryOptions(currentDetailLayoutId());
  }
  if (key === 'romajiRule') playbackView?.preserveNextRender('input-position');
  else if (key === 'geometry' || key === 'chain' || key === 'arpeggioPolicy') {
    playbackView?.preserveNextRender('cursor');
  }
  render();
}

function toggleConditionOverride(layoutId: string, enabled: boolean): void {
  updateUiState((draft) => {
    if (enabled) draft.conditions.perLayout[layoutId] ??= {};
    else delete draft.conditions.perLayout[layoutId];
  });
  playbackView?.preserveNextRender('input-position');
  render();
}

function conditionsCatalog() {
  const allLayouts = [...layoutsOf('en'), ...layoutsOf('ja')];
  return {
    layouts: currentMode().layouts,
    allLayouts,
    geometryOptions: [
      { value: 'row-staggered', label: 'ロウスタッガード' },
      { value: 'ortholinear', label: 'オーソリニア' },
      { value: 'column-staggered', label: 'カラムスタッガード' },
      ...userGeometryShapes.map((shape) => ({
        value: customGeometryKind(shape.id),
        label: `自作: ${shape.name}`,
      })),
    ],
    romajiRules: allRomajiRules(romajiSettings.rules).map((rule) => ({
      value: rule.id,
      label: rule.name,
    })),
    romajiRuleIds: Object.fromEntries(
      allLayouts.map((layout) => [layout.id, romajiRuleIdForLayout(layout)]),
    ),
    presets: allConditionPresets(conditionPresets),
    playbackDefaults: uiStateDefaults.ui.playback,
    calibrationAvailable: playbackCalibration !== undefined,
  };
}

const conditionsModel = createAnalyzerConditionsModel(conditionsCatalog());

function refreshConditionsCatalog(): void {
  conditionsModel.setCatalog(conditionsCatalog());
}

const conditionsActions: AnalyzerConditionsActions = {
  commitCondition(layoutId, key, value) {
    commitCondition(
      layoutId,
      key as keyof UiStateConditionsDefaults | keyof UiStateLayoutConditions,
      value,
    );
  },
  toggleOverride: toggleConditionOverride,
  applyPreset(id) {
    const preset = allConditionPresets(conditionPresets)
      .find((candidate) => candidate.id === id);
    if (!preset) return;
    updateUiState((draft) => {
      draft.conditions.defaults = structuredClone(preset.conditions);
    });
    fillGeometryOptions();
    fillDetailGeometryOptions(currentDetailLayoutId());
    render();
  },
  savePreset(name) {
    const preset: ConditionPreset = {
      id: newConditionPresetId(),
      name,
      conditions: structuredClone(uiState.conditions.defaults),
    };
    conditionPresets = [...conditionPresets, preset];
    saveConditionPresets(conditionPresets);
    refreshConditionsCatalog();
  },
  deletePreset(id) {
    if (!id.startsWith('custom-')) return;
    conditionPresets = conditionPresets.filter((preset) => preset.id !== id);
    saveConditionPresets(conditionPresets);
    refreshConditionsCatalog();
  },
  exportBundle() {
    const bundle = conditionBundleFromState(
      uiState,
      userLayouts,
      userGeometryShapes,
      romajiSettings,
      conditionPresets,
    );
    downloadText(
      'keydist-conditions.json',
      serializeConditionBundle(bundle),
      'application/json',
    );
  },
  async importBundle(file) {
    try {
      const fallback = conditionBundleFromState(
        uiState,
        userLayouts,
        userGeometryShapes,
        romajiSettings,
        conditionPresets,
      );
      const bundle = parseConditionBundle(
        await file.text(),
        fallback,
        uiStateDefaults,
        uiStateChoices,
      );
      const builtIds = new Set([...LAYOUTS, ...LAYOUTS_JA].map((layout) => layout.id));
      const mergedLayouts = new Map(userLayouts.map((layout) => [layout.id, layout]));
      for (const layout of bundle.layouts) {
        if (!builtIds.has(layout.id)) mergedLayouts.set(layout.id, layout);
      }
      userLayouts = [...mergedLayouts.values()];
      saveUserLayouts(userLayouts);

      const mergedShapes = new Map(userGeometryShapes.map((shape) => [shape.id, shape]));
      for (const shape of bundle.geometryShapes) mergedShapes.set(shape.id, shape);
      userGeometryShapes = [...mergedShapes.values()];
      saveUserGeometryShapes(userGeometryShapes);

      romajiSettings = bundle.romajiSettings;
      saveRomajiSettings(romajiSettings);
      ROMAJI_TABLE_CACHE.clear();
      layoutEditorModel.setRomajiRules(allRomajiRules(romajiSettings.rules));

      conditionPresets = bundle.presets;
      saveConditionPresets(conditionPresets);
      addLayoutChoices(userLayouts.map((layout) => layout.id));
      updateUiState((draft) => {
        draft.conditions = bundle.conditions;
      });
      fillGeometryOptions();
      fillDetailOptions();
      fillPicker();
      render();
      return '条件と配列を読み込んだ';
    } catch (error) {
      return error instanceof Error ? error.message : '条件ファイルを読み込めない';
    }
  },
  setPlaybackUi(key, value) {
    updateUiState((draft) => {
      Object.assign(draft.ui.playback, { [key]: value });
    });
    render();
  },
  setPlaybackCondition(key, value) {
    if (key === 'playbackRateAverage') {
      if (value !== 'sma' && value !== 'ewma') return;
      updateUiState((draft) => {
        draft.conditions.defaults.playbackRateAverage = value;
      });
    } else if (key === 'playbackRateWindow') {
      if (typeof value !== 'number' || !Number.isInteger(value)) return;
      updateUiState((draft) => {
        draft.conditions.defaults.playbackRateWindow = value;
      });
    } else if (key === 'playbackRateHalfLifeSeconds') {
      if (typeof value !== 'number') return;
      updateUiState((draft) => {
        draft.conditions.defaults.playbackRateHalfLifeSeconds = value;
      });
    } else {
      return;
    }
    playbackView?.update();
  },
};

function openConditionsDialog(): void {
  refreshConditionsCatalog();
  el.conditionsDialog.showModal();
  el.conditionsDialog.scrollTop = 0;
}

let playbackView: PlaybackViewController;
let resultsView: ResultsViewController;

const geometryEditorModel = createAnalyzerGeometryEditorModel({
  stateOwner: uiStateOwner,
  getUserGeometryShapes: () => userGeometryShapes,
  commitUserGeometryShapes: (shapes) => {
    userGeometryShapes = shapes;
    saveUserGeometryShapes(shapes);
  },
  onGeometryChanged: (preservePlaybackCursor) => {
    fillGeometryOptions();
    if (preservePlaybackCursor) playbackView?.preserveNextRender('cursor');
    render();
  },
  setStatus: (status) => controlsModel.setGeometryStatus(status),
  download: (filename, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
});

const playbackSurfaceModel = createAnalyzerPlaybackSurfaceModel();
const playbackSettingsModel = createAnalyzerPlaybackSettingsModel();
const calibrationModel = createAnalyzerCalibrationModel({
  storage: uiStorage,
  getUiState: playbackViewUiState,
  updatePlaybackSetting,
  getPlaybackGeometry: () => playbackView?.getGeometry(),
  getGeometrySettings: () => uiState.conditions.geometrySettings,
  getPlaybackLayout: () => playbackView?.getLayout(),
  getCalibration: () => playbackCalibration,
  setCalibration: (calibration) => {
    playbackCalibration = calibration;
  },
  setPlaybackCalibration: (calibration) => playbackView?.setCalibration(calibration),
});

function currentPlaybackLayoutId(): string | undefined {
  return playbackView?.getLayout()?.id;
}

function currentConditionLayoutId(): string | undefined {
  return currentDetailLayoutId() || currentPlaybackLayoutId();
}

function isPlaybackLayoutOverride(): boolean {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return false;
  return conditionOverrideEnabled(layoutId);
}

function playbackViewUiState(): UiStateV1 {
  const layoutId = currentPlaybackLayoutId();
  const layoutConditions = layoutId ? uiState.conditions.perLayout[layoutId] : undefined;
  const playback = layoutConditions?.playback;
  const chain = layoutConditions?.chain ?? uiState.conditions.defaults.chain;
  const arpeggioPolicy = layoutConditions?.arpeggioPolicy ?? uiState.conditions.defaults.arpeggioPolicy;
  const triggerRealization = layoutConditions?.triggerRealization ?? uiState.conditions.defaults.triggerRealization;
  const actionRealization = layoutConditions?.actionRealization ?? uiState.conditions.defaults.actionRealization;
  return {
    ...uiState,
    ui: {
      ...uiState.ui,
      playback: {
        ...uiState.ui.playback,
        ...playback,
      },
    },
    conditions: {
      ...uiState.conditions,
      defaults: {
        ...uiState.conditions.defaults,
        chain,
        arpeggioPolicy,
        triggerRealization,
        actionRealization,
      },
    },
  };
}

function updatePlaybackSetting<K extends keyof UiPlaybackState>(
  key: K,
  value: UiPlaybackState[K],
): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined
      && conditionOverrideEnabled(layoutId, draft);
    if (hasLayoutOverride && layoutId) {
      const current = draft.conditions.perLayout[layoutId] ?? {};
      draft.conditions.perLayout[layoutId] = {
        ...current,
        playback: { ...current.playback, [key]: value },
      };
    } else {
      draft.ui.playback[key] = value;
    }
  });
}

function updateChainPolicy(policy: ChainPolicy): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined
      && conditionOverrideEnabled(layoutId, draft);
    if (hasLayoutOverride && layoutId) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        chain: structuredClone(policy),
      };
    } else {
      draft.conditions.defaults.chain = structuredClone(policy);
    }
  });
}

function updateArpeggioPolicy(policy: ArpeggioPolicy): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined
      && conditionOverrideEnabled(layoutId, draft);
    if (hasLayoutOverride && layoutId) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        arpeggioPolicy: structuredClone(policy),
      };
    } else {
      draft.conditions.defaults.arpeggioPolicy = structuredClone(policy);
    }
  });
}

function updateTriggerRealizationPolicy(policy: TriggerRealizationPolicy): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined
      && conditionOverrideEnabled(layoutId, draft);
    if (hasLayoutOverride && layoutId) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        triggerRealization: structuredClone(policy),
      };
    } else {
      draft.conditions.defaults.triggerRealization = structuredClone(policy);
    }
  });
}

function updateActionRealizationPolicy(policy: ActionRealizationPolicy): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined
      && conditionOverrideEnabled(layoutId, draft);
    if (hasLayoutOverride && layoutId) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        actionRealization: structuredClone(policy),
      };
    } else {
      draft.conditions.defaults.actionRealization = structuredClone(policy);
    }
  });
}

function setPlaybackLayoutOverride(enabled: boolean): void {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return;
  toggleConditionOverride(layoutId, enabled);
}

playbackView = createPlaybackView({
  el,
  storage: uiStorage,
  getUiState: playbackViewUiState,
  getPlaybackSettings: () => playbackViewUiState().ui.playback,
  updatePlaybackSetting,
  isPlaybackLayoutOverride,
  setPlaybackLayoutOverride,
  updateUiState,
  getCalibration: () => playbackCalibration,
  getChainPolicy: () => playbackViewUiState().conditions.defaults.chain,
  updateChainPolicy,
  getArpeggioPolicy: () => playbackViewUiState().conditions.defaults.arpeggioPolicy,
  updateArpeggioPolicy,
  getTriggerRealizationPolicy: () => playbackViewUiState().conditions.defaults.triggerRealization,
  updateTriggerRealizationPolicy,
  getActionRealizationPolicy: () => playbackViewUiState().conditions.defaults.actionRealization,
  updateActionRealizationPolicy,
  refreshAnalysis: render,
  openCalibration: () => {
    if (calibrationModel.open(false) && !el.calibrationDialog.open) {
      el.calibrationDialog.showModal();
    }
  },
  openCalibrationEdit: () => {
    if (calibrationModel.open(true) && !el.calibrationDialog.open) {
      el.calibrationDialog.showModal();
    }
  },
  surfaceModel: playbackSurfaceModel,
  settingsModel: playbackSettingsModel,
});
let analyzerReactShell: AnalyzerReactShellController | undefined;
const comparisonModel = createAnalyzerComparisonModel();
const metricsModel = createAnalyzerMetricsModel();

resultsView = createResultsView({
  el,
  getText: () => analyzerReactShell?.getText() ?? '',
  getUiState: () => uiState,
  updateUiState,
  currentModeId,
  currentMode,
  getSelectedLayoutIds: selectedLayoutIds,
  romajiRuleIdForLayout,
  getGeometrySettingsForKind: geometrySettingsForKind,
  playback: playbackView,
  comparisonModel,
  bigramFlowModel,
  metricsModel,
  getDetailLayoutId: currentDetailLayoutId,
});

function render(): void {
  refreshConditionsCatalog();
  resultsView.render();
}

function onModeChange() {
  fillPicker();
  fillDetailOptions();
  render();
}

refreshAnalyzerControlsCatalog();

const analyzerReactShellRoot = document.getElementById('analyzer-react-shell');
const analyzerThemeControlsSlot = document.getElementById('analyzer-theme-controls');
const analyzerModeControlSlot = document.getElementById('analyzer-mode-control');
const analyzerTextPanelSlot = document.getElementById('analyzer-text-panel');
const analyzerComparisonControlSlot = document.getElementById('analyzer-comparison-controls');
const analyzerSensitivityPanelSlot = document.getElementById('analyzer-sensitivity-panel');
const analyzerAddPanelSlot = document.getElementById('analyzer-add-panel');
const analyzerGeometryPanelSlot = document.getElementById('analyzer-geometry-panel');
const analyzerBigramFlowSlot = document.getElementById('analyzer-bigram-flow');
const analyzerDialogActionsSlot = document.getElementById('analyzer-dialog-actions');
const analyzerSidebarControlsSlot = document.getElementById('analyzer-sidebar-controls');
if (
  !analyzerReactShellRoot
  || !analyzerThemeControlsSlot
  || !analyzerModeControlSlot
  || !analyzerTextPanelSlot
  || !analyzerComparisonControlSlot
  || !analyzerSensitivityPanelSlot
  || !analyzerAddPanelSlot
  || !analyzerGeometryPanelSlot
  || !analyzerBigramFlowSlot
  || !analyzerDialogActionsSlot
  || !analyzerSidebarControlsSlot
) {
  throw new Error('Analyzer React shell mount point is missing');
}

analyzerReactShell = mountAnalyzerReactShell({
  root: analyzerReactShellRoot,
  themeControlsSlot: analyzerThemeControlsSlot,
  modeSlot: analyzerModeControlSlot,
  textPanelSlot: analyzerTextPanelSlot,
  comparisonSlot: analyzerComparisonControlSlot,
  compareChartSlot: el.compareChart,
  compareTableSlot: el.compare,
  detailConditionsSlot: el.detailConditions,
  fingerChartSlot: el.fingerChart,
  adjacentChartSlot: el.adjacentChart,
  pressMatrixSlot: el.pressMatrix,
  fingerMatrixSlot: el.fingerMatrix,
  adjacentMeanMatrixSlot: el.adjacentMeanMatrix,
  adjacentStdDevMatrixSlot: el.adjacentStdDevMatrix,
  sensitivityPanelSlot: analyzerSensitivityPanelSlot,
  playbackSlot: el.playback,
  playbackSettingsSlot: el.playbackSettingsPanel,
  addPanelSlot: analyzerAddPanelSlot,
  geometryPanelSlot: analyzerGeometryPanelSlot,
  calibrationDialogSlot: el.calibrationDialog,
  geometryDialogSlot: el.geometryDialog,
  romajiDialogSlot: el.romajiDialog,
  bigramFlowSlot: analyzerBigramFlowSlot,
  dialogActionsSlot: analyzerDialogActionsSlot,
  sidebarControlsSlot: analyzerSidebarControlsSlot,
  howDialogSlot: el.howDialog,
  conditionsDialogSlot: el.conditionsDialog,
  stateOwner: uiStateOwner,
  comparisonModel,
  playbackSurfaceModel,
  playbackSettingsModel,
  conditionsModel,
  conditionsActions,
  layoutEditorModel,
  bigramFlowModel,
  metricsModel,
  controlsModel,
  calibrationModel,
  geometryEditorModel,
  romajiDialogModel,
  onModeChange,
  onTextInput: scheduleTextRender,
  onTextCommit: flushTextRender,
  onMetricsChange: render,
  onPlaybackSurfaceCommit: () => playbackView.commitSurface(),
  onPlaybackSettingsCommit: () => playbackView.commitSettings(),
  onAddLayout: addUserLayout,
  onToggleLayout: (layoutId, enabled) => {
    const mode = currentModeId();
    updateUiState((draft) => {
      updateSelectedLayouts(draft, mode, (selected) => {
        if (enabled) selected.add(layoutId);
        else selected.delete(layoutId);
      });
    });
    playbackView.preserveNextRender('input-position');
    render();
  },
  onRemoveLayout: removeUserLayout,
  onDetailLayoutChange: (layoutId) => {
    updateUiState((draft) => {
      draft.ui.layouts.detailByMode[currentModeId()] = layoutId;
    });
    playbackView.preserveNextRender('input-position');
    render();
  },
  onDetailGeometryChange: (layoutId, geometry) => {
    updateUiState((draft) => {
      setLayoutGeometryOverride(
        draft.conditions.perLayout,
        layoutId,
        geometry,
        draft.conditions.defaults.geometry,
      );
    });
    playbackView.preserveNextRender('cursor');
    render();
  },
  onWindowSizeChange: (windowSize) => {
    const layoutId = currentConditionLayoutId();
    const useLayoutOverride = layoutId !== undefined && conditionOverrideEnabled(layoutId);
    updateUiState((draft) => {
      const conditions = layoutId ? draft.conditions.perLayout[layoutId] : undefined;
      if (layoutId && useLayoutOverride) {
        draft.conditions.perLayout[layoutId] = { ...conditions, windowSize };
      } else {
        draft.conditions.defaults.windowSize = windowSize;
      }
    });
    render();
  },
  onSfbHomeChange: (sfbHomeCost) => {
    const layoutId = currentConditionLayoutId();
    const useLayoutOverride = layoutId !== undefined && conditionOverrideEnabled(layoutId);
    updateUiState((draft) => {
      if (layoutId && useLayoutOverride) {
        draft.conditions.perLayout[layoutId] = {
          ...draft.conditions.perLayout[layoutId],
          sfbHomeCost,
        };
      } else {
        draft.conditions.defaults.sfbHomeCost = sfbHomeCost;
      }
    });
    render();
  },
  onPreferOppositeThumbChange: (preferOppositeThumb) => {
    const layoutId = currentConditionLayoutId();
    const useLayoutOverride = layoutId !== undefined && conditionOverrideEnabled(layoutId);
    updateUiState((draft) => {
      if (layoutId && useLayoutOverride) {
        draft.conditions.perLayout[layoutId] = {
          ...draft.conditions.perLayout[layoutId],
          preferOppositeThumb,
        };
      } else {
        draft.conditions.defaults.preferOppositeThumb = preferOppositeThumb;
      }
    });
    render();
  },
  onDefaultGeometryChange: (geometry) => {
    const layoutId = currentConditionLayoutId();
    const useLayoutOverride = layoutId !== undefined && conditionOverrideEnabled(layoutId);
    if (layoutId && useLayoutOverride) {
      updateUiState((draft) => {
        draft.conditions.perLayout[layoutId] = {
          ...draft.conditions.perLayout[layoutId],
          geometry,
        };
      });
      playbackView.preserveNextRender('cursor');
      render();
      return;
    }
    const shape = selectedShapeForKind(geometry);
    if (!shape) return;
    updateUiState((draft) => {
      draft.ui.input.geometry = geometry;
      draft.conditions.defaults.geometry = geometry;
      draft.conditions.geometrySettings.shape = shape;
    });
    fillGeometryOptions();
    playbackView.preserveNextRender('cursor');
    render();
  },
  onGeometryEdit: () => {
    geometryEditorModel.refresh();
    el.geometryDialog.showModal();
  },
  onGeometryExport: () => geometryEditorModel.exportSettings(),
  onGeometryImport: async (file) => {
    await geometryEditorModel.importSettings(file);
  },
  onOpenHow: () => el.howDialog.showModal(),
  onOpenConditions: openConditionsDialog,
  onOpenRomaji: () => {
    romajiDialogModel.refresh();
    el.romajiDialog.showModal();
  },
  onSensitivityToggle: () => render(),
  onThemeApplied: render,
});

playbackView.setup();
resultsView.setup();
const TEXT_RENDER_DEBOUNCE_MS = 250;
let textRenderTimer: number | undefined;

function scheduleTextRender(): void {
  if (textRenderTimer !== undefined) window.clearTimeout(textRenderTimer);
  textRenderTimer = window.setTimeout(() => {
    textRenderTimer = undefined;
    render();
  }, TEXT_RENDER_DEBOUNCE_MS);
}

function flushTextRender(): void {
  if (textRenderTimer !== undefined) window.clearTimeout(textRenderTimer);
  textRenderTimer = undefined;
  render();
}

bindTips(document.body);
// 補足ボタン: summaryの中に置くとdetailsが開閉してしまうので握りつぶす。
// キーボードでも読めるようfocusでも出す
document.body.addEventListener('click', (e) => {
  const info = (e.target as Element).closest('.info');
  if (info) e.preventDefault();
});
document.body.addEventListener('focusin', (e) => {
  const info = (e.target as Element).closest('.info');
  if (!info) return;
  const box = info.getBoundingClientRect();
  showTip(
    info.getAttribute('data-tip')!,
    { clientX: box.right, clientY: box.bottom + 24 } as MouseEvent,
    true,
  );
});
document.body.addEventListener('focusout', (e) => {
  if ((e.target as Element).closest('.info')) hideTip();
});

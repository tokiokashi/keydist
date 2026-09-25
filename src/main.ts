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
  DEFAULT_CONDITION_DEFAULTS,
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
import { createAnalyzerConditionsSurfaceModel } from './analyzer-conditions-surface-model.ts';
import { createAnalyzerLayoutEditorModel } from './analyzer-layout-editor-model.ts';
import { createAnalyzerBigramFlowModel } from './analyzer-bigram-flow-model.ts';
import { createAnalyzerControlsModel } from './analyzer-controls-model.ts';
import { createAnalyzerGeometryEditorModel } from './analyzer-geometry-editor-model.ts';
import { describeConditions, describePlaybackConditions } from './condition-description.ts';
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
  sameConditionDefaults,
  type ConditionPreset,
} from './condition-presets.ts';
import { setLayoutGeometryOverride } from './condition-resolution.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import {
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  type ActionRealizationPolicy,
  type TriggerActivationClass,
  type TriggerActivationGrouping,
  type TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import {
  sameModifierGroupSelector,
  samePhysicalTriggerSelector,
  triggerActivationGroups,
  triggerActivationLogicalGroups,
  TRIGGER_ACTIVATION_CLASS_LABELS,
} from './trigger-activation-groups.ts';
import {
  conditionBundleFromState,
  parseConditionBundle,
  serializeConditionBundle,
} from './condition-bundle.ts';

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

const conditionsSurfaceModel = createAnalyzerConditionsSurfaceModel();

type ConditionTab = 'romaji' | 'physical' | 'model' | 'trigger' | 'chain' | 'arpeggio' | 'delay';

const CONDITION_TABS: readonly [ConditionTab, string][] = [
  ['romaji', 'ローマ字'],
  ['physical', '物理形状'],
  ['model', 'モデル'],
  ['trigger', 'Trigger'],
  ['chain', 'Chain'],
  ['arpeggio', 'Arpeggio'],
  ['delay', '再生'],
];

let conditionTab: ConditionTab = 'model';
const conditionDetailsOpen = new Map<string, boolean>();

function bindConditionDetails(
  details: HTMLDetailsElement,
  key: string,
  defaultOpen = false,
): void {
  details.dataset.conditionDetailsKey = key;
  details.open = conditionDetailsOpen.get(key) ?? defaultOpen;
  details.addEventListener('toggle', () => {
    conditionDetailsOpen.set(key, details.open);
  });
}

function currentConditionPresetId(): string {
  return allConditionPresets(conditionPresets).find((preset) =>
    sameConditionDefaults(preset.conditions, uiState.conditions.defaults))?.id ?? '';
}

function conditionOverrideEnabled(layoutId: string, state: UiStateV1 = uiState): boolean {
  return Object.prototype.hasOwnProperty.call(state.conditions.perLayout, layoutId);
}

function commitCondition<K extends keyof UiStateConditionsDefaults>(
  layoutId: string | undefined,
  key: K,
  value: UiStateConditionsDefaults[K],
): void;
function commitCondition(
  layoutId: string,
  key: 'romajiRule',
  value: string,
): void;
function commitCondition(
  layoutId: string | undefined,
  key: keyof UiStateConditionsDefaults | keyof UiStateLayoutConditions,
  value: UiStateConditionsDefaults[keyof UiStateConditionsDefaults]
    | UiStateLayoutConditions[keyof UiStateLayoutConditions],
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
  renderConditionDescription();
  render();
}

function toggleConditionOverride(layoutId: string, enabled: boolean): void {
  updateUiState((draft) => {
    if (enabled) draft.conditions.perLayout[layoutId] ??= {};
    else delete draft.conditions.perLayout[layoutId];
  });
    playbackView?.preserveNextRender('input-position');
  renderConditionDescription();
  render();
}

function geometryOptions(select: HTMLSelectElement): void {
  select.replaceChildren(
    new Option('ロウスタッガード', 'row-staggered'),
    new Option('オーソリニア', 'ortholinear'),
    new Option('カラムスタッガード', 'column-staggered'),
    ...userGeometryShapes.map((shape) => new Option(`自作: ${shape.name}`, customGeometryKind(shape.id))),
  );
}

function conditionNumber(
  parent: HTMLElement,
  value: number,
  disabled: boolean,
  onCommit: (value: number) => void,
  options: { min: string; max: string; step: string },
): void {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = options.min;
  input.max = options.max;
  input.step = options.step;
  input.disabled = disabled;
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next) && next >= Number(options.min) && next <= Number(options.max)) onCommit(next);
  });
  parent.append(input);
}


function groupingSelect(
  current: TriggerActivationGrouping | undefined,
  semanticDefault: TriggerActivationGrouping,
  disabled: boolean,
  onChange: (value: TriggerActivationGrouping | undefined) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.disabled = disabled;
  select.append(
    new Option(
      `既定（${semanticDefault === 'separate' ? '独立action' : 'outputと同じaction'}）`,
      'inherit',
    ),
    new Option('outputと同じaction', 'combined'),
    new Option('独立action', 'separate'),
  );
  select.value = current ?? 'inherit';
  select.addEventListener('change', () =>
    onChange(select.value === 'combined' || select.value === 'separate'
      ? select.value
      : undefined));
  return select;
}

function conditionRow(
  tab: ConditionTab,
  layout: Layout | undefined,
): HTMLTableRowElement {
  const row = document.createElement('tr');
  const heading = document.createElement('th');
  heading.scope = 'row';
  heading.textContent = layout?.name ?? '既定値（全配列）';
  row.append(heading);

  const overrideCell = document.createElement('td');
  if (layout) {
    const enabled = conditionOverrideEnabled(layout.id);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.title = `${layout.name}だけ個別設定する`;
    checkbox.setAttribute('aria-label', `${layout.name}を個別設定する`);
    checkbox.addEventListener('change', () => toggleConditionOverride(layout.id, checkbox.checked));
    overrideCell.append(checkbox);
  } else {
    overrideCell.textContent = '全体';
  }
  row.append(overrideCell);
  const cell = document.createElement('td');
  row.append(cell);

  const override = layout ? uiState.conditions.perLayout[layout.id] : undefined;
  const enabled = layout === undefined || conditionOverrideEnabled(layout.id);
  const defaults = uiState.conditions.defaults;
  const value = <K extends keyof typeof defaults>(key: K): typeof defaults[K] => {
    if (key === 'playbackRateWindow') return defaults[key];
    const layoutValue = override?.[key as keyof UiStateLayoutConditions];
    return (layoutValue ?? defaults[key]) as typeof defaults[K];
  };

  if (tab === 'romaji') {
    if (layout && !layout.romajiTable) {
      cell.textContent = 'かな入力の設定は不要';
      return row;
    }
    if (!layout) {
      cell.textContent = '各かな配列の既定値を使用';
      return row;
    }
    const select = document.createElement('select');
    for (const rule of allRomajiRules(romajiSettings.rules)) select.append(new Option(rule.name, rule.id));
    const current = override?.romajiRule ?? romajiRuleIdForLayout(layout) ?? defaultRomajiRuleId(layout.id);
    select.value = current;
    select.disabled = !enabled;
    select.addEventListener('change', () => commitCondition(layout.id, 'romajiRule', select.value));
    cell.append(select);
    return row;
  }

  if (tab === 'physical') {
    const select = document.createElement('select');
    geometryOptions(select);
    select.value = value('geometry');
    select.disabled = !enabled;
    select.addEventListener('change', () => commitCondition(layout?.id, 'geometry', select.value as GeometryKind));
    cell.append(select);
    return row;
  }

  if (tab === 'model') {
    const fields = document.createElement('div');
    fields.className = 'condition-fields';
    const windowLabel = document.createElement('label');
    windowLabel.append('先読みN ');
    conditionNumber(windowLabel, value('windowSize'), !enabled, (next) => commitCondition(layout?.id, 'windowSize', next), {
      min: '0', max: '12', step: '1',
    });
    const sfbLabel = document.createElement('label');
    const sfb = document.createElement('input');
    sfb.type = 'checkbox'; sfb.checked = value('sfbHomeCost'); sfb.disabled = !enabled;
    sfbLabel.append(sfb, ' SFBホーム');
    sfb.addEventListener('change', () => commitCondition(layout?.id, 'sfbHomeCost', sfb.checked));
    const thumbLabel = document.createElement('label');
    const thumb = document.createElement('input');
    thumb.type = 'checkbox'; thumb.checked = value('preferOppositeThumb'); thumb.disabled = !enabled;
    thumbLabel.append(thumb, ' 逆側親指');
    thumb.addEventListener('change', () => commitCondition(layout?.id, 'preferOppositeThumb', thumb.checked));
    fields.append(windowLabel, sfbLabel, thumbLabel);
    cell.append(fields);
    return row;
  }

  if (tab === 'trigger') {
    const detailsScope = layout?.id ?? 'defaults';
    const realization = value('triggerRealization');
    const action = value('actionRealization');
    const fields = document.createElement('div');
    fields.className = 'condition-fields condition-trigger-fields';

    const holdLabel = document.createElement('label');
    const holdInput = document.createElement('input');
    holdInput.type = 'checkbox';
    holdInput.checked = realization.useHold;
    holdInput.disabled = !enabled;
    holdInput.addEventListener('change', () =>
      commitCondition(layout?.id, 'triggerRealization', { ...realization, useHold: holdInput.checked }));
    holdLabel.append(holdInput, ' hold-capable triggerを連続保持する');

    const actionLabel = document.createElement('label');
    const actionInput = document.createElement('input');
    actionInput.type = 'checkbox';
    actionInput.checked = action.triggerActivation === 'semantic';
    actionInput.disabled = !enabled;
    actionInput.addEventListener('change', () =>
      commitCondition(layout?.id, 'actionRealization', {
        ...action,
        triggerActivation: actionInput.checked ? 'semantic' : 'disabled',
      }));
    actionLabel.append(actionInput, ' trigger押下の独立action化を有効にする');

    fields.append(holdLabel, actionLabel);

    const actionTargetHeading = document.createElement('div');
    actionTargetHeading.className = 'condition-trigger-subheading';
    actionTargetHeading.textContent = '独立action化する対象';
    fields.append(actionTargetHeading);

    const relevantClasses: TriggerActivationClass[] = layout
      ? [...new Set(triggerActivationGroups(layout).map((group) => group.activationClass))]
      : ['prepress-required', 'order-free'];
    for (const activationClass of relevantClasses) {
      if (activationClass === 'postpress-required') continue;
      const row = document.createElement('label');
      row.append(`${TRIGGER_ACTIVATION_CLASS_LABELS[activationClass]} `);
      const current = action.triggerActivationClassOverrides?.[activationClass];
      row.append(groupingSelect(
        current,
        DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[activationClass],
        !enabled || action.triggerActivation !== 'semantic',
        (grouping) => {
          const next = { ...(action.triggerActivationClassOverrides ?? {}) };
          if (grouping === undefined) delete next[activationClass];
          else next[activationClass] = grouping;
          commitCondition(layout?.id, 'actionRealization', {
            ...action,
            triggerActivationClassOverrides: next,
          });
        },
      ));
      fields.append(row);
    }

    if (layout) {
      const logicalGroups = triggerActivationLogicalGroups(layout)
        .filter((group) => !group.activationClasses.includes('postpress-required'));
      if (logicalGroups.length > 0) {
        const details = document.createElement('details');
        bindConditionDetails(details, `${detailsScope}:trigger-individual`);
        const summary = document.createElement('summary');
        summary.textContent = '個別設定';
        details.append(summary);

        const logicalFields = document.createElement('div');
        logicalFields.className = 'condition-fields condition-trigger-fields';
        for (const logical of logicalGroups) {
          const label = document.createElement('label');
          label.append(`${logical.label} `);
          const existing = action.triggerActivationOverrides?.find((override) =>
            sameModifierGroupSelector(override.selector, logical.modifierGroupIds));
          const semanticDefaults = logical.activationClasses.map((kind) =>
            action.triggerActivationClassOverrides?.[kind]
              ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[kind]);
          const semanticDefault = semanticDefaults.every((value) => value === 'separate')
            ? 'separate'
            : 'combined';
          label.append(groupingSelect(
            existing?.grouping,
            semanticDefault,
            !enabled || action.triggerActivation !== 'semantic',
            (grouping) => {
              const overrides = (action.triggerActivationOverrides ?? [])
                .filter((override) =>
                  !sameModifierGroupSelector(override.selector, logical.modifierGroupIds));
              if (grouping !== undefined) {
                overrides.push({
                  selector: { modifierGroupIds: logical.modifierGroupIds },
                  grouping,
                });
              }
              commitCondition(layout.id, 'actionRealization', {
                ...action,
                triggerActivationOverrides: overrides,
              });
            },
          ));
          logicalFields.append(label);
        }

        const physicalDetails = document.createElement('details');
        bindConditionDetails(physicalDetails, `${detailsScope}:trigger-physical`);
        const physicalSummary = document.createElement('summary');
        physicalSummary.textContent = '物理trigger単位の詳細';
        physicalDetails.append(physicalSummary);
        const physicalFields = document.createElement('div');
        physicalFields.className = 'condition-fields condition-trigger-fields';
        for (const group of triggerActivationGroups(layout)) {
          if (group.activationClass === 'postpress-required') continue;
          const label = document.createElement('label');
          label.append(`${group.label} `);
          const existing = action.triggerActivationOverrides?.find((override) =>
            samePhysicalTriggerSelector(override.selector, group));
          const logicalOverride = action.triggerActivationOverrides?.find((override) =>
            sameModifierGroupSelector(override.selector, group.modifierGroupIds));
          const semanticDefault = logicalOverride?.grouping
            ?? action.triggerActivationClassOverrides?.[group.activationClass]
            ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[group.activationClass];
          label.append(groupingSelect(
            existing?.grouping,
            semanticDefault,
            !enabled || action.triggerActivation !== 'semantic',
            (grouping) => {
              const overrides = (action.triggerActivationOverrides ?? [])
                .filter((override) => !samePhysicalTriggerSelector(override.selector, group));
              if (grouping !== undefined) {
                overrides.push({
                  selector: {
                    ...(group.modifierGroupIds.length === 0
                      ? {}
                      : { modifierGroupIds: group.modifierGroupIds }),
                    triggerKeys: group.triggerKeys,
                  },
                  grouping,
                });
              }
              commitCondition(layout.id, 'actionRealization', {
                ...action,
                triggerActivationOverrides: overrides,
              });
            },
          ));
          physicalFields.append(label);
        }
        physicalDetails.append(physicalFields);
        logicalFields.append(physicalDetails);
        details.append(logicalFields);
        fields.append(details);
      }
    }

    cell.append(fields);
    return row;
  }

  if (tab === 'chain') {
    const policy = value('chain');
    const fields = document.createElement('div');
    fields.className = 'condition-fields condition-chain-fields';
    const checkbox = (key: keyof ChainPolicy, labelText: string): HTMLLabelElement => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = policy[key];
      input.disabled = !enabled;
      input.addEventListener('change', () =>
        commitCondition(layout?.id, 'chain', { ...policy, [key]: input.checked }));
      label.append(input, ` ${labelText}`);
      return label;
    };
    fields.append(
      checkbox('breakOnSameFinger', '非親指SFB Strokeで区切る'),
      checkbox('breakOnTriggerOnly', 'trigger-only Strokeで区切る'),
      checkbox('breakOnThumbOnly', '親指only Strokeで区切る'),
      checkbox('breakOnOppositeHandSimultaneous', '逆手同時outputで区切る'),
    );
    cell.append(fields);
    return row;
  }

  if (tab === 'arpeggio') {
    const policy = value('arpeggioPolicy');
    const fields = document.createElement('div');
    fields.className = 'condition-fields condition-arpeggio-fields';
    const checkbox = (key: keyof ArpeggioPolicy, labelText: string): HTMLLabelElement => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = policy[key];
      input.disabled = !enabled;
      input.addEventListener('change', () =>
        commitCondition(layout?.id, 'arpeggioPolicy', { ...policy, [key]: input.checked }));
      label.append(input, ` ${labelText}`);
      return label;
    };
    fields.append(
      checkbox('includeThumb', 'output親指をcoreに含める'),
      checkbox('bridgeSameFinger', 'same Transitionを中立bridgeにする'),
      checkbox('includeSingleRedirectTail', '末尾直後の逆方向1 Transitionを含める'),
    );
    cell.append(fields);
    return row;
  }

  cell.textContent = 'この項目は全体設定です。配列ごとの上書きはできません。';
  return row;
}

function renderConditionTable(tab: ConditionTab): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'condition-grid';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['配列', '個別設定', tab === 'romaji' ? '設定値' : '条件']) {
    const th = document.createElement('th'); th.textContent = label; headerRow.append(th);
  }
  head.append(headerRow); table.append(head);
  const body = document.createElement('tbody');
  body.append(conditionRow(tab, undefined));
  for (const layout of currentMode().layouts) body.append(conditionRow(tab, layout));
  table.append(body);
  return table;
}

function renderGlobalDelayControls(parent: HTMLElement): void {
  const playback = uiState.ui.playback;
  const fields = document.createElement('div'); fields.className = 'condition-delay-fields';
  const speed = document.createElement('label'); speed.append('基準速度 ');
  conditionNumber(speed, playback.stepsPerSecond, false, (value) => {
    updateUiState((draft) => { draft.ui.playback.stepsPerSecond = value; }); renderConditionDescription(); render();
  }, { min: '0.1', max: '20', step: 'any' }); speed.append(' ステップ/秒');
  const multiplier = document.createElement('label'); multiplier.append('再生倍率 ');
  conditionNumber(multiplier, playback.speedMultiplier, false, (value) => {
    updateUiState((draft) => { draft.ui.playback.speedMultiplier = value; }); renderConditionDescription(); render();
  }, { min: '0.1', max: '8', step: '0.1' }); multiplier.append(' 倍');
  const rateAverage = document.createElement('label'); rateAverage.append('速度平均 ');
  const rateAverageSelect = document.createElement('select');
  rateAverageSelect.append(new Option('SMA（単純移動平均）', 'sma'), new Option('EWMA（指数移動平均）', 'ewma'));
  rateAverageSelect.value = uiState.conditions.defaults.playbackRateAverage;
  rateAverageSelect.addEventListener('change', () => {
    const average = rateAverageSelect.value;
    if (average !== 'sma' && average !== 'ewma') return;
    updateUiState((draft) => { draft.conditions.defaults.playbackRateAverage = average; });
    renderConditionDescription(); playbackView?.update();
  });
  rateAverage.append(rateAverageSelect);
  const rateWindow = document.createElement('label'); rateWindow.append('SMA窓幅 ');
  conditionNumber(rateWindow, uiState.conditions.defaults.playbackRateWindow, false, (value) => {
    if (!Number.isInteger(value)) return;
    updateUiState((draft) => { draft.conditions.defaults.playbackRateWindow = value; }); renderConditionDescription(); playbackView?.update();
  }, { min: '1', max: '50', step: '1' }); rateWindow.append(' 打鍵');
  const rateHalfLife = document.createElement('label'); rateHalfLife.append('EWMA半減期 ');
  conditionNumber(rateHalfLife, uiState.conditions.defaults.playbackRateHalfLifeSeconds, false, (value) => {
    updateUiState((draft) => { draft.conditions.defaults.playbackRateHalfLifeSeconds = value; }); renderConditionDescription(); playbackView?.update();
  }, { min: '0.1', max: '10', step: '0.1' }); rateHalfLife.append(' 秒');
  const sameFinger = document.createElement('label'); const sameFingerInput = document.createElement('input');
  sameFingerInput.type = 'checkbox'; sameFingerInput.checked = playback.sameFingerDelay;
  sameFingerInput.addEventListener('change', () => {
    updateUiState((draft) => { draft.ui.playback.sameFingerDelay = sameFingerInput.checked; }); renderConditionDescription(); render();
  }); sameFinger.append(sameFingerInput, ' 指の移動速度を考慮');
  const allFinger = document.createElement('label'); const allFingerInput = document.createElement('input');
  allFingerInput.type = 'checkbox'; allFingerInput.checked = playback.allFingerMovementDelay;
  allFingerInput.addEventListener('change', () => {
    updateUiState((draft) => { draft.ui.playback.allFingerMovementDelay = allFingerInput.checked; }); renderConditionDescription(); render();
  }); allFinger.append(allFingerInput, ' 全指の移動時間で律速');
  const calibration = document.createElement('label'); const calibrationInput = document.createElement('input');
  calibrationInput.type = 'checkbox'; calibrationInput.checked = playback.useCalibration; calibrationInput.disabled = !playbackCalibration;
  calibrationInput.addEventListener('change', () => {
    updateUiState((draft) => { draft.ui.playback.useCalibration = calibrationInput.checked; }); renderConditionDescription(); render();
  }); calibration.append(calibrationInput, ' 個人速度を使う');
  fields.append(speed, multiplier, rateAverage, rateWindow, rateHalfLife, sameFinger, allFinger, calibration);
  parent.append(fields);
}

function appendConditionSummary(parent: DocumentFragment | HTMLElement): void {
  const summary = document.createElement('details'); summary.className = 'condition-summary';
  const title = document.createElement('summary'); title.textContent = '現在値と既定値の差分を見る'; summary.append(title);
  const layoutNames = Object.fromEntries(
    [...layoutsOf('en'), ...layoutsOf('ja')].map((layout) => [layout.id, layout.name]),
  );
  const description = describeConditions({
    defaults: DEFAULT_CONDITION_DEFAULTS,
    current: uiState.conditions.defaults,
    perLayout: uiState.conditions.perLayout,
    layoutNames,
  });
  const playbackDescription = describePlaybackConditions({
    defaults: uiStateDefaults.ui.playback,
    current: uiState.ui.playback,
  });
  const addList = (headingText: string, conditions: readonly { label: string; value: string; defaultValue: string; differsFromDefault: boolean; effect: string }[]) => {
    const heading = document.createElement('h3'); heading.textContent = headingText;
    const list = document.createElement('dl'); list.className = 'condition-list';
    for (const condition of conditions) {
      const term = document.createElement('dt'); term.textContent = condition.label;
      const detail = document.createElement('dd');
      const value = document.createElement('strong'); value.textContent = `現在: ${condition.value}`;
      const difference = document.createElement('span');
      difference.className = condition.differsFromDefault ? 'condition-changed' : 'condition-default';
      difference.textContent = condition.differsFromDefault ? `（既定: ${condition.defaultValue}）` : '（既定どおり）';
      const effect = document.createElement('p'); effect.textContent = condition.effect;
      detail.append(value, ' ', difference, effect); list.append(term, detail);
    }
    summary.append(heading, list);
  };
  addList('解析・集計条件', description.conditions);
  addList('打鍵再生条件', playbackDescription);
  const overrides = document.createElement('p');
  overrides.className = 'note';
  overrides.textContent = description.overrides.length === 0
    ? '配列ごとの上書きはありません。'
    : `配列ごとの上書き: ${description.overrides.map((item) => item.layoutName).join('、')}`;
  summary.append(overrides); parent.append(summary);
}

function renderConditionDescription(
  selectedPresetId?: string,
  preserveScroll = true,
): void {
  const dialogScrollTop = preserveScroll && el.conditionsDialog.open
    ? el.conditionsDialog.scrollTop
    : undefined;
  const previousTableWrap = preserveScroll
    ? el.conditionsDialog.querySelector<HTMLElement>(
      '[data-react-feature="conditions"] .condition-table-wrap',
    )
    : null;
  const tableScroll = previousTableWrap === null
    ? undefined
    : {
      top: previousTableWrap.scrollTop,
      left: previousTableWrap.scrollLeft,
    };

  const root = document.createDocumentFragment();
  const toolbar = document.createElement('div'); toolbar.className = 'condition-toolbar';
  const presetLabel = document.createElement('label'); presetLabel.append('プリセット ');
  const presetSelect = document.createElement('select');
  presetSelect.append(new Option('選ばない', ''));
  for (const preset of allConditionPresets(conditionPresets)) presetSelect.append(new Option(preset.name, preset.id));
  presetSelect.value = selectedPresetId ?? currentConditionPresetId();
  presetSelect.addEventListener('change', () => {
    const preset = allConditionPresets(conditionPresets).find((candidate) => candidate.id === presetSelect.value);
    if (!preset) return;
    updateUiState((draft) => { draft.conditions.defaults = structuredClone(preset.conditions); });
    fillGeometryOptions(); fillDetailGeometryOptions(currentDetailLayoutId());
    renderConditionDescription(preset.id); render();
  }); presetLabel.append(presetSelect);
  const savePreset = document.createElement('button'); savePreset.type = 'button'; savePreset.className = 'secondary'; savePreset.textContent = '現在値を保存';
  savePreset.addEventListener('click', () => {
    const name = window.prompt('プリセット名');
    if (!name?.trim()) return;
    const preset: ConditionPreset = { id: newConditionPresetId(), name: name.trim(), conditions: structuredClone(uiState.conditions.defaults) };
    conditionPresets = [...conditionPresets, preset]; saveConditionPresets(conditionPresets); renderConditionDescription(preset.id);
  });
  const deletePreset = document.createElement('button'); deletePreset.type = 'button'; deletePreset.className = 'ghost'; deletePreset.textContent = '保存したプリセットを削除';
  deletePreset.addEventListener('click', () => {
    const id = presetSelect.value;
    if (!id.startsWith('custom-')) return;
    conditionPresets = conditionPresets.filter((preset) => preset.id !== id); saveConditionPresets(conditionPresets); renderConditionDescription();
  });
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'secondary'; exportButton.textContent = '条件と配列を書き出す';
  exportButton.addEventListener('click', () => {
    const bundle = conditionBundleFromState(uiState, userLayouts, userGeometryShapes, romajiSettings, conditionPresets);
    const url = URL.createObjectURL(new Blob([serializeConditionBundle(bundle)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'keydist-conditions.json'; anchor.click(); URL.revokeObjectURL(url);
  });
  const importLabel = document.createElement('label'); importLabel.className = 'secondary file-button'; importLabel.textContent = '条件と配列を読み込む';
  const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = 'application/json,.json'; importLabel.append(importInput);
  const status = document.createElement('span'); status.className = 'note condition-import-status';
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]; if (!file) return;
    try {
      const fallback = conditionBundleFromState(uiState, userLayouts, userGeometryShapes, romajiSettings, conditionPresets);
      const bundle = parseConditionBundle(await file.text(), fallback, uiStateDefaults, uiStateChoices);
      const builtIds = new Set([...LAYOUTS, ...LAYOUTS_JA].map((layout) => layout.id));
      const mergedLayouts = new Map(userLayouts.map((layout) => [layout.id, layout]));
      for (const layout of bundle.layouts) if (!builtIds.has(layout.id)) mergedLayouts.set(layout.id, layout);
      userLayouts = [...mergedLayouts.values()]; saveUserLayouts(userLayouts);
      const mergedShapes = new Map(userGeometryShapes.map((shape) => [shape.id, shape]));
      for (const shape of bundle.geometryShapes) mergedShapes.set(shape.id, shape);
      userGeometryShapes = [...mergedShapes.values()]; saveUserGeometryShapes(userGeometryShapes);
      romajiSettings = bundle.romajiSettings; saveRomajiSettings(romajiSettings); ROMAJI_TABLE_CACHE.clear();
      layoutEditorModel.setRomajiRules(allRomajiRules(romajiSettings.rules));
      conditionPresets = bundle.presets; saveConditionPresets(conditionPresets);
      addLayoutChoices(userLayouts.map((layout) => layout.id));
      updateUiState((draft) => { draft.conditions = bundle.conditions; });
      fillGeometryOptions(); fillDetailOptions();
      fillPicker(); renderConditionDescription(); render();
      status.textContent = '条件と配列を読み込んだ';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '条件ファイルを読み込めない';
    } finally { importInput.value = ''; }
  });
  toolbar.append(presetLabel, savePreset, deletePreset, exportButton, importLabel, status);
  root.append(toolbar);
  const note = document.createElement('p'); note.className = 'note'; note.textContent = '行は配列、列は条件です。個別設定をオフにすると既定値を使い、選択した項目だけ既定値から差し替えます。プリセットは全体の既定値だけを置き換え、配列ごとの個別設定は保持します。'; root.append(note);
  const tabs = document.createElement('div'); tabs.className = 'condition-tabs'; tabs.setAttribute('role', 'tablist');
  for (const [id, labelText] of CONDITION_TABS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.textContent = labelText;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(conditionTab === id));
    button.addEventListener('click', () => {
      conditionTab = id;
      renderConditionDescription(undefined, false);
      el.conditionsDialog.scrollTop = 0;
    }); tabs.append(button);
  }
  root.append(tabs);
  if (conditionTab === 'delay') {
    const global = document.createElement('section'); global.className = 'condition-global';
    const heading = document.createElement('h3'); heading.textContent = '全体の再生設定'; global.append(heading);
    renderGlobalDelayControls(global);
    const note = document.createElement('p'); note.className = 'note'; note.textContent = '再生速度と個人速度は構造解析条件とは分離して扱います。'; global.append(note); root.append(global);
  } else {
    const tableWrap = document.createElement('div'); tableWrap.className = 'scroll-x condition-table-wrap'; tableWrap.append(renderConditionTable(conditionTab)); root.append(tableWrap);
  }
  appendConditionSummary(root);
  conditionsSurfaceModel.setContent(root, {
    dialogScrollTop,
    tableScroll,
  });
}

function openConditionsDialog(): void {
  renderConditionDescription(undefined, false);
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
  getDetailLayoutId: currentDetailLayoutId,
});

function render(): void {
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
  conditionsSurfaceModel,
  layoutEditorModel,
  bigramFlowModel,
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
  onConditionsSurfaceCommit: (snapshot, root) => {
    if (snapshot.dialogScrollTop !== undefined) {
      el.conditionsDialog.scrollTop = snapshot.dialogScrollTop;
    }
    if (snapshot.tableScroll !== undefined) {
      const tableWrap = root.querySelector<HTMLElement>('.condition-table-wrap');
      if (tableWrap) {
        tableWrap.scrollTop = snapshot.tableScroll.top;
        tableWrap.scrollLeft = snapshot.tableScroll.left;
      }
    }
  },
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

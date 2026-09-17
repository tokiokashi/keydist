import {
  buildGeometry,
  customGeometryKind,
  FINGERS,
  HOME_ROW,
  isCustomGeometryKind,
  isPresetGeometryKind,
  keyId,
  PHYSICAL_SHAPES,
  QWERTY_LEGEND,
  type Finger,
  type GeometryKind,
  type NonThumb,
  type PhysicalShape,
} from './geometry.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from './layouts/index.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from './sample-text-ja.ts';
import { bindTips, hideTip, showTip } from './chart.ts';
import { setupTheme } from './theme.ts';
import { gapFigure } from './gap-figure.ts';
import {
  ROW_LABELS,
  load as loadUserLayouts,
  newId as newLayoutId,
  save as saveUserLayouts,
  toLayout,
  validate,
  type RomajiRuleId,
  type UserLayout,
} from './user-layouts.ts';
import {
  defaultRomajiRuleId,
  loadRomajiSettings,
  tableForRule,
} from './romaji/rules.ts';
import { loadPlaybackCalibration } from './playback-calibration.ts';
import {
  decodeLayoutFile,
  formatForFileName,
  importBenizara,
  importDvorakJ,
  importVial,
} from './layout-import.ts';
import { resolveSelection, type ModeId } from './layout-selection.ts';
import {
  createDefaultUiState,
  DEFAULT_CONDITION_DEFAULTS,
  loadUiState,
  MAX_SAVED_TEXT_LENGTH,
  saveUiState,
  type UiPlaybackState,
  type UiStateStorage,
  type UiStateV1,
} from './ui-state.ts';
import { describeConditions, describePlaybackConditions } from './condition-description.ts';
import { el, SERIES } from './app-dom.ts';
import { createRomajiEditor } from './romaji-editor.ts';
import { createCalibrationDialog, type CalibrationDialogController } from './calibration-dialog.ts';
import { createPlaybackView, type PlaybackViewController } from './playback-view.ts';
import { createResultsView, type ResultsViewController } from './results-view.ts';
import type { ArpeggioConditions } from './playback-arpeggio.ts';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  cloneGeometrySettings,
  clonePhysicalShape,
  geometrySettingsForPreset,
  parseGeometrySettings,
  serializeGeometrySettings,
  type GeometrySettings,
} from './geometry-settings.ts';
import { fromDisplayUnits, toDisplayUnits, type GeometryUnit } from './geometry-units.ts';
import {
  load as loadUserGeometryShapes,
  newId as newGeometryId,
  save as saveUserGeometryShapes,
} from './user-geometries.ts';

type SampleId = string;

const SAMPLES: Record<ModeId, Record<SampleId, string>> = {
  en: { default: SAMPLE_TEXT.replace(/\s+/g, ' ').trim() },
  ja: {
    modern: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
    legacy: SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, ''),
  },
};

const SAMPLE_NAMES: Record<ModeId, Record<SampleId, string>> = {
  en: { default: '英文（既定）' },
  ja: { modern: '現代文（既定）', legacy: '旧文「吾輩は猫である」' },
};

/** 既定で表示する配列 */
const INITIAL = {
  en: ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi'],
  ja: ['qwerty', 'colemak-dh', 'oonishi', 'oonishi-custom-combo', 'naginata-v18'],
} as const;

let userLayouts: UserLayout[] = loadUserLayouts();
let userGeometryShapes: PhysicalShape[] = loadUserGeometryShapes();
let romajiSettings = loadRomajiSettings();
const ROMAJI_TABLE_CACHE = new Map<string, Map<string, string>>();

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
    const ruleId = romajiSettings.assignments[layout.id] ?? defaultRomajiRuleId(layout.id);
    return { ...layout, romajiTable: cachedRomajiTable(ruleId) };
  });
  const mine = userLayouts.map((d) => d.direct
    ? toLayout(d)
    : withRomaji(toLayout(d), cachedRomajiTable(d.romaji)));
  return [...assigned, ...mine];
}

/** 配列に紐づくローマ字規則を、Metricsへ保存する識別子として解決する。 */
function romajiRuleIdForLayout(layout: Layout): string | null {
  if (!layout.romajiTable) return null;
  const user = userLayouts.find((definition) => definition.id === layout.id);
  return romajiSettings.assignments[layout.id]
    ?? (user && !user.direct ? user.romaji : undefined)
    ?? defaultRomajiRuleId(layout.id);
}

const MODES = {
  en: { get layouts() { return layoutsOf('en'); }, sample: SAMPLES.en.default },
  ja: { get layouts() { return layoutsOf('ja'); }, sample: SAMPLES.ja.modern },
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
const uiStateDefaults = createDefaultUiState({
  textPanelOpen: !window.matchMedia('(max-width: 900px)').matches,
  usePlaybackCalibration: playbackCalibration !== undefined,
  selectedLayouts: INITIAL,
});
const uiStateChoices = {
  layouts: {
    en: layoutsOf('en').map((layout) => layout.id),
    ja: layoutsOf('ja').map((layout) => layout.id),
  },
  samples: {
    en: Object.keys(SAMPLES.en),
    ja: Object.keys(SAMPLES.ja),
  },
};
let uiState = loadUiState(uiStorage, uiStateDefaults, uiStateChoices).state;
let uiStateSaveTimer: number | undefined;

function flushUiState(): void {
  if (uiStateSaveTimer !== undefined) window.clearTimeout(uiStateSaveTimer);
  uiStateSaveTimer = undefined;
  saveUiState(uiStorage, uiState);
}

/** 永続化する画面状態は必ずこの関数を通して更新する。 */
function updateUiState(change: (draft: UiStateV1) => void, debounce = false): void {
  const next = structuredClone(uiState);
  change(next);
  uiState = next;
  if (uiStateSaveTimer !== undefined) window.clearTimeout(uiStateSaveTimer);
  if (debounce) {
    uiStateSaveTimer = window.setTimeout(() => {
      flushUiState();
    }, 300);
  } else {
    flushUiState();
  }
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

window.addEventListener('pagehide', flushUiState);

if (!playbackCalibration && uiState.ui.playback.useCalibration) {
  updateUiState((draft) => { draft.ui.playback.useCalibration = false; });
}

el.mode.value = uiState.ui.input.mode;
el.geometry.value = uiState.conditions.defaults.geometry;
el.window.value = String(uiState.conditions.defaults.windowSize);
el.sfbHome.checked = uiState.conditions.defaults.sfbHomeCost;
el.preferOppositeThumb.checked = uiState.conditions.defaults.preferOppositeThumb;
el.addPanel.open = uiState.ui.panels.addLayout;
el.textPanel.open = uiState.ui.panels.text;
el.sensitivityPanel.open = uiState.ui.panels.sensitivity;

/** 表示する配列のid。モードごとに覚える。保存値があればそれを使い、無ければ既定値 */
const selected: Record<ModeId, Set<string>> = {
  en: resolveSelection(uiState.ui.layouts.selectedByMode.en, INITIAL.en),
  ja: resolveSelection(uiState.ui.layouts.selectedByMode.ja, INITIAL.ja),
};

function saveSelectedLayouts(): void {
  updateUiState((draft) => {
    draft.ui.layouts.selectedByMode = {
      en: [...selected.en],
      ja: [...selected.ja],
    };
  });
}

const currentModeId = () => el.mode.value as ModeId;
const currentMode = () => MODES[currentModeId()];
const currentSample = () => SAMPLES[currentModeId()][uiState.ui.input.selectedSampleByMode[currentModeId()]]
  ?? currentMode().sample;

/** 選択されている配列。色のスロットは選択順ではなく一覧順に固定する */
function activeLayouts(): Layout[] {
  const set = selected[currentModeId()];
  return currentMode().layouts.filter((l) => set.has(l.id));
}

function fillSampleOptions() {
  const mode = currentModeId();
  el.sample.replaceChildren();
  for (const [id, name] of Object.entries(SAMPLE_NAMES[mode])) {
    el.sample.append(new Option(name, id));
  }
  el.sample.value = uiState.ui.input.selectedSampleByMode[mode];
}

fillSampleOptions();
el.text.value = uiState.ui.input.customText ?? currentSample();

/** 配列を追加する欄。段ごとに1行、数字段は任意 */
function setupAddForm() {
  const inputs: HTMLInputElement[] = ROW_LABELS.map((label, i) => {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = QWERTY_LEGEND[i];
    if (i === 0) input.dataset.optional = 'true';
    row.append(span, input);
    el.newRows.append(row);
    return input;
  });

  const homeKeySelects = new Map<NonThumb, HTMLSelectElement>();
  const homeHeading = document.createElement('h4');
  homeHeading.textContent = '配列側のホームキー（任意）';
  el.newHomeKeys.append(homeHeading);
  const homeNote = document.createElement('p');
  homeNote.className = 'note';
  homeNote.textContent = '未指定なら物理形状側の既定ホームキーを使います。';
  el.newHomeKeys.append(homeNote);
  for (const finger of FINGERS) {
    const label = document.createElement('label');
    label.className = 'geometry-number';
    const span = document.createElement('span');
    span.textContent = FINGER_NAMES[finger];
    const select = document.createElement('select');
    select.dataset.homeFinger = finger;
    homeKeySelects.set(finger, select);
    label.append(span, select);
    el.newHomeKeys.append(label);
  }

  function refreshHomeKeyOptions(): void {
    const row = [...(inputs[HOME_ROW]?.value ?? '')];
    for (const select of homeKeySelects.values()) {
      const selected = select.value;
      select.replaceChildren(new Option('形状の既定', ''));
      row.forEach((_, col) => {
        const id = keyId(HOME_ROW, col);
        select.append(new Option(id, id));
      });
      select.value = row.some((_, col) => keyId(HOME_ROW, col) === selected) ? selected : '';
    }
  }
  inputs.forEach((input) => input.addEventListener('input', refreshHomeKeyOptions));
  refreshHomeKeyOptions();

  romajiEditor.fillRomajiSelect(el.newRomaji);

  el.addLayout.addEventListener('click', () => {
    const rows = inputs.map((i) => i.value.trim());
    const errors = validate(rows);
    el.newError.textContent = errors.join(' / ');
    el.newError.hidden = errors.length === 0;
    if (errors.length) return;

    const def: UserLayout = {
      id: newLayoutId(),
      name: el.newName.value.trim() || '自作配列',
      rows: [rows[0], rows[1], rows[2], rows[3]],
      romaji: el.newRomaji.value as RomajiRuleId,
      homeKeys: Object.fromEntries(
        [...homeKeySelects.entries()]
          .filter(([, select]) => select.value !== '')
          .map(([finger, select]) => [finger, select.value]),
      ),
    };
    userLayouts = [...userLayouts, def];
    saveUserLayouts(userLayouts);

    // 追加したものは自動で表示に入れる
    selected.en.add(def.id);
    selected.ja.add(def.id);
    saveSelectedLayouts();

    for (const input of inputs) input.value = '';
    for (const select of homeKeySelects.values()) select.value = '';
    refreshHomeKeyOptions();
    el.newName.value = '';
    fillPicker();
    fillDetailOptions();
    render();
  });

  el.importLayout.addEventListener('change', async () => {
    const file = el.importLayout.files?.[0];
    if (!file) return;
    try {
      const format = formatForFileName(file.name);
      if (!format) throw new Error('DvorakJの .txt、Vialの .vil、紅皿の .bnz / .iniを選ぶ');
      const bytes = await file.arrayBuffer();
      const source = decodeLayoutFile(bytes, format);
      const name = file.name.replace(/\.[^.]+$/, '');
      const imported = format === 'vial'
        ? importVial(source, name)
        : format === 'benizara'
          ? importBenizara(source, name)
          : importDvorakJ(source, name);
      const def: UserLayout = {
        id: newLayoutId(),
        name: imported.name,
        rows: imported.rows,
        romaji: 'kunrei',
        legends: imported.legends,
        sequences: imported.sequences,
        direct: imported.direct,
      };
      userLayouts = [...userLayouts, def];
      saveUserLayouts(userLayouts);
      selected.en.add(def.id);
      selected.ja.add(def.id);
      saveSelectedLayouts();
      el.importError.hidden = true;
      el.importWarning.textContent = imported.warnings.length > 0
        ? `注意: ${imported.warnings.join(' / ')}`
        : '';
      el.importWarning.hidden = imported.warnings.length === 0;
      fillPicker();
      fillDetailOptions();
      render();
    } catch (error) {
      el.importError.textContent = error instanceof Error ? error.message : '定義ファイルを取り込めない';
      el.importError.hidden = false;
      el.importWarning.hidden = true;
    } finally {
      el.importLayout.value = '';
    }
  });
}

const romajiEditor = createRomajiEditor({
  el,
  getUserLayouts: () => userLayouts,
  setUserLayouts: (layouts) => { userLayouts = layouts; },
  getRomajiSettings: () => romajiSettings,
  setRomajiSettings: (settings) => { romajiSettings = settings; },
  clearTableCache: () => ROMAJI_TABLE_CACHE.clear(),
  fillPicker,
  fillDetailOptions,
  render,
});

function removeUserLayout(id: string) {
  userLayouts = userLayouts.filter((l) => l.id !== id);
  saveUserLayouts(userLayouts);
  selected.en.delete(id);
  selected.ja.delete(id);
  updateUiState((draft) => {
    draft.ui.layouts.selectedByMode = {
      en: [...selected.en],
      ja: [...selected.ja],
    };
    if (draft.ui.layouts.detailByMode.en === id) delete draft.ui.layouts.detailByMode.en;
    if (draft.ui.layouts.detailByMode.ja === id) delete draft.ui.layouts.detailByMode.ja;
    if (draft.ui.comparison.baselineByMode.en === id) delete draft.ui.comparison.baselineByMode.en;
    if (draft.ui.comparison.baselineByMode.ja === id) delete draft.ui.comparison.baselineByMode.ja;
  });
  fillPicker();
  fillDetailOptions();
  render();
}

/** 配列の選択欄。色は一覧での位置に固定するので、外しても他の色は動かない */
function fillPicker() {
  const set = selected[currentModeId()];
  el.picker.replaceChildren();
  currentMode().layouts.forEach((layout, i) => {
    const on = set.has(layout.id);
    const label = document.createElement('label');
    label.className = on ? '' : 'off';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('change', () => {
      if (box.checked) set.add(layout.id);
      else set.delete(layout.id);
      saveSelectedLayouts();
      label.className = box.checked ? '' : 'off';
      fillDetailOptions();
      render();
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = SERIES(i);

    label.append(box, swatch, document.createTextNode(layout.name));

    if (userLayouts.some((u) => u.id === layout.id)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost remove';
      remove.textContent = '削除';
      remove.title = `${layout.name} を削除する`;
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        removeUserLayout(layout.id);
      });
      label.append(remove);
    }

    el.picker.append(label);
  });
}

/** 詳細セレクタはモードで配列の顔ぶれが変わるので作り直す */
function fillDetailOptions() {
  const keep = uiState.ui.layouts.detailByMode[currentModeId()] || el.detailLayout.value;
  const layouts = activeLayouts();
  el.detailLayout.replaceChildren();
  for (const layout of layouts) {
    el.detailLayout.append(new Option(layout.name, layout.id));
  }
  if (layouts.length === 0) return;
  el.detailLayout.value = layouts.some((l) => l.id === keep) ? keep : layouts[0].id;
}

function syncSampleText() {
  const untouched = Object.values(SAMPLES).some((samples) => Object.values(samples).includes(el.text.value));
  if (untouched) el.text.value = currentSample();
}

function syncTextState(debounce = true): void {
  const text = el.text.value;
  const isSample = Object.values(SAMPLES).some((samples) => Object.values(samples).includes(text));
  const tooLong = text.length > MAX_SAVED_TEXT_LENGTH;
  el.textSaveStatus.textContent = tooLong
    ? `本文が ${MAX_SAVED_TEXT_LENGTH.toLocaleString()} 文字を超えたため、この本文は保存しません。`
    : '';
  el.textSaveStatus.hidden = !tooLong;
  updateUiState((draft) => {
    if (isSample || tooLong) delete draft.ui.input.customText;
    else draft.ui.input.customText = text;
  }, debounce);
}

const FINGER_NAMES: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

const ROW_NAMES = ['数字段', '上段', 'ホーム段', '下段'];

function settingNumber(
  labelText: string,
  value: number | undefined,
  onInput: (value: string) => void,
  options: { step?: string; min?: string; max?: string } = {},
  onChange?: () => void,
): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'geometry-number';
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value === undefined ? '' : String(value);
  input.step = options.step ?? '0.01';
  if (options.min !== undefined) input.min = options.min;
  if (options.max !== undefined) input.max = options.max;
  input.addEventListener('input', () => onInput(input.value));
  if (onChange) input.addEventListener('change', onChange);
  label.append(text, input);
  return label;
}

function updateGeometrySettings(
  change: (settings: GeometrySettings) => void,
  renderResults = true,
  geometryKind?: GeometryKind,
): void {
  updateUiState((draft) => {
    const settings = draft.conditions.geometrySettings;
    change(settings);
    if (geometryKind !== undefined) {
      draft.conditions.defaults.geometry = geometryKind;
      draft.ui.input.geometry = geometryKind;
    }
  });
  el.geometry.value = uiState.conditions.defaults.geometry;
  if (renderResults) render();
}

function markCustomAssignment(settings: GeometrySettings): void {
  settings.assignment.id = 'custom';
  settings.assignment.name = 'カスタム運指';
}

function fillGeometryOptions(): void {
  const current = uiState.conditions.defaults.geometry;
  el.geometry.replaceChildren(
    new Option('ロウスタッガード', 'row-staggered'),
    new Option('オーソリニア', 'ortholinear'),
    new Option('カラムスタッガード', 'column-staggered'),
    ...userGeometryShapes.map((shape) => new Option(`自作: ${shape.name}`, customGeometryKind(shape.id))),
  );
  el.geometry.value = current;
  if (el.geometry.value !== current) {
    const fallback: GeometryKind = 'row-staggered';
    updateUiState((draft) => {
      draft.conditions.defaults.geometry = fallback;
      draft.ui.input.geometry = fallback;
      draft.conditions.geometrySettings.shape = clonePhysicalShape(PHYSICAL_SHAPES[fallback]);
    });
    el.geometry.value = fallback;
  }
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

/** 運指と形状を編集するモーダル。 */
let refreshGeometryEditor = (): void => undefined;

function setupGeometryEditor(): void {
  const assignmentFields = document.createElement('div');
  assignmentFields.className = 'assignment-fields';
  const assignmentActions = document.createElement('div');
  assignmentActions.className = 'geometry-actions';
  const resetAssignment = document.createElement('button');
  resetAssignment.type = 'button';
  resetAssignment.className = 'ghost';
  resetAssignment.textContent = '運指を既定に戻す';
  resetAssignment.addEventListener('click', () => {
    updateGeometrySettings((settings) => {
      settings.assignment = cloneGeometrySettings(DEFAULT_GEOMETRY_SETTINGS).assignment;
    });
    renderEditor();
  });
  assignmentActions.append(resetAssignment);

  let shapeDraft: PhysicalShape | undefined;
  let shapeUnit: GeometryUnit = 'mm';

  function fieldValue(value: string, fallback: number): number | undefined {
    if (value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function displayValue(value: number, pitchMm: number): number {
    return toDisplayUnits(value, pitchMm, shapeUnit);
  }

  function shapeValue(value: string, fallback: number, pitchMm: number): number | undefined {
    const parsed = fieldValue(value, displayValue(fallback, pitchMm));
    return parsed === undefined ? undefined : fromDisplayUnits(parsed, pitchMm, shapeUnit);
  }

  function renderShapeEditor(): void {
    const shape = shapeDraft;
    if (!shape) return;
    const root = el.geometryModalEditor;
    const shapeFields = document.createElement('div');
    shapeFields.className = 'geometry-fields';
    const unitLabel = shapeUnit === 'mm' ? 'mm' : 'u';
    const numberOptions = shapeUnit === 'mm'
      ? { min: '-600', max: '600' }
      : { min: '-32', max: '32' };
    root.replaceChildren(shapeFields, assignmentFields, assignmentActions);
    const shapeHeading = document.createElement('h3');
    shapeHeading.textContent = '物理形状の数値';
    shapeFields.append(shapeHeading);

    shapeFields.append(settingNumber('ピッチ [mm]', shape.pitchMm, (value) => {
      const parsed = fieldValue(value, shape.pitchMm);
      if (parsed !== undefined && parsed >= 1 && parsed <= 100) shape.pitchMm = parsed;
    }, { min: '1', max: '100' }, renderShapeEditor));

    const rowHeading = document.createElement('h4');
    rowHeading.textContent = `段ずれ量 [${unitLabel}]`;
    shapeFields.append(rowHeading);
    const rowGrid = document.createElement('div');
    rowGrid.className = 'geometry-number-grid';
    const rowStagger = shape.rowStagger ?? ROW_NAMES.map(() => 0);
    ROW_NAMES.forEach((name, index) => rowGrid.append(settingNumber(
      name,
      displayValue(rowStagger[index] ?? 0, shape.pitchMm),
      (value) => {
        const parsed = shapeValue(value, rowStagger[index] ?? 0, shape.pitchMm);
        if (parsed !== undefined) {
          shape.rowStagger = [...(shape.rowStagger ?? ROW_NAMES.map(() => 0))];
          shape.rowStagger[index] = parsed;
        }
      },
      numberOptions,
    )));
    shapeFields.append(rowGrid);

    const columnHeading = document.createElement('h4');
    columnHeading.textContent = `列オフセット [${unitLabel}]`;
    shapeFields.append(columnHeading);
    const columnGrid = document.createElement('div');
    columnGrid.className = 'geometry-number-grid geometry-column-grid';
    const columnStagger = shape.columnStagger ?? shape.rowWidths.map(() => 0);
    const columnCount = Math.max(...shape.rowWidths, columnStagger.length);
    for (let column = 0; column < columnCount; column++) {
      columnGrid.append(settingNumber(
        `列${column + 1}`,
        displayValue(columnStagger[column] ?? 0, shape.pitchMm),
        (value) => {
          const parsed = shapeValue(value, columnStagger[column] ?? 0, shape.pitchMm);
          if (parsed !== undefined) {
            shape.columnStagger = [...(shape.columnStagger ?? Array.from({ length: columnCount }, () => 0))];
            while (shape.columnStagger.length < columnCount) shape.columnStagger.push(0);
            shape.columnStagger[column] = parsed;
          }
        },
        numberOptions,
      ));
    }
    shapeFields.append(columnGrid);

    const thumbHeading = document.createElement('h4');
    thumbHeading.textContent = `親指キーの位置 [${unitLabel}]`;
    shapeFields.append(thumbHeading);
    const thumbGrid = document.createElement('div');
    thumbGrid.className = 'geometry-thumb-grid';
    for (const finger of ['LT', 'RT'] as const) {
      const thumb = shape.thumbs.find((candidate) => candidate.finger === finger);
      if (!thumb) continue;
      const row = document.createElement('div');
      row.className = 'geometry-thumb-row';
      const label = document.createElement('span');
      label.textContent = FINGER_NAMES[finger];
      row.append(label);
      row.append(settingNumber('列', displayValue(thumb.col, shape.pitchMm), (value) => {
        const parsed = shapeValue(value, thumb.col, shape.pitchMm);
        if (parsed !== undefined) {
          const target = shape.thumbs.find((candidate) => candidate.finger === finger);
          if (target) target.col = parsed;
        }
      }, numberOptions));
      row.append(settingNumber('段', displayValue(thumb.y, shape.pitchMm), (value) => {
        const parsed = shapeValue(value, thumb.y, shape.pitchMm);
        if (parsed !== undefined) {
          const target = shape.thumbs.find((candidate) => candidate.finger === finger);
          if (target) target.y = parsed;
        }
      }, numberOptions));
      thumbGrid.append(row);
    }
    shapeFields.append(thumbGrid);

    const splitHeading = document.createElement('h4');
    splitHeading.textContent = '分割間隔（任意）';
    shapeFields.append(splitHeading);
    const splitGrid = document.createElement('div');
    splitGrid.className = 'geometry-number-grid';
    splitGrid.append(settingNumber('開始列', shape.splitAt, (value) => {
      shape.splitAt = fieldValue(value, 0);
    }, { min: '0', max: '32', step: '1' }));
    splitGrid.append(settingNumber(`間隔 [${unitLabel}]`, shape.splitGap === undefined
      ? undefined
      : displayValue(shape.splitGap, shape.pitchMm), (value) => {
      shape.splitGap = shapeValue(value, shape.splitGap ?? 0, shape.pitchMm);
    }, numberOptions));
    shapeFields.append(splitGrid);
  }

  function updateModalButtons(): void {
    const currentId = uiState.conditions.geometrySettings.shape.id;
    const editable = userGeometryShapes.some((shape) => shape.id === currentId);
    el.geometryModalSave.disabled = !editable;
    el.geometryModalDelete.disabled = !editable;
  }

  function renderEditor(): void {
    const settings = uiState.conditions.geometrySettings;
    const shape = settings.shape;
    const assignment = settings.assignment;
    assignmentFields.replaceChildren();
    const assignmentHeading = document.createElement('h3');
    assignmentHeading.textContent = '指の割り当て';
    assignmentFields.append(assignmentHeading);

    const paintLabel = document.createElement('label');
    paintLabel.className = 'ctl';
    const paintText = document.createElement('span');
    paintText.textContent = 'キー単位の上書き';
    const paintSelect = document.createElement('select');
    for (const finger of FINGERS) paintSelect.append(new Option(FINGER_NAMES[finger], finger));
    paintLabel.append(paintText, paintSelect);
    assignmentFields.append(paintLabel);

    const columnsHeading = document.createElement('h4');
    columnsHeading.textContent = '列単位の一括指定';
    assignmentFields.append(columnsHeading);
    const columnAssignments = document.createElement('div');
    columnAssignments.className = 'assignment-columns';
    const maxColumns = Math.max(...shape.rowWidths);
    for (let column = 0; column < maxColumns; column++) {
      const ids = shape.rowWidths
        .map((width, row) => width > column ? keyIdForEditor(row, column) : undefined)
        .filter((id): id is string => id !== undefined);
      if (ids.length === 0) continue;
      const values = ids.map((id) => assignment.keyFinger[id]);
      const select = document.createElement('select');
      select.title = `列${column + 1}を一括指定`;
      select.append(new Option(`列${column + 1}`, ''));
      for (const finger of FINGERS) select.append(new Option(FINGER_NAMES[finger], finger));
      const first = values[0];
      select.value = values.every((value) => value === first) ? first : '';
      select.addEventListener('change', () => {
        if (!isNonThumbFinger(select.value)) return;
        updateGeometrySettings((current) => {
          markCustomAssignment(current);
          for (const id of ids) current.assignment.keyFinger[id] = select.value as NonThumb;
        });
        renderEditor();
      });
      columnAssignments.append(select);
    }
    assignmentFields.append(columnAssignments);

    const keyboardHeading = document.createElement('h4');
    keyboardHeading.textContent = 'キー単位（クリックしたキーを選択中の指へ割り当て）';
    assignmentFields.append(keyboardHeading);
    const keyboard = document.createElement('div');
    keyboard.className = 'assignment-keyboard';
    const geometry = buildGeometry(shape, assignment);
    for (const row of geometry.grid) {
      const line = document.createElement('div');
      line.className = 'assignment-keyboard-row';
      for (const key of row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'assignment-key';
        button.dataset.finger = key.finger;
        button.title = `${key.id}: ${FINGER_NAMES[key.finger]}`;
        button.textContent = `${key.id} · ${shortFinger(key.finger)}`;
        button.addEventListener('click', () => {
          updateGeometrySettings((current) => {
            markCustomAssignment(current);
            current.assignment.keyFinger[key.id] = paintSelect.value as NonThumb;
          });
          renderEditor();
        });
        line.append(button);
      }
      keyboard.append(line);
    }
    assignmentFields.append(keyboard);

    const homeNote = document.createElement('p');
    homeNote.className = 'note';
    homeNote.textContent = 'ホームキーは配列側に紐づきます。配列追加時に指定しない場合は物理形状の既定値を使います。';
    assignmentFields.append(homeNote);
    el.geometryCurrent.textContent = `現在: ${shape.name} / ${assignment.name}`;
    if (el.geometryDialog.open) renderShapeEditor();
  }

  function keyIdForEditor(row: number, column: number): string {
    return keyId(row, column);
  }

  function isNonThumbFinger(value: string): value is NonThumb {
    return FINGERS.includes(value as NonThumb);
  }

  function shortFinger(finger: Finger): string {
    return FINGER_NAMES[finger].replace(/^右|^左/, '').slice(0, 1);
  }

  function applyShape(shape: PhysicalShape, kind: GeometryKind): void {
    updateUiState((draft) => {
      draft.conditions.geometrySettings.shape = clonePhysicalShape(shape);
      draft.conditions.defaults.geometry = kind;
      draft.ui.input.geometry = kind;
    });
    fillGeometryOptions();
    renderEditor();
    render();
  }

  function persistShape(asNew: boolean): void {
    if (!shapeDraft) return;
    const name = el.geometryModalName.value.trim();
    if (!name) {
      el.geometryModalError.textContent = '形状名を入力する';
      el.geometryModalError.hidden = false;
      return;
    }
    const shape = clonePhysicalShape(shapeDraft);
    if (!shape.rowStagger) shape.rowStagger = ROW_NAMES.map(() => 0);
    const currentId = uiState.conditions.geometrySettings.shape.id;
    if (asNew || !userGeometryShapes.some((candidate) => candidate.id === currentId)) shape.id = newGeometryId();
    shape.name = name;
    const index = userGeometryShapes.findIndex((candidate) => candidate.id === shape.id);
    userGeometryShapes = index < 0
      ? [...userGeometryShapes, shape]
      : userGeometryShapes.map((candidate, i) => i === index ? shape : candidate);
    saveUserGeometryShapes(userGeometryShapes);
    applyShape(shape, customGeometryKind(shape.id));
    el.geometryStatus.textContent = `${shape.name}を保存した`;
    el.geometryStatus.hidden = false;
    el.geometryDialog.close();
  }

  el.geometryEdit.addEventListener('click', () => {
    shapeDraft = clonePhysicalShape(uiState.conditions.geometrySettings.shape);
    shapeUnit = 'mm';
    el.geometryModalName.value = shapeDraft.name;
    el.geometryModalUnit.value = shapeUnit;
    el.geometryModalError.hidden = true;
    updateModalButtons();
    renderEditor();
    renderShapeEditor();
    el.geometryDialog.showModal();
  });
  el.geometryModalUnit.addEventListener('change', () => {
    shapeUnit = el.geometryModalUnit.value as GeometryUnit;
    renderShapeEditor();
  });
  el.geometryModalSave.addEventListener('click', () => persistShape(false));
  el.geometryModalSaveAs.addEventListener('click', () => persistShape(true));
  el.geometryModalDelete.addEventListener('click', () => {
    const id = uiState.conditions.geometrySettings.shape.id;
    if (!userGeometryShapes.some((shape) => shape.id === id)) return;
    userGeometryShapes = userGeometryShapes.filter((shape) => shape.id !== id);
    saveUserGeometryShapes(userGeometryShapes);
    const fallback = clonePhysicalShape(PHYSICAL_SHAPES['row-staggered']);
    applyShape(fallback, 'row-staggered');
    el.geometryDialog.close();
  });

  el.geometryExport.addEventListener('click', () => {
    const blob = new Blob([serializeGeometrySettings(uiState.conditions.geometrySettings)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'keydist-geometry-settings.json';
    anchor.click();
    URL.revokeObjectURL(url);
    el.geometryStatus.textContent = '打ち手と機材の設定を書き出した';
    el.geometryStatus.hidden = false;
  });
  el.geometryImport.addEventListener('change', async () => {
    const file = el.geometryImport.files?.[0];
    if (!file) return;
    try {
      const settings = parseGeometrySettings(
        await file.text(),
        uiState.conditions.geometrySettings,
      );
      const shape = clonePhysicalShape(settings.shape);
      shape.id = newGeometryId();
      if (!shape.rowStagger) shape.rowStagger = ROW_NAMES.map(() => 0);
      if (shape.name === 'カスタム形状') shape.name = '読み込んだ形状';
      userGeometryShapes = [...userGeometryShapes, shape];
      saveUserGeometryShapes(userGeometryShapes);
      updateUiState((current) => {
        current.conditions.geometrySettings.assignment = settings.assignment;
        current.conditions.geometrySettings.shape = shape;
        current.conditions.defaults.geometry = customGeometryKind(shape.id);
        current.ui.input.geometry = customGeometryKind(shape.id);
      });
      fillGeometryOptions();
      renderEditor();
      render();
      el.geometryStatus.textContent = '打ち手と機材の設定を読み込んだ';
      el.geometryStatus.hidden = false;
    } catch (error) {
      el.geometryStatus.textContent = error instanceof Error ? error.message : '設定ファイルを読み込めない';
      el.geometryStatus.hidden = false;
    } finally {
      el.geometryImport.value = '';
    }
  });
  refreshGeometryEditor = renderEditor;
  fillGeometryOptions();
  renderEditor();
}

/**
 * 計算方法の図解をモーダルで開く。ヘッダーの仕様リンクを置き換えたボタンから呼ぶ。
 * 閉じる口は3つ: 閉じるボタン・背景クリック・Esc（dialog既定）。
 * 背景クリックを拾うためdialog自身のpaddingは0にし、余白は .dialog-bodyが持つ。
 */
function setupHowDialog() {
  el.howOpen.addEventListener('click', () => el.howDialog.showModal());
  el.howClose.addEventListener('click', () => el.howDialog.close());
  el.howDialog.addEventListener('click', (event) => {
    // 背景そのものを押した時だけ閉じる。中身の上ならtargetは子要素になる
    if (event.target === el.howDialog) el.howDialog.close();
  });
}

function renderConditionDescription(): void {
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
  const fragment = document.createDocumentFragment();

  const appendConditionList = (
    headingText: string,
    noteText: string,
    conditions: readonly {
      label: string;
      value: string;
      defaultValue: string;
      differsFromDefault: boolean;
      effect: string;
    }[],
  ): void => {
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = noteText;
    const list = document.createElement('dl');
    list.className = 'condition-list';
    for (const condition of conditions) {
      const term = document.createElement('dt');
      term.textContent = condition.label;
      const detail = document.createElement('dd');
      const value = document.createElement('strong');
      value.textContent = `現在: ${condition.value}`;
      detail.append(value);
      const difference = document.createElement('span');
      difference.className = condition.differsFromDefault ? 'condition-changed' : 'condition-default';
      difference.textContent = condition.differsFromDefault
        ? `（既定: ${condition.defaultValue}）`
        : '（既定どおり）';
      detail.append(' ', difference);
      const effect = document.createElement('p');
      effect.textContent = condition.effect;
      detail.append(effect);
      list.append(term, detail);
    }
    fragment.append(heading, note, list);
  };

  appendConditionList(
    '移動距離条件',
    '移動距離を計算する処理に影響します。',
    description.conditions,
  );
  appendConditionList(
    '打鍵再生条件',
    '打鍵再生を計算する処理に影響します。',
    playbackDescription,
  );

  const overridesHeading = document.createElement('h3');
  overridesHeading.textContent = '配列ごとの上書き';
  fragment.append(overridesHeading);
  if (description.overrides.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = '配列ごとの上書きはありません。';
    fragment.append(empty);
  } else {
    const overrides = document.createElement('div');
    overrides.className = 'condition-overrides';
    for (const override of description.overrides) {
      const section = document.createElement('section');
      const heading = document.createElement('h4');
      heading.textContent = override.layoutName;
      section.append(heading);
      const list = document.createElement('ul');
      for (const condition of override.conditions) {
        const item = document.createElement('li');
        item.textContent = `${condition.label}: ${condition.value}（既定: ${condition.defaultValue}）`;
        list.append(item);
      }
      section.append(list);
      overrides.append(section);
    }
    fragment.append(overrides);
  }
  el.conditionDescription.replaceChildren(fragment);
}

/** シミュレーション条件の読み取り専用モーダル。条件は開く直前に再生成する。 */
function setupConditionDialog() {
  el.conditionsOpen.addEventListener('click', () => {
    renderConditionDescription();
    el.conditionsDialog.showModal();
  });
  el.conditionsClose.addEventListener('click', () => el.conditionsDialog.close());
  el.conditionsDialog.addEventListener('click', (event) => {
    if (event.target === el.conditionsDialog) el.conditionsDialog.close();
  });
}

function setupPanelState() {
  el.addPanel.addEventListener('toggle', () => {
    updateUiState((draft) => { draft.ui.panels.addLayout = el.addPanel.open; });
  });
  el.textPanel.addEventListener('toggle', () => {
    updateUiState((draft) => { draft.ui.panels.text = el.textPanel.open; });
  });
}

let playbackView: PlaybackViewController;
let calibrationDialog: CalibrationDialogController;
let resultsView: ResultsViewController;

function currentPlaybackLayoutId(): string | undefined {
  return playbackView?.getLayout()?.id;
}

function isPlaybackLayoutOverride(): boolean {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return false;
  return uiState.conditions.perLayout[layoutId]?.playback !== undefined
    || uiState.conditions.perLayout[layoutId]?.arpeggio !== undefined;
}

function playbackViewUiState(): UiStateV1 {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return uiState;
  const layoutConditions = uiState.conditions.perLayout[layoutId];
  const playback = layoutConditions?.playback;
  const arpeggio = layoutConditions?.arpeggio;
  if (playback === undefined && arpeggio === undefined) return uiState;
  return {
    ...uiState,
    ui: {
      ...uiState.ui,
      playback: { ...uiState.ui.playback, ...playback },
    },
    conditions: {
      ...uiState.conditions,
      defaults: {
        ...uiState.conditions.defaults,
        ...(arpeggio === undefined ? {} : { arpeggio }),
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
    const hasLayoutOverride = layoutId !== undefined && (
      draft.conditions.perLayout[layoutId]?.playback !== undefined
      || draft.conditions.perLayout[layoutId]?.arpeggio !== undefined
    );
    if (hasLayoutOverride && layoutId) {
      const current = draft.conditions.perLayout[layoutId];
      draft.conditions.perLayout[layoutId] = {
        ...current,
        playback: { ...current?.playback, [key]: value },
      };
    } else {
      draft.ui.playback[key] = value;
    }
  });
}

function updateArpeggioConditions(conditions: ArpeggioConditions): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined && (
      draft.conditions.perLayout[layoutId]?.playback !== undefined
      || draft.conditions.perLayout[layoutId]?.arpeggio !== undefined
    );
    if (hasLayoutOverride && layoutId) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        arpeggio: structuredClone(conditions),
      };
    } else {
      draft.conditions.defaults.arpeggio = structuredClone(conditions);
    }
  });
}

function setPlaybackLayoutOverride(enabled: boolean): void {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return;
  updateUiState((draft) => {
    if (enabled) {
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        playback: draft.conditions.perLayout[layoutId]?.playback ?? {},
      };
      return;
    }
    const conditions = draft.conditions.perLayout[layoutId];
    if (!conditions) return;
    delete conditions.playback;
    delete conditions.arpeggio;
    if (Object.keys(conditions).length === 0) delete draft.conditions.perLayout[layoutId];
  });
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
  getArpeggioConditions: () => playbackViewUiState().conditions.defaults.arpeggio,
  updateArpeggioConditions,
  readArpeggioConditions: () => calibrationDialog.readArpeggioConditions(),
  syncArpeggioConditionControls: () => calibrationDialog.syncArpeggioConditionControls(),
  arpeggioPresetId: () => calibrationDialog.arpeggioPresetId(),
  openCalibration: () => calibrationDialog.open(),
  openCalibrationEdit: () => calibrationDialog.openEdit(),
});
calibrationDialog = createCalibrationDialog({
  el,
  storage: uiStorage,
  getUiState: playbackViewUiState,
  updateUiState,
  updatePlaybackSetting,
  getPlaybackGeometry: () => playbackView.getGeometry(),
  getGeometrySettings: () => uiState.conditions.geometrySettings,
  getPlaybackLayout: () => playbackView.getLayout(),
  getCalibration: () => playbackCalibration,
  setCalibration: (calibration) => { playbackCalibration = calibration; },
  setPlaybackCalibration: (calibration) => playbackView.setCalibration(calibration),
});
resultsView = createResultsView({
  el,
  getUiState: () => uiState,
  updateUiState,
  currentModeId,
  currentMode,
  selected,
  romajiRuleIdForLayout,
  getGeometrySettings: () => uiState.conditions.geometrySettings,
  playback: playbackView,
});

function render(): void {
  resultsView.render();
}

function onModeChange() {
  updateUiState((draft) => { draft.ui.input.mode = currentModeId(); });
  fillSampleOptions();
  syncSampleText();
  fillPicker();
  fillDetailOptions();
  render();
}
el.mode.addEventListener('change', onModeChange);
el.sample.addEventListener('change', () => {
  updateUiState((draft) => {
    draft.ui.input.selectedSampleByMode[currentModeId()] = el.sample.value;
    delete draft.ui.input.customText;
  });
  el.text.value = currentSample();
  render();
});
el.sampleReset.addEventListener('click', () => {
  el.text.value = currentSample();
  updateUiState((draft) => { delete draft.ui.input.customText; });
  el.textSaveStatus.hidden = true;
  render();
});
el.compareChartMetric.addEventListener('change', () => {
  updateUiState((draft) => { draft.ui.comparison.chartColumn = Number(el.compareChartMetric.value); });
  render();
});
el.geometry.addEventListener('change', () => {
  const geometry = el.geometry.value as GeometryKind;
  const shape = selectedShapeForKind(geometry);
  if (!shape) return;
  updateUiState((draft) => {
    draft.ui.input.geometry = geometry;
    draft.conditions.defaults.geometry = geometry;
    draft.conditions.geometrySettings.shape = shape;
  });
  fillGeometryOptions();
  refreshGeometryEditor();
  render();
});
el.window.addEventListener('input', (event) => {
  const windowSize = Number((event.currentTarget as HTMLInputElement).value);
  updateUiState((draft) => { draft.conditions.defaults.windowSize = windowSize; });
  render();
});
el.sfbHome.addEventListener('change', () => {
  updateUiState((draft) => { draft.conditions.defaults.sfbHomeCost = el.sfbHome.checked; });
  render();
});
el.preferOppositeThumb.addEventListener('change', () => {
  updateUiState((draft) => { draft.conditions.defaults.preferOppositeThumb = el.preferOppositeThumb.checked; });
  render();
});
el.text.addEventListener('input', () => {
  syncTextState();
  render();
});
el.text.addEventListener('change', () => syncTextState(false));
el.detailLayout.addEventListener('change', () => {
  updateUiState((draft) => { draft.ui.layouts.detailByMode[currentModeId()] = el.detailLayout.value; });
  render();
});
el.compareBaseline.addEventListener('change', () => {
  updateUiState((draft) => {
    const mode = currentModeId();
    if (el.compareBaseline.value) draft.ui.comparison.baselineByMode[mode] = el.compareBaseline.value;
    else delete draft.ui.comparison.baselineByMode[mode];
  });
  render();
});
setupAddForm();
setupGeometryEditor();
romajiEditor.setup();
setupPanelState();
setupConditionDialog();
calibrationDialog.setup();
playbackView.setup();
resultsView.setup();
fillPicker();
fillDetailOptions();
// 図解は固定例（§7〜§9）。画面の選択に連動させず、起動時に1度だけ描く
el.gapFigure.innerHTML = gapFigure(buildGeometry('row-staggered'));
setupHowDialog();
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
setupTheme(uiState.ui.theme, (choice) => {
  if (choice !== uiState.ui.theme) updateUiState((draft) => { draft.ui.theme = choice; });
  render();
});

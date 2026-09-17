import { buildGeometry, QWERTY_LEGEND, type GeometryKind } from './geometry.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from './layouts/index.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from './sample-text-ja.ts';
import { bindTips, hideTip, showTip } from './chart.ts';
import { setupTheme } from './theme.ts';
import { gapFigure } from './gap-figure.ts';
import {
  ROW_LABELS,
  load as loadUserLayouts,
  newId,
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

  romajiEditor.fillRomajiSelect(el.newRomaji);

  el.addLayout.addEventListener('click', () => {
    const rows = inputs.map((i) => i.value.trim());
    const errors = validate(rows);
    el.newError.textContent = errors.join(' / ');
    el.newError.hidden = errors.length === 0;
    if (errors.length) return;

    const def: UserLayout = {
      id: newId(),
      name: el.newName.value.trim() || '自作配列',
      rows: [rows[0], rows[1], rows[2], rows[3]],
      romaji: el.newRomaji.value as RomajiRuleId,
    };
    userLayouts = [...userLayouts, def];
    saveUserLayouts(userLayouts);

    // 追加したものは自動で表示に入れる
    selected.en.add(def.id);
    selected.ja.add(def.id);
    saveSelectedLayouts();

    for (const input of inputs) input.value = '';
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
        id: newId(),
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
  return uiState.ui.playbackPerLayout[layoutId] !== undefined
    || uiState.conditions.perLayout[layoutId]?.arpeggio !== undefined;
}

function playbackViewUiState(): UiStateV1 {
  const layoutId = currentPlaybackLayoutId();
  if (!layoutId) return uiState;
  const playback = uiState.ui.playbackPerLayout[layoutId];
  const arpeggio = uiState.conditions.perLayout[layoutId]?.arpeggio;
  if (!playback && arpeggio === undefined) return uiState;
  return {
    ...uiState,
    ui: {
      ...uiState.ui,
      playback: playback ?? uiState.ui.playback,
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
    const layoutOverride = layoutId ? draft.ui.playbackPerLayout[layoutId] : undefined;
    const hasLayoutOverride = layoutId !== undefined && (
      layoutOverride !== undefined
      || draft.conditions.perLayout[layoutId]?.arpeggio !== undefined
    );
    const target = hasLayoutOverride && layoutId
      ? (draft.ui.playbackPerLayout[layoutId] ??= structuredClone(draft.ui.playback))
      : draft.ui.playback;
    target[key] = value;
  });
}

function updateArpeggioConditions(conditions: ArpeggioConditions): void {
  const layoutId = currentPlaybackLayoutId();
  updateUiState((draft) => {
    const hasLayoutOverride = layoutId !== undefined && (
      draft.ui.playbackPerLayout[layoutId] !== undefined
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
      draft.ui.playbackPerLayout[layoutId] ??= structuredClone(draft.ui.playback);
      draft.conditions.perLayout[layoutId] = {
        ...draft.conditions.perLayout[layoutId],
        arpeggio: structuredClone(
          draft.conditions.perLayout[layoutId]?.arpeggio ?? draft.conditions.defaults.arpeggio,
        ),
      };
      return;
    }
    delete draft.ui.playbackPerLayout[layoutId];
    const conditions = draft.conditions.perLayout[layoutId];
    if (!conditions) return;
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
  updateUiState((draft) => {
    draft.ui.input.geometry = geometry;
    draft.conditions.defaults.geometry = geometry;
  });
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

import {
  buildGeometry,
  ADJACENT_PAIRS,
  ALL_FINGERS,
  FINGERS,
  resolveKeyId,
  THUMB_KEY,
  THUMB_ROW,
  type Finger,
  type GeometryKind,
} from './geometry.ts';
import { evaluate, type Options, type Trace, type Stroke } from './evaluate.ts';
import { computeMetrics, type LayerStat, type Metrics } from './metrics.ts';
import { normalizedLayerColors } from './layer-heatmap.ts';
import { nSensitivity } from './sensitivity.ts';
import {
  COMBO_LAYER_ID,
  LAYOUTS,
  LAYOUTS_JA,
  SINGLE_LAYER_ID,
  withRomaji,
  type Face,
  type Layout,
} from './layouts/index.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from './sample-text-ja.ts';
import {
  bindTips,
  hideTip,
  showTip,
  columnChart,
  escapeText,
  escapeAttr,
  lineChart,
  barChart,
  matrixChart,
  type MatrixSort,
} from './chart.ts';
import { setupTheme } from './theme.ts';
import { gapFigure } from './gap-figure.ts';
import {
  advancePlayback,
  clampPlaybackCursor,
  createPlaybackState,
  playbackFingerPositionKeys,
  playbackInputPreview,
  playbackPlannedKeys,
  playbackPlannedOrders,
  playbackRomajiPlan,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackOrderLabel,
  playbackStrokeAt,
  setPlaybackSpeed,
  stepPlayback,
  playbackTrailKeys,
  playbackTrailOrders,
  playbackStrokeDisplay,
  type PlaybackSpeed,
  type PlaybackState,
  PLAYBACK_SPEEDS,
} from './playback.ts';
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
import { QWERTY_LEGEND } from './geometry.ts';
import { kanaToRomaji } from './romaji/kunrei.ts';
import {
  allRomajiRules,
  defaultRomajiRuleId,
  formatOverrides,
  loadRomajiSettings,
  parseOverrides,
  ROMAJI_RULES,
  saveRomajiSettings,
  tableForRule,
  type BuiltinRomajiRuleId,
  type UserRomajiRule,
} from './romaji/rules.ts';
import {
  decodeLayoutFile,
  formatForFileName,
  importBenizara,
  importDvorakJ,
  importVial,
} from './layout-import.ts';
import { loadSelection, resolveSelection, saveSelection, type ModeId } from './layout-selection.ts';
import {
  classifyFaces,
  displayTriggerKeys,
  faceCells,
  foldedLayerCells,
  handOfKey,
  layerShiftStyles,
  type Layer,
  type LayerShiftStyle,
} from './layers.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  mode: $<HTMLSelectElement>('mode'),
  geometry: $<HTMLSelectElement>('geometry'),
  window: $<HTMLInputElement>('window'),
  windowOut: $<HTMLOutputElement>('window-out'),
  sfbHome: $<HTMLInputElement>('sfb-home'),
  sample: $<HTMLSelectElement>('sample'),
  text: $<HTMLTextAreaElement>('text'),
  textPanel: $<HTMLDetailsElement>('text-panel'),
  sensitivityPanel: $<HTMLDetailsElement>('sensitivity-panel'),
  textMeta: $<HTMLParagraphElement>('text-meta'),
  errors: $<HTMLParagraphElement>('errors'),
  compareChart: $<HTMLDivElement>('compare-chart'),
  compareBaseline: $<HTMLSelectElement>('compare-baseline'),
  compareChartMetric: $<HTMLSelectElement>('compare-chart-metric'),
  compare: $<HTMLTableElement>('compare'),
  sensitivity: $<HTMLDivElement>('sensitivity'),
  sensitivityScale: $<HTMLDivElement>('sensitivity-scale'),
  picker: $<HTMLDivElement>('layout-picker'),
  romajiSettings: $<HTMLButtonElement>('romaji-settings'),
  newName: $<HTMLInputElement>('new-name'),
  newRows: $<HTMLDivElement>('new-rows'),
  newRomaji: $<HTMLSelectElement>('new-romaji'),
  newError: $<HTMLParagraphElement>('new-error'),
  addLayout: $<HTMLButtonElement>('add-layout'),
  importLayout: $<HTMLInputElement>('import-layout'),
  importError: $<HTMLParagraphElement>('import-error'),
  importWarning: $<HTMLParagraphElement>('import-warning'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  playback: $<HTMLDivElement>('playback'),
  heatmap: $<HTMLDivElement>('heatmap'),
  gapFigure: $<HTMLDivElement>('gap-figure'),
  fingerChart: $<HTMLDivElement>('finger-chart'),
  adjacentChart: $<HTMLDivElement>('adjacent-chart'),
  fingerMatrix: $<HTMLDivElement>('finger-matrix'),
  pressMatrix: $<HTMLDivElement>('press-matrix'),
  adjacentMeanMatrix: $<HTMLDivElement>('adjacent-mean-matrix'),
  adjacentStdDevMatrix: $<HTMLDivElement>('adjacent-stddev-matrix'),
  howDialog: $<HTMLDialogElement>('how-dialog'),
  howOpen: $<HTMLButtonElement>('how-open'),
  howClose: $<HTMLButtonElement>('how-close'),
  romajiDialog: $<HTMLDialogElement>('romaji-dialog'),
  romajiForm: $<HTMLFormElement>('romaji-form'),
  romajiEdit: $<HTMLSelectElement>('romaji-edit'),
  romajiName: $<HTMLInputElement>('romaji-name'),
  romajiBase: $<HTMLSelectElement>('romaji-base'),
  romajiSokuon: $<HTMLInputElement>('romaji-sokuon'),
  romajiOverrides: $<HTMLTextAreaElement>('romaji-overrides'),
  romajiError: $<HTMLParagraphElement>('romaji-error'),
  romajiAssignments: $<HTMLDivElement>('romaji-assignments'),
  romajiVariants: $<HTMLDivElement>('romaji-variants'),
  romajiNew: $<HTMLButtonElement>('romaji-new'),
};

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

/** 図の軸に載せる短い指名。左右は塊のラベルで示す */
const SHORT_FINGER: Record<Finger, string> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

/**
 * 配列の識別色。色は一覧での位置に固定するので、選択を外しても残りの色は動かない。
 * スロットは8つで、自作配列を足して超えた分は巡回する（被って読みにくければ
 * 選択を外せばよい）。
 */
const PALETTE_SIZE = 8;
const SERIES = (i: number) => `var(--series-${(i % PALETTE_SIZE) + 1})`;

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

const selectedSample: Record<ModeId, SampleId> = { en: 'default', ja: 'modern' };

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

const MODES = {
  en: { get layouts() { return layoutsOf('en'); }, sample: SAMPLES.en.default },
  ja: { get layouts() { return layoutsOf('ja'); }, sample: SAMPLES.ja.modern },
};

/** 表示する配列のid。モードごとに覚える。保存値があればそれを使い、無ければ既定値 */
const storedSelection = loadSelection();
const selected: Record<ModeId, Set<string>> = {
  en: resolveSelection(storedSelection.en, INITIAL.en),
  ja: resolveSelection(storedSelection.ja, INITIAL.ja),
};

const currentModeId = () => el.mode.value as ModeId;
const currentMode = () => MODES[currentModeId()];
const currentSample = () => SAMPLES[currentModeId()][selectedSample[currentModeId()]] ?? currentMode().sample;

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
  el.sample.value = selectedSample[mode];
}

fillSampleOptions();
el.text.value = currentSample();

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

  fillRomajiSelect(el.newRomaji);

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
    saveSelection(selected);

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
      saveSelection(selected);
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

function fillRomajiSelect(select: HTMLSelectElement, selectedId = select.value) {
  select.replaceChildren();
  for (const rule of allRomajiRules(romajiSettings.rules)) {
    select.append(new Option(rule.name, rule.id));
  }
  if (selectedId && allRomajiRules(romajiSettings.rules).some((r) => r.id === selectedId)) {
    select.value = selectedId;
  }
}

function romajiEditorRule(id: string): UserRomajiRule | undefined {
  return romajiSettings.rules.find((rule) => rule.id === id);
}

function loadRomajiEditor(id: string) {
  if (!id) {
    el.romajiEdit.value = '';
    el.romajiName.value = '';
    el.romajiBase.value = 'kunrei';
    el.romajiSokuon.checked = true;
    el.romajiOverrides.value = '';
    el.romajiError.hidden = true;
    fillRomajiVariants();
    return;
  }
  const custom = romajiEditorRule(id);
  const builtin = !custom && id in ROMAJI_RULES
    ? ROMAJI_RULES[id as BuiltinRomajiRuleId]
    : undefined;
  if (!custom && !builtin) return;
  el.romajiEdit.value = id;
  el.romajiName.value = custom?.name ?? builtin?.name ?? '';
  const base = custom?.base ?? builtin?.base ?? 'kunrei';
  el.romajiBase.value = base;
  el.romajiSokuon.checked = base === 'azik'
    ? false
    : custom?.generateSokuon ?? builtin?.generateSokuon ?? true;
  el.romajiOverrides.value = formatOverrides(custom?.overrides ?? builtin?.overrides ?? {});
  el.romajiError.hidden = true;
  fillRomajiVariants();
}

function fillRomajiEditorRules(selectedId = el.romajiEdit.value || 'kunrei') {
  el.romajiEdit.replaceChildren();
  el.romajiEdit.append(new Option('新しい綴り', ''));
  for (const rule of allRomajiRules(romajiSettings.rules)) {
    el.romajiEdit.append(new Option(rule.name, rule.id));
  }
  const id = allRomajiRules(romajiSettings.rules).some((rule) => rule.id === selectedId)
    ? selectedId
    : 'kunrei';
  loadRomajiEditor(id);
}

interface RomajiVariant {
  kana: string;
  alternatives: string[];
}

/** タイピングアプリで設定されるかな。並びは標準的な設定画面に合わせ、順位は新サンプルで測る。 */
const ROMAJI_VARIANTS: RomajiVariant[] = [
  { kana: 'い', alternatives: ['i'] },
  { kana: 'う', alternatives: ['u'] },
  { kana: 'か', alternatives: ['ka'] },
  { kana: 'く', alternatives: ['ku'] },
  { kana: 'こ', alternatives: ['ko'] },
  { kana: 'し', alternatives: ['si', 'shi'] },
  { kana: 'せ', alternatives: ['se'] },
  { kana: 'ち', alternatives: ['ti', 'chi'] },
  { kana: 'つ', alternatives: ['tu', 'tsu'] },
  { kana: 'ふ', alternatives: ['hu', 'fu'] },
  { kana: 'ん', alternatives: ['n', 'nn'] },
  { kana: 'じ', alternatives: ['zi', 'ji'] },
  { kana: 'っ', alternatives: ['ltu', 'xtu'] },
  { kana: 'ぁ', alternatives: ['la', 'xa'] },
  { kana: 'ぃ', alternatives: ['li', 'xi'] },
  { kana: 'ぅ', alternatives: ['lu', 'xu'] },
  { kana: 'ぇ', alternatives: ['le', 'xe'] },
  { kana: 'ぉ', alternatives: ['lo', 'xo'] },
  { kana: 'ゃ', alternatives: ['lya', 'xya'] },
  { kana: 'ゅ', alternatives: ['lyu', 'xyu'] },
  { kana: 'ょ', alternatives: ['lyo', 'xyo'] },
  { kana: 'しゃ', alternatives: ['sha', 'sya'] },
  { kana: 'しゅ', alternatives: ['shu', 'syu'] },
  { kana: 'しぇ', alternatives: ['she', 'sye'] },
  { kana: 'しょ', alternatives: ['sho', 'syo'] },
  { kana: 'じゃ', alternatives: ['ja', 'zya'] },
  { kana: 'じゅ', alternatives: ['ju', 'zyu'] },
  { kana: 'じぇ', alternatives: ['je', 'zye'] },
  { kana: 'じょ', alternatives: ['jo', 'zyo'] },
  { kana: 'ちゃ', alternatives: ['tya', 'cha'] },
  { kana: 'ちゅ', alternatives: ['tyu', 'chu'] },
  { kana: 'ちょ', alternatives: ['tyo', 'cho'] },
  { kana: 'ちぃ', alternatives: ['tyi'] },
  { kana: 'うぃ', alternatives: ['wi'] },
  { kana: 'うぇ', alternatives: ['we'] },
];

function editorBaseTable(): Map<string, string> {
  const id = el.romajiEdit.value;
  const custom = romajiEditorRule(id);
  const builtin = !custom && id in ROMAJI_RULES
    ? ROMAJI_RULES[id as BuiltinRomajiRuleId]
    : undefined;
  const base = custom?.base ?? builtin?.base ?? el.romajiBase.value as BuiltinRomajiRuleId;
  return tableForRule(base, romajiSettings.rules);
}

function editorTable(): Map<string, string> {
  const table = editorBaseTable();
  const parsed = parseOverrides(el.romajiOverrides.value);
  for (const [kana, roman] of Object.entries(parsed.overrides)) table.set(kana, roman);
  return table;
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) count++;
  return count;
}

function signed(value: number): string {
  return value === 0 ? '±0' : value > 0 ? `+${value}` : String(value);
}

function fillRomajiVariants() {
  const table = editorTable();
  const text = SAMPLES.ja.modern;
  const rows = ROMAJI_VARIANTS.map((variant, index) => {
    const current = table.get(variant.kana) ?? kanaToRomaji(variant.kana, table);
    const count = countOccurrences(text, variant.kana);
    const effect = (variant.alternatives[0].length - current.length) * count;
    return { variant, current, count, effect, index };
  }).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.index - b.index);

  el.romajiVariants.replaceChildren();
  const listId = 'romaji-variant-options';
  const datalist = document.createElement('datalist');
  datalist.id = listId;
  for (const option of [...new Set(ROMAJI_VARIANTS.flatMap((variant) => variant.alternatives))]) {
    datalist.append(new Option(option));
  }
  el.romajiVariants.append(datalist);

  for (const { variant, current, count, effect } of rows) {
    const row = document.createElement('div');
    row.className = 'romaji-variant';
    const label = document.createElement('span');
    label.textContent = variant.kana;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.spellcheck = false;
    input.setAttribute('list', listId);
    input.dataset.kana = variant.kana;
    const meta = document.createElement('span');
    meta.className = 'romaji-variant-meta';
    meta.textContent = `候補 ${variant.alternatives.join(' / ')} / 出現 ${count} / 変更 ${signed(effect)} 打`;
    row.append(label, input, meta);

    if (variant.kana === 'ん') {
      const note = document.createElement('span');
      note.className = 'romaji-variant-note';
      note.hidden = input.value !== 'n';
      note.textContent = 'ん = nは、次が母音・な行・や行の時や語末では実際にはnnが必要です。この設定では区別できません。';
      row.append(note);
      input.addEventListener('input', () => { note.hidden = input.value.trim().toLowerCase() !== 'n'; });
    }

    input.addEventListener('input', () => {
      setVariantOverride(variant.kana, input.value);
    });
    el.romajiVariants.append(row);
  }
}

function setVariantOverride(kana: string, value: string) {
  const roman = value.trim().toLowerCase();
  const lines = el.romajiOverrides.value.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const equal = line.indexOf('=');
    return equal > 0 && line.slice(0, equal).trim() === kana;
  });
  if (!roman) {
    if (index >= 0) lines.splice(index, 1);
  } else if (index >= 0) {
    lines[index] = `${kana} = ${roman}`;
  } else {
    if (lines.length === 1 && lines[0].trim() === '') lines[0] = `${kana} = ${roman}`;
    else lines.push(`${kana} = ${roman}`);
  }
  el.romajiOverrides.value = lines.join('\n');
}

function fillRomajiAssignments() {
  el.romajiAssignments.replaceChildren();
  const rules = allRomajiRules(romajiSettings.rules);
  const builtinLayouts = LAYOUTS_JA.filter((l) => l.romajiTable);
  const addHeader = (text: string) => {
    const heading = document.createElement('h4');
    heading.textContent = text;
    el.romajiAssignments.append(heading);
  };
  const addAssignment = (nameText: string, layoutId: string, assigned: RomajiRuleId, save: (id: RomajiRuleId) => void) => {
    const label = document.createElement('label');
    label.className = 'romaji-assignment';
    const name = document.createElement('span');
    name.textContent = nameText;
    const select = document.createElement('select');
    for (const rule of rules) select.append(new Option(rule.name, rule.id));
    select.value = rules.some((rule) => rule.id === assigned)
      ? assigned
      : defaultRomajiRuleId(layoutId);
    select.addEventListener('change', () => {
      save(select.value);
      fillPicker();
      fillDetailOptions();
      render();
    });
    label.append(name, select);
    el.romajiAssignments.append(label);
  };

  addHeader('組み込み配列');
  for (const layout of builtinLayouts) {
    const assigned = romajiSettings.assignments[layout.id] ?? defaultRomajiRuleId(layout.id);
    addAssignment(layout.name, layout.id, assigned, (id) => {
      romajiSettings.assignments[layout.id] = id;
      saveRomajiSettings(romajiSettings);
    });
  }
  if (userLayouts.length > 0) addHeader('自作配列');
  for (const definition of userLayouts) {
    addAssignment(definition.name, definition.id, definition.romaji, (id) => {
      userLayouts = userLayouts.map((current) => current.id === definition.id
        ? { ...current, romaji: id }
        : current);
      saveUserLayouts(userLayouts);
      ROMAJI_TABLE_CACHE.clear();
    });
  }
}

function setupRomajiEditor() {
  el.romajiBase.replaceChildren(
    new Option('標準（j / sh / ch）', 'qwerty'),
    new Option('訓令式', 'kunrei'),
    new Option('大西式', 'oonishi'),
    new Option('AZIK', 'azik'),
  );
  fillRomajiEditorRules();
  fillRomajiAssignments();

  el.romajiSettings.addEventListener('click', () => {
    fillRomajiEditorRules();
    fillRomajiAssignments();
    el.romajiDialog.showModal();
  });
  el.romajiEdit.addEventListener('change', () => loadRomajiEditor(el.romajiEdit.value));
  el.romajiBase.addEventListener('change', () => {
    if (el.romajiBase.value === 'azik') el.romajiSokuon.checked = false;
  });
  el.romajiNew.addEventListener('click', () => {
    loadRomajiEditor('');
    el.romajiName.focus();
  });
  el.romajiForm.addEventListener('submit', (event) => {
    if ((event.submitter as HTMLButtonElement | null)?.value === 'cancel') return;
    event.preventDefault();
    const name = el.romajiName.value.trim();
    const parsed = parseOverrides(el.romajiOverrides.value);
    const errors = name ? parsed.errors : ['名前を入力する'];
    el.romajiError.textContent = errors.join(' / ');
    el.romajiError.hidden = errors.length === 0;
    if (errors.length) return;

    const id = el.romajiEdit.value && !((el.romajiEdit.value) in ROMAJI_RULES)
      ? el.romajiEdit.value
      : `custom-${Date.now().toString(36)}`;
    const rule: UserRomajiRule = {
      id,
      name,
      base: el.romajiBase.value as BuiltinRomajiRuleId,
      overrides: parsed.overrides,
      generateSokuon: el.romajiBase.value === 'azik' ? false : el.romajiSokuon.checked,
    };
    const index = romajiSettings.rules.findIndex((current) => current.id === id);
    if (index < 0) romajiSettings.rules = [...romajiSettings.rules, rule];
    else romajiSettings.rules = romajiSettings.rules.map((current, i) => i === index ? rule : current);
    ROMAJI_TABLE_CACHE.clear();
    saveRomajiSettings(romajiSettings);
    fillRomajiEditorRules(id);
    fillRomajiAssignments();
    fillRomajiSelect(el.newRomaji, el.newRomaji.value);
    fillPicker();
    fillDetailOptions();
    render();
  });
}

function removeUserLayout(id: string) {
  userLayouts = userLayouts.filter((l) => l.id !== id);
  saveUserLayouts(userLayouts);
  selected.en.delete(id);
  selected.ja.delete(id);
  saveSelection(selected);
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
      saveSelection(selected);
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
  const keep = el.detailLayout.value;
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

const TEXT_COLLAPSED_KEY = 'keydist:text-collapsed';

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

function setupTextPanel() {
  try {
    const saved = localStorage.getItem(TEXT_COLLAPSED_KEY);
    el.textPanel.open = saved === null
      ? !window.matchMedia('(max-width: 900px)').matches
      : saved !== 'true';
  } catch {
    el.textPanel.open = true;
  }
  el.textPanel.addEventListener('toggle', () => {
    try {
      localStorage.setItem(TEXT_COLLAPSED_KEY, String(!el.textPanel.open));
    } catch {
      // 保存できなくても、折りたたみ操作そのものは成立する
    }
  });
}

interface Result {
  layout: Layout;
  trace: Trace;
  metrics: Metrics;
  /** 一覧での位置。色はこれで決まるので、選択を外しても他の色は動かない */
  slot: number;
}

type AdjacentMatrixKind = 'adjacentMean' | 'adjacentStdDev';
type MatrixKind = 'press' | 'finger' | AdjacentMatrixKind;
const matrixSorts: Record<MatrixKind, MatrixSort | null> = {
  press: null,
  finger: null,
  adjacentMean: null,
  adjacentStdDev: null,
};
let compareSort: MatrixSort | null = null;
let compareChartColumn = 1;
let sensitivityDirty = true;
type LayerView = 'side-by-side' | 'tabs';
let layerView: LayerView | undefined;
let activeLayerTab = 0;
type LayerColorScale = 'linear' | 'log';
let layerColorScale: LayerColorScale = 'linear';
let naginataLayerDetail = false;

const PLAYBACK_KEY = 30;
const PLAYBACK_PAD = 6;
const PLAYBACK_THUMB_WIDTH = 1.9;
const PLAYBACK_SCALES = [1, 1.5, 2] as const;
type PlaybackScale = (typeof PLAYBACK_SCALES)[number];
let playbackState: PlaybackState = createPlaybackState();
let playbackTrace: Trace | undefined;
let playbackGeometry: ReturnType<typeof buildGeometry> | undefined;
let playbackLayout: Layout | undefined;
let playbackAnimationFrame: number | undefined;
let playbackLastTimestamp: number | undefined;
let playbackSeekWasPlaying: boolean | undefined;
let playbackShowFingers = false;
let playbackShowRomajiPlan = false;
let playbackShowPlanKeys = false;
let playbackShowTrail = false;
let playbackTrailTau = 5;
let playbackShowOrderLabels = false;
let playbackScale: PlaybackScale = 1.5;

function cancelPlaybackAnimation() {
  if (playbackAnimationFrame !== undefined) cancelAnimationFrame(playbackAnimationFrame);
  playbackAnimationFrame = undefined;
  playbackLastTimestamp = undefined;
}

function playbackLayerLabel(trace: Trace, stroke: Stroke | undefined): string {
  if (!stroke) return '開始前';
  return trace.layerDefinitions.find((definition) => definition.id === stroke.layerId)?.label ?? stroke.layerId;
}

function updatePlaybackView() {
  if (!playbackTrace || !playbackGeometry) return;
  const total = playbackTrace.strokes.length;
  const cursor = clampPlaybackCursor(playbackState.cursor, total);
  const stroke = playbackStrokeAt(playbackTrace.strokes, cursor);
  const display = playbackLayout && stroke ? playbackStrokeDisplay(playbackLayout, stroke) : undefined;
  const isRomaji = playbackLayout?.romajiTable !== undefined;
  const windowSize = Number(el.window.value);
  const activeKeys = new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []);
  const triggerKeys = new Set(stroke?.triggerKeys ?? []);
  const fingerPositionKeys = playbackShowFingers
    ? playbackFingerPositionKeys(stroke, playbackGeometry)
    : new Map<string, Finger>();
  const trailKeys = playbackShowTrail
    ? playbackTrailKeys(playbackTrace.strokes, cursor, playbackTrailTau)
    : new Map<string, number>();
  const romajiPlannedKeys = isRomaji && playbackShowRomajiPlan
    ? playbackRomajiPlannedKeys(playbackTrace.strokes, cursor)
    : new Map<string, number>();
  const plannedKeys = playbackShowPlanKeys
    ? playbackPlannedKeys(playbackTrace.strokes, cursor, windowSize)
    : romajiPlannedKeys;
  const plannedOrders = playbackShowOrderLabels
    ? playbackShowPlanKeys
      ? playbackPlannedOrders(playbackTrace.strokes, cursor, windowSize)
      : playbackRomajiPlannedOrders(playbackTrace.strokes, cursor)
    : new Map<string, number>();
  const trailOrders = playbackShowOrderLabels && playbackShowTrail
    ? playbackTrailOrders(playbackTrace.strokes, cursor, playbackTrailTau)
    : new Map<string, number>();

  for (const key of el.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    const id = key.dataset.playbackKey!;
    key.dataset.playbackActive = String(activeKeys.has(id));
    key.dataset.playbackTrigger = String(triggerKeys.has(id));
    key.dataset.playbackFingerPosition = fingerPositionKeys.get(id) ?? '';
    const trailOpacity = trailKeys.get(id);
    key.dataset.playbackTrail = trailOpacity === undefined ? 'false' : 'true';
    if (trailOpacity === undefined) key.style.removeProperty('--playback-trail-opacity');
    else key.style.setProperty('--playback-trail-opacity', String(trailOpacity));
    const plannedOpacity = plannedKeys.get(id);
    key.dataset.playbackPlan = plannedOpacity === undefined ? 'false' : 'true';
    if (plannedOpacity === undefined) key.style.removeProperty('--playback-plan-opacity');
    else key.style.setProperty('--playback-plan-opacity', String(plannedOpacity));
    const plannedOrder = plannedOrders.get(id);
    const plannedOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="plan"]');
    if (plannedOrderLabel) {
      plannedOrderLabel.textContent = plannedOrder === undefined ? '' : playbackOrderLabel(plannedOrder);
      plannedOrderLabel.setAttribute('visibility', plannedOrder === undefined ? 'hidden' : 'visible');
    }
    const trailOrder = trailOrders.get(id);
    const trailOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="trail"]');
    if (trailOrderLabel) {
      trailOrderLabel.textContent = trailOrder === undefined ? '' : playbackOrderLabel(trailOrder);
      trailOrderLabel.setAttribute('visibility', trailOrder === undefined ? 'hidden' : 'visible');
    }
    const label = key.querySelector<SVGTextElement>('[data-playback-label]');
    if (label) label.textContent = display?.keyLabels.get(id) ?? key.dataset.playbackBaseLabel ?? '';
  }

  const position = el.playback.querySelector<HTMLElement>('[data-playback-position]');
  const current = el.playback.querySelector<HTMLElement>('[data-playback-current]');
  const romaji = el.playback.querySelector<HTMLElement>('[data-playback-romaji]');
  const kana = el.playback.querySelector<HTMLElement>('[data-playback-kana]');
  const typed = el.playback.querySelector<HTMLElement>('[data-playback-typed]');
  const history = el.playback.querySelector<HTMLElement>('[data-playback-history]');
  const historyText = el.playback.querySelector<HTMLElement>('[data-playback-history-text]');
  const planned = el.playback.querySelector<HTMLElement>('[data-playback-planned]');
  const layer = el.playback.querySelector<HTMLElement>('[data-playback-layer]');
  const seek = el.playback.querySelector<HTMLInputElement>('[data-playback-seek]');
  const toggle = el.playback.querySelector<HTMLButtonElement>('[data-playback-action="toggle"]');
  const stop = el.playback.querySelector<HTMLButtonElement>('[data-playback-action="stop"]');
  const back = el.playback.querySelector<HTMLButtonElement>('[data-playback-action="back"]');
  const forward = el.playback.querySelector<HTMLButtonElement>('[data-playback-action="forward"]');
  const fingers = el.playback.querySelector<HTMLInputElement>('[data-playback-fingers]');
  const romajiPlan = el.playback.querySelector<HTMLInputElement>('[data-playback-romaji-plan]');
  const planKeys = el.playback.querySelector<HTMLInputElement>('[data-playback-plan-keys]');
  const trail = el.playback.querySelector<HTMLInputElement>('[data-playback-trail]');
  const trailTau = el.playback.querySelector<HTMLInputElement>('[data-playback-trail-tau]');
  const orderLabels = el.playback.querySelector<HTMLInputElement>('[data-playback-order-labels]');
  const scale = el.playback.querySelector<HTMLSelectElement>('select[data-playback-scale]');
  const playbackWindow = el.playback.querySelector<HTMLOutputElement>('[data-playback-window]');
  if (position) position.textContent = `${cursor} / ${total} ステップ`;
  if (current) {
    current.hidden = isRomaji;
    current.textContent = stroke
      ? display?.character ?? (stroke.triggerKeys.length > 0 ? '⇧' : stroke.char)
      : '—';
  }
  if (romaji) romaji.hidden = !isRomaji;
  if (kana) kana.textContent = stroke?.inputChar ?? '—';
  if (typed) typed.textContent = stroke?.char ?? '—';
  const plan = isRomaji && playbackShowRomajiPlan
    ? playbackRomajiPlan(playbackTrace.strokes, cursor)
    : undefined;
  if (planned) {
    planned.hidden = plan === undefined;
    planned.textContent = plan ? `予定: ${plan.planned}` : '';
  }
  const inputPreview = playbackInputPreview(
    playbackTrace.strokes,
    cursor,
    playbackShowPlanKeys ? windowSize : 0,
  );
  if (history) history.hidden = inputPreview.length === 0;
  if (historyText) {
    historyText.replaceChildren();
    for (const segment of inputPreview) {
      const span = document.createElement('span');
      span.className = `playback-input-segment playback-input-${segment.kind}`;
      span.textContent = segment.text;
      if (segment.kind === 'current') span.setAttribute('aria-current', 'step');
      historyText.append(span);
    }
  }
  if (layer) layer.textContent = playbackLayerLabel(playbackTrace, stroke);
  if (seek) seek.value = String(cursor);
  if (toggle) {
    toggle.textContent = playbackState.playing ? '一時停止' : '再生';
    toggle.setAttribute('aria-label', playbackState.playing ? '再生を一時停止する' : '再生する');
    toggle.disabled = total === 0 || cursor >= total;
  }
  if (stop) stop.disabled = cursor === 0 && !playbackState.playing;
  if (back) back.disabled = playbackState.playing || cursor === 0;
  if (forward) forward.disabled = playbackState.playing || cursor >= total;
  if (fingers) fingers.checked = playbackShowFingers;
  if (romajiPlan) {
    romajiPlan.checked = playbackShowRomajiPlan;
    romajiPlan.disabled = !isRomaji || playbackShowPlanKeys;
  }
  if (planKeys) {
    planKeys.checked = playbackShowPlanKeys;
    planKeys.disabled = isRomaji && playbackShowRomajiPlan;
  }
  if (trail) trail.checked = playbackShowTrail;
  if (trailTau) trailTau.value = String(playbackTrailTau);
  if (orderLabels) orderLabels.checked = playbackShowOrderLabels;
  if (scale) scale.value = String(playbackScale);
  if (playbackWindow) playbackWindow.textContent = String(windowSize);
}

function renderPlaybackSvg(layout: Layout, geometry: ReturnType<typeof buildGeometry>): string {
  let maxX = 0;
  let maxY = 0;
  const keys = [...geometry.keys.values()].map((key) => {
    const thumb = key.row === THUMB_ROW;
    const width = (thumb ? PLAYBACK_THUMB_WIDTH : 1) * PLAYBACK_KEY;
    const x = (key.x - (thumb ? (PLAYBACK_THUMB_WIDTH - 1) / 2 : 0)) * PLAYBACK_KEY;
    const y = key.y * PLAYBACK_KEY;
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + PLAYBACK_KEY);
    const label = layout.legends.get(key.id) ?? '';
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const tip = `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>${escapeText(FINGER_LABEL[key.finger])}`;
    return `<g data-tip="${escapeAttr(tip)}" data-playback-key="${escapeAttr(key.id)}" data-playback-finger="${key.finger}" data-playback-base-label="${escapeAttr(label)}" data-playback-active="false" data-playback-trigger="false" data-playback-finger-position="" data-playback-plan="false">
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" stroke="var(--line)"/>
      <text class="playback-order playback-order-plan" data-playback-order="plan" x="${x + 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-trail" data-playback-order="trail" x="${x + width - 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-key-label" data-playback-label x="${x + width / 2}" y="${y + PLAYBACK_KEY / 2 + 4}" text-anchor="middle" font-size="${fontSize}" fill="var(--fg)" pointer-events="none">${escapeText(label)}</text>
    </g>`;
  });
  const W = maxX + PLAYBACK_PAD;
  const H = maxY + PLAYBACK_PAD;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W * playbackScale}" height="${H * playbackScale}" role="img"
    aria-label="${escapeAttr(`${layout.name}の打鍵再生`)}">${keys.join('')}</svg>`;
}

function rerenderPlaybackFigure() {
  if (!playbackLayout || !playbackGeometry) return;
  const figure = el.playback.querySelector<HTMLElement>('.playback-figure');
  if (figure) figure.innerHTML = renderPlaybackSvg(playbackLayout, playbackGeometry);
}

function renderPlayback(trace: Trace, layout: Layout, geometry: ReturnType<typeof buildGeometry>) {
  cancelPlaybackAnimation();
  playbackTrace = trace;
  playbackGeometry = geometry;
  playbackLayout = layout;
  playbackState = createPlaybackState(playbackState.speed);
  playbackSeekWasPlaying = undefined;
  const speeds = PLAYBACK_SPEEDS.map((speed) =>
    `<option value="${speed}"${speed === playbackState.speed ? ' selected' : ''}>${speed}x</option>`,
  ).join('');
  const scales = PLAYBACK_SCALES.map((scale) =>
    `<option value="${scale}"${scale === playbackScale ? ' selected' : ''}>${scale}倍</option>`,
  ).join('');
  el.playback.innerHTML = `<details class="playback-panel">
    <summary><span class="playback-summary-icon" aria-hidden="true">▶</span><span>打鍵再生</span><span class="playback-summary-hint">クリックして開く</span></summary>
    <div class="playback-body">
      <div class="playback-head">
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-fingers${playbackShowFingers ? ' checked' : ''} />指の位置を色で表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-romaji-plan${playbackShowRomajiPlan ? ' checked' : ''} />予定ローマ字を表示</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-plan-keys${playbackShowPlanKeys ? ' checked' : ''} />押下予定キーを表示</label>
        <span class="playback-window-setting" title="サイドバーの窓幅Nと共通">N <output data-playback-window>${Number(el.window.value)}</output> ステップ</span>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-trail${playbackShowTrail ? ' checked' : ''} />押下履歴を残す</label>
        <label class="playback-range-setting" title="押下履歴を残すステップ数">τ <input type="number" data-playback-trail-tau min="1" max="20" step="1" value="${playbackTrailTau}" aria-label="押下履歴のステップ数" /> ステップ</label>
        <label class="playback-finger-toggle"><input type="checkbox" data-playback-order-labels${playbackShowOrderLabels ? ' checked' : ''} />順番ラベルを表示</label>
        <label class="playback-scale-setting" title="配列図の表示倍率">配列図 <select data-playback-scale aria-label="配列図の表示倍率">${scales}</select></label>
      </div>
      <div class="playback-controls" role="group" aria-label="打鍵再生の操作">
        <button type="button" class="ghost" data-playback-action="back">1 ステップ戻る</button>
        <button type="button" data-playback-action="toggle" aria-label="再生する">再生</button>
        <button type="button" class="secondary" data-playback-action="stop" disabled>停止</button>
        <button type="button" class="ghost" data-playback-action="forward">1 ステップ進む</button>
        <span class="playback-position" aria-live="polite" data-playback-position>0 / ${trace.strokes.length} ステップ</span>
        <label class="playback-speed"><span>速度</span><select data-playback-speed>${speeds}</select></label>
      </div>
      <label class="playback-seek"><span>再生位置</span><input type="range" data-playback-seek min="0" max="${trace.strokes.length}" step="1" value="0" /></label>
      <div class="playback-status" aria-live="polite">
        <div class="playback-status-line">
          <span class="playback-current" data-playback-current>—</span>
          <span class="playback-romaji" data-playback-romaji hidden><span class="playback-current" data-playback-kana>—</span><span class="playback-typed">打鍵: <code data-playback-typed>—</code><span class="playback-planned" data-playback-planned hidden></span></span></span>
          <span class="playback-attribution">帰属: <b data-playback-layer>開始前</b></span>
        </div>
        <div class="playback-history" data-playback-history hidden>
          <span class="playback-history-label">入力:</span>
          <span data-playback-history-text></span>
        </div>
      </div>
      <div class="fig-fixed playback-figure">${renderPlaybackSvg(layout, geometry)}</div>
    </div>
  </details>`;
  updatePlaybackView();
}

function startPlayback() {
  if (!playbackTrace || playbackState.cursor >= playbackTrace.strokes.length) return;
  cancelPlaybackAnimation();
  playbackState = { ...playbackState, playing: true, elapsedMs: 0 };
  updatePlaybackView();
  playbackAnimationFrame = requestAnimationFrame((timestamp) => playbackFrame(timestamp));
}

function pausePlayback() {
  cancelPlaybackAnimation();
  playbackState = { ...playbackState, playing: false };
  updatePlaybackView();
}

function stopPlayback() {
  cancelPlaybackAnimation();
  playbackState = createPlaybackState(playbackState.speed);
  updatePlaybackView();
}

function playbackFrame(timestamp: number) {
  playbackAnimationFrame = undefined;
  if (!playbackState.playing || !playbackTrace) return;
  if (playbackLastTimestamp === undefined) playbackLastTimestamp = timestamp;
  else {
    playbackState = advancePlayback(
      playbackState,
      timestamp - playbackLastTimestamp,
      playbackTrace.strokes.length,
    );
    playbackLastTimestamp = timestamp;
    updatePlaybackView();
  }
  if (playbackState.playing) playbackAnimationFrame = requestAnimationFrame((next) => playbackFrame(next));
  else playbackLastTimestamp = undefined;
}

function beginPlaybackSeek() {
  if (playbackSeekWasPlaying !== undefined) return;
  playbackSeekWasPlaying = playbackState.playing;
  if (playbackState.playing) pausePlayback();
}

function finishPlaybackSeek() {
  if (playbackSeekWasPlaying === undefined) return;
  const resume = playbackSeekWasPlaying;
  playbackSeekWasPlaying = undefined;
  if (resume) startPlayback();
}

function seekPlayback(value: string, playing = false) {
  if (!playbackTrace) return;
  playbackState = {
    ...playbackState,
    cursor: clampPlaybackCursor(Number(value), playbackTrace.strokes.length),
    elapsedMs: 0,
    playing,
  };
  updatePlaybackView();
}

function sortMatrixRows<T extends { cells: { value: number }[] }>(rows: T[], sort: MatrixSort | null): T[] {
  if (!sort) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const delta = a.row.cells[sort.column].value - b.row.cells[sort.column].value;
      return (sort.direction === 'asc' ? delta : -delta) || a.index - b.index;
    })
    .map(({ row }) => row);
}

function render() {
  const geometry = buildGeometry(el.geometry.value as GeometryKind);
  const options: Options = {
    windowSize: Number(el.window.value),
    sfbHomeCost: el.sfbHome.checked,
  };
  const text = el.text.value;
  el.windowOut.value = el.window.value;

  const set = selected[currentModeId()];
  const results: Result[] = currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((r) => set.has(r.layout.id))
    .map(({ layout, slot }) => {
      const trace = evaluate(text, layout, geometry, options);
      return { layout, trace, metrics: computeMetrics(trace, geometry), slot };
    });

  if (results.length === 0) {
    cancelPlaybackAnimation();
    playbackTrace = undefined;
    playbackGeometry = undefined;
    playbackLayout = undefined;
    el.playback.innerHTML = '';
    el.textMeta.textContent = '配列を1つ以上選ぶ';
    el.compareChart.innerHTML = '';
    syncCompareBaselineOptions([]);
    syncCompareChartOptions(false);
    el.compare.innerHTML = '';
    showSensitivityPlaceholder('配列を1つ以上選ぶ');
    el.heatmap.innerHTML = '';
    el.fingerChart.innerHTML = '';
    el.adjacentChart.innerHTML = '';
    el.fingerMatrix.innerHTML = '';
    el.pressMatrix.innerHTML = '';
    el.adjacentMeanMatrix.innerHTML = '';
    el.adjacentStdDevMatrix.innerHTML = '';
    el.errors.hidden = true;
    return;
  }

  // ステップ数と押下数は配列ごとに異なるので表に出す。ここは入力そのものの大きさだけ
  const parts = [`${[...text].length} 文字`];
  const skipped = results.filter((r) => r.trace.skipped > 0);
  if (skipped.length) {
    const worst = Math.max(...skipped.map((r) => r.trace.skipped));
    parts.push(`${skipped.length} 配列で最大 ${worst} 文字が打てない`);
  }
  el.textMeta.textContent = parts.join(' / ');

  const errors = results.flatMap((r) => r.trace.errors);
  el.errors.textContent = errors.length ? `配列定義の不備: ${errors.join(' / ')}` : '';
  el.errors.hidden = errors.length === 0;

  renderCompare(results);
  renderMatrices(results);
  if (el.sensitivityPanel.open) {
    renderSensitivity(text, geometry, options);
  } else {
    showSensitivityPlaceholder();
  }
  renderDetail(results, geometry);
}

const COMPARE_HEADERS = [
  'ステップ',
  '距離 [u]',
  '距離 [m]',
  '1打鍵 [u]',
  '1文字 [u]',
  'アクション/文字',
  '押下/文字',
  '同指連続',
  '同指連続率',
  '隣接指の平均 [u]',
];

const COMPARE_RELATIVE_HEADERS = [
  'ステップ比',
  '距離[u]比',
  '距離[m]比',
  '1打鍵[u]比',
  '1文字[u]比',
  'アクション/文字比',
  '押下/文字比',
  '同指連続比',
  '同指率比',
  '隣接指の平均比',
];

const COMPARE_FORMATS: Array<(value: number) => string> = [
  (value) => `${value}`,
  (value) => value.toFixed(0),
  (value) => value.toFixed(2),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => `${value}`,
  (value) => `${value.toFixed(1)}%`,
  (value) => value.toFixed(3),
];

interface CompareCell {
  value: number;
  display: string;
}

function compareMetricValues(metrics: Metrics): number[] {
  const adjacentMean = metrics.adjacent.reduce((a, b) => a + b.meanExcess, 0) / metrics.adjacent.length;
  return [
    metrics.strokes,
    metrics.totalUnits,
    metrics.totalMm / 1000,
    metrics.meanPerStroke,
    metrics.perCharUnits,
    metrics.perCharSteps,
    metrics.perCharPresses,
    metrics.sameFinger,
    (metrics.sameFinger / Math.max(1, metrics.strokes)) * 100,
    adjacentMean,
  ];
}

function relativePercent(value: number, baseline: number): number | null {
  if (baseline === 0) return value === 0 ? 100 : null;
  return (value / baseline) * 100;
}

function compareCell(
  value: number,
  baseline: number | null,
  format: (value: number) => string,
): CompareCell {
  if (baseline === null) return { value, display: format(value) };
  const ratio = relativePercent(value, baseline);
  return ratio === null
    ? { value: 0, display: '—' }
    : { value: ratio, display: `${ratio.toFixed(1)}%` };
}

function renderCompare(results: Result[]) {
  syncCompareBaselineOptions(results);
  const best = Math.min(...results.map((r) => r.metrics.totalUnits));
  const baseline = results.find((r) => r.layout.id === el.compareBaseline.value);
  const baselineValues = baseline ? compareMetricValues(baseline.metrics) : null;

  const compareRows = results.map((r) => {
    const values = compareMetricValues(r.metrics);
    const cells = values.map((value, column) => compareCell(
      value,
      baselineValues ? baselineValues[column] : null,
      COMPARE_FORMATS[column],
    ));
    return { result: r, cells };
  });

  const sortedRows = sortMatrixRows(compareRows, compareSort);
  syncCompareChartOptions(baseline !== undefined);
  const chartBest = Math.min(...sortedRows.map((row) => row.cells[compareChartColumn].value));
  const chartRelative = baseline !== undefined;
  const chartLabel = compareLabel(COMPARE_HEADERS[compareChartColumn], chartRelative, compareChartColumn);
  el.compareChart.innerHTML = barChart(
    sortedRows.map(({ result: r, cells }) => ({
      label: r.layout.name,
      value: cells[compareChartColumn].value,
      valueLabel: cells[compareChartColumn].display,
      color: SERIES(r.slot),
      emphasise: cells[compareChartColumn].value === chartBest,
      tip: `${escapeText(r.layout.name)}<br>${escapeText(chartLabel)} <b>${cells[compareChartColumn].display}</b>`,
    })),
    {
      format: chartRelative ? (value) => `${value.toFixed(1)}%` : COMPARE_FORMATS[compareChartColumn],
      labelWidth: 150,
    },
  );

  const rows = sortedRows
    .map(({ result: r, cells }) => `<tr${r.metrics.totalUnits === best ? ' class="best"' : ''}>
      <td><span class="swatch" style="background:${SERIES(r.slot)}"></span>${escapeText(r.layout.name)}</td>
      ${cells.map((cell) => `<td class="num">${cell.display}</td>`).join('')}
    </tr>`)
    .join('');

  el.compare.innerHTML = `
    <thead><tr>
      <th>配列</th>${COMPARE_HEADERS.map((label, column) => compareHeader(label, column, baseline !== undefined)).join('')}
    </tr></thead><tbody>${rows}</tbody>`;
}

function syncCompareBaselineOptions(results: Result[]) {
  const current = el.compareBaseline.value;
  el.compareBaseline.replaceChildren(new Option('比較なし', ''));
  for (const result of results) {
    el.compareBaseline.add(new Option(result.layout.name, result.layout.id));
  }
  el.compareBaseline.value = results.some((r) => r.layout.id === current) ? current : '';
}

function compareLabel(label: string, relative: boolean, column: number): string {
  return relative ? COMPARE_RELATIVE_HEADERS[column] : label;
}

function syncCompareChartOptions(relative: boolean) {
  if (compareChartColumn < 0 || compareChartColumn >= COMPARE_HEADERS.length) compareChartColumn = 1;
  el.compareChartMetric.replaceChildren();
  for (let column = 0; column < COMPARE_HEADERS.length; column++) {
    el.compareChartMetric.add(new Option(
      compareLabel(COMPARE_HEADERS[column], relative, column),
      String(column),
    ));
  }
  el.compareChartMetric.value = String(compareChartColumn);
}

/** data-tipを持つ補足ボタン。tipが無い列では何も出さない */
function infoButton(tip: string | undefined): string {
  if (!tip) return '';
  const attr = escapeAttr(tip);
  return `<button type="button" class="info" data-tip="${attr}" aria-label="${attr}">i</button>`;
}

/** 列ごとの補足。指標の定義だけを書き、良し悪しの解釈は書かない */
const COMPARE_HEADER_TIPS: Record<number, string> = {
  7: '同じ指で違うキーを続けて打った回数。',
};

function compareHeader(label: string, column: number, relative: boolean): string {
  const active = compareSort?.column === column ? compareSort.direction : undefined;
  const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
  const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
  const shownLabel = compareLabel(label, relative, column);
  return `<th><span class="table-sort" data-compare-sort="${column}" role="button" tabindex="0"
    aria-label="${escapeAttr(`${shownLabel}で配列を並べ替え`)}" aria-sort="${ariaSort}"
    title="クリックごとに昇順・降順・選択順へ切り替える">${escapeText(shownLabel)}${marker}</span>${infoButton(COMPARE_HEADER_TIPS[column])}</th>`;
}

/**
 * 配列 × 指の粒度でマトリックスに並べる。行は総移動距離の表と同じ選択順
 * （色のスロットが他の図と揃うことを優先し、総距離順の並べ替えはしない）。
 *
 * 指ごとの移動距離は入力文字数で正規化する（u/文字）。生のuは評価テキストの
 * 長さに引きずられるため、テキストを変えても配列間の比較が揺れないようにする。
 * 隣接指の統計はもともと打鍵ごとの値なので文字数に依存しない。選択中の指標を
 * そのまま表示し、詳細チャートと同じ指標を使う。
 */
function renderMatrices(results: Result[]) {
  const fingerRows = sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: FINGERS.map((f) => {
      const perChar = r.metrics.perFinger[f] / Math.max(1, r.metrics.inputChars);
      const share = (r.metrics.perFinger[f] / Math.max(1e-9, r.metrics.totalUnits)) * 100;
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} u/文字</b> (全体の ${share.toFixed(1)}%)`,
      };
    }),
  })), matrixSorts.finger);

  el.fingerMatrix.innerHTML = matrixChart(
    fingerRows,
    FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 4,
      columnGroupLabels: ['左手', '右手'],
      sort: matrixSorts.finger ?? undefined,
    },
  );

  // 押下数は親指も含めた10本で出す。親指の移動距離は定義上0なので距離の面からは
  // 省いてあるが、押下は現に起きている（薙刀式の右親指など）。距離の面だけを見て
  // 「この指を使っていない」と読まれるのを防ぐため、ここは0の列も含めて全部並べる。
  const pressRows = sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: ALL_FINGERS.map((f) => {
      const perChar = r.metrics.perFingerPresses[f] / Math.max(1, r.metrics.inputChars);
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} 押下/文字</b><br>` +
          `押下 <b>${r.metrics.perFingerPresses[f]}</b> 回`,
      };
    }),
  })), matrixSorts.press);

  el.pressMatrix.innerHTML = matrixChart(
    pressRows,
    ALL_FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 5,
      columnGroupLabels: ['左手', '右手'],
      sort: matrixSorts.press ?? undefined,
    },
  );

  const adjacentColumns = ADJACENT_PAIRS.map((p) => `${SHORT_FINGER[p[0]]}–${SHORT_FINGER[p[1]]}`);
  const adjacentChartOptions = {
    format: (v: number) => v.toFixed(3),
    labelWidth: 190,
    columnSplit: 3,
    columnGroupLabels: ['左手', '右手'] as [string, string],
    // 隣接指の指標は0.02〜0.6の狭い帯に固まる。0起点だと全セルが薄くなって差が読めない
    colorBase: 'min' as const,
  };
  el.adjacentMeanMatrix.innerHTML = matrixChart(
    adjacentRows(results, 'adjacentMean'),
    adjacentColumns,
    { ...adjacentChartOptions, sort: matrixSorts.adjacentMean ?? undefined },
  );
  el.adjacentStdDevMatrix.innerHTML = matrixChart(
    adjacentRows(results, 'adjacentStdDev'),
    adjacentColumns,
    { ...adjacentChartOptions, sort: matrixSorts.adjacentStdDev ?? undefined },
  );
}

function adjacentRows(results: Result[], kind: AdjacentMatrixKind) {
  return sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: r.metrics.adjacent.map((s) => ({
      value: kind === 'adjacentStdDev' ? s.stdDev : s.meanExcess,
      tip:
        `${escapeText(r.layout.name)} / ${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `超過の平均 <b>${s.meanExcess.toFixed(3)} u</b><br>` +
        `超過の実測最大 <b>${s.maxExcess.toFixed(3)} u</b><br>` +
        `標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
  })), matrixSorts[kind]);
}

function cycleMatrixSort(kind: MatrixKind, column: number) {
  const current = matrixSorts[kind];
  matrixSorts[kind] =
    !current || current.column !== column
      ? { column, direction: 'asc' }
      : current.direction === 'asc'
        ? { column, direction: 'desc' }
        : null;
  render();
}

function bindMatrixSort(root: HTMLElement, kind: MatrixKind) {
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-matrix-sort]');
    if (target) cycleMatrixSort(kind, Number(target.getAttribute('data-matrix-sort')));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest('[data-matrix-sort]');
    if (!target) return;
    e.preventDefault();
    cycleMatrixSort(kind, Number(target.getAttribute('data-matrix-sort')));
  });
}

function cycleCompareSort(column: number) {
  compareChartColumn = column;
  compareSort =
    !compareSort || compareSort.column !== column
      ? { column, direction: 'asc' }
      : compareSort.direction === 'asc'
        ? { column, direction: 'desc' }
        : null;
  render();
}

function bindCompareSort(root: HTMLElement) {
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-compare-sort]');
    if (target) cycleCompareSort(Number(target.getAttribute('data-compare-sort')));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest('[data-compare-sort]');
    if (!target) return;
    e.preventDefault();
    cycleCompareSort(Number(target.getAttribute('data-compare-sort')));
  });
}

/**
 * 相対はN=0を100%とした減り方、絶対はそのままの総移動距離。
 * 相対は傾きの比較に、絶対は配列間の差の比較に効く。
 */
type SensitivityScale = 'relative' | 'absolute';
let sensitivityScale: SensitivityScale = 'relative';

function showSensitivityPlaceholder(message = 'N感度はパネルを開くと計算します') {
  el.sensitivity.innerHTML = `<p class="note">${message}</p>`;
  sensitivityDirty = true;
}

function renderSensitivity(
  text: string,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
) {
  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const relative = sensitivityScale === 'relative';
  const set = selected[currentModeId()];
  const series = currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((s) => set.has(s.layout.id))
    .map(({ layout, slot }) => {
    const points = nSensitivity(text, layout, geometry, options, range);
    const base = points[0].totalUnits || 1;
    return {
      name: layout.name,
      color: SERIES(slot),
      points: points.map((p) => ({
        x: p.windowSize,
        y: relative ? (p.totalUnits / base) * 100 : p.totalUnits,
        // 絶対表示ではy自身が生値なので併記しない
        raw: relative ? p.totalUnits : undefined,
      })),
    };
  });
  // Nを増やしても候補集合が広がるだけで距離は減る一方なので、相対値は100%を超えない。
  // 上端を100%に固定して、自動調整で105%のような目盛りが出るのを防ぐ
  el.sensitivity.innerHTML = relative
    ? lineChart(series, range, (v) => `${v.toFixed(0)}%`, { yMax: 100 })
    : lineChart(series, range, (v) => `${v.toFixed(0)} u`);
  sensitivityDirty = false;
}

function renderDetail(results: Result[], geometry: ReturnType<typeof buildGeometry>) {
  const found = results.find((r) => r.layout.id === el.detailLayout.value) ?? results[0];
  const { metrics, layout } = found;

  renderPlayback(found.trace, layout, geometry);
  renderHeatmap(metrics, layout, geometry);

  const total = metrics.totalUnits || 1;
  // 並び順が手の左右と一致するよう、左小指から右小指へ横に並べる
  el.fingerChart.innerHTML = columnChart(
    FINGERS.map((f) => ({
      label: SHORT_FINGER[f],
      group: f[0] === 'L' ? '左手' : '右手',
      value: metrics.perFinger[f],
      tip: `${FINGER_LABEL[f]}<br>移動 <b>${metrics.perFinger[f].toFixed(1)} u</b>` +
        ` (全体の ${((metrics.perFinger[f] / total) * 100).toFixed(1)}%)<br>` +
        `押下 <b>${metrics.perFingerPresses[f]}</b> 回` +
        ` (${((metrics.perFingerPresses[f] / Math.max(1, metrics.presses)) * 100).toFixed(1)}%)`,
    })),
    { format: (v) => v.toFixed(0) },
  );

  el.adjacentChart.innerHTML = columnChart(
    metrics.adjacent.map((s) => ({
      label: `${SHORT_FINGER[s.pair[0]]}–${SHORT_FINGER[s.pair[1]]}`,
      group: s.pair[0][0] === 'L' ? '左手' : '右手',
      value: s.stdDev,
      tip: `${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `超過の平均 <b>${s.meanExcess.toFixed(3)} u</b><br>` +
        `超過の実測最大 <b>${s.maxExcess.toFixed(3)} u</b><br>` +
        `標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
    { format: (v) => v.toFixed(3) },
  );
}

function triggerKeyText(key: string, legends: Map<string, string>): string {
  const resolved = resolveKeyId(key);
  return resolved === THUMB_KEY.LT || resolved === THUMB_KEY.RT
    ? legends.get(resolved) ?? resolved
    : resolved;
}

function triggerText(face: Layer['faces'][number], legends: Map<string, string>): string {
  return face.trigger.map((key) => triggerKeyText(key, legends)).join(' + ');
}

function isNaginataCenterShift(layout: Layout, face: Layer['faces'][number]): boolean {
  return layout.id === 'naginata-v18' && displayTriggerKeys(layout, face).length === 2;
}

function displayTriggerText(layout: Layout, face: Layer['faces'][number]): string {
  if (isNaginataCenterShift(layout, face)) return '左右のSpace';
  return displayTriggerKeys(layout, face)
    .map((key) => triggerKeyText(key, layout.legends))
    .join(' + ');
}

function triggerHandText(face: Layer['faces'][number]): string {
  const hands = new Set(face.trigger.map(handOfKey).filter((hand): hand is NonNullable<typeof hand> => hand !== undefined));
  if (hands.size !== 1) return '両手';
  return hands.has('left') ? '左手' : '右手';
}

function displayTriggerAnnotation(layout: Layout, face: Layer['faces'][number]): string {
  if (isNaginataCenterShift(layout, face)) return 'SandS';
  return `${triggerHandText(face)} ${displayTriggerText(layout, face)}を押す`;
}

function displayLayerLegend(layout: Layout, key: string, label: string): string {
  const resolved = resolveKeyId(key);
  return layout.id === 'naginata-v18' && (resolved === THUMB_KEY.LT || resolved === THUMB_KEY.RT)
    ? 'Space'
    : label;
}

function layerTitle(layer: Layer, index: number, layout: Layout): string {
  if (layer.faces.length === 0) return `レイヤー ${index + 1}: 単打`;
  const triggers = layer.faces
    .filter((face) => face.trigger.length > 0)
    .map((face) => displayTriggerText(layout, face));
  if (triggers.length === 0) return `レイヤー ${index + 1}: 単打`;
  const names = [...new Set(layer.faces.map((face) => face.layer).filter((name): name is string => name !== undefined))];
  const name = names.length === 1
    ? names[0]
    : layer.faces.some((face) => isNaginataCenterShift(layout, face)) ? 'SandS' : 'シフト';
  const modes = [...new Set(layer.faces.map((face) => face.mode))]
    .map((mode) => mode === 'simultaneous' ? '同時' : mode === 'prefix' ? '前置' : '後置')
    .join(' / ');
  return `レイヤー ${index + 1}: ${name} [${triggers.join(' / ')}]・${modes}`;
}

interface LayerCell {
  label: string;
  annotation?: string;
}

function layerCells(layer: Layer, layout: Layout): Map<string, LayerCell> {
  if (layer.faces.length === 0) {
    return new Map([...layout.legends].map(([key, label]) => [key, {
      label: displayLayerLegend(layout, key, label),
    }]));
  }

  const cells = new Map<string, LayerCell>();
  const labels = foldedLayerCells(layer, layout.faces ?? []);
  for (const face of layer.faces) {
    const annotation = face.trigger.length > 0
      ? displayTriggerAnnotation(layout, face)
      : undefined;
    for (const [key, label] of faceCells(face)) {
      const previous = cells.get(key);
      cells.set(key, previous
        ? { label: `${previous.label} / ${label}`, annotation: previous.annotation ?? annotation }
        : { label, annotation });
    }
  }
  for (const [key, label] of labels) {
    if (!cells.has(key)) cells.set(key, { label });
  }
  return cells;
}

interface HeatmapValues {
  keyCounts: ReadonlyMap<string, number>;
  /** 色の濃淡専用。ツールチップにはkeyCountsの実測値を使う。 */
  colorCounts: ReadonlyMap<string, number>;
  keyDistance: ReadonlyMap<string, number>;
  maxCount: number;
  colorScale: LayerColorScale;
  showHeat: boolean;
  ariaSuffix: string;
}

function heatIntensity(count: number, maxCount: number, scale: LayerColorScale): number {
  if (scale === 'log') {
    return Math.log1p(count) / Math.log1p(Math.max(1, maxCount));
  }
  return count / Math.max(1, maxCount);
}

function renderLayerSvg(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  layer: Layer,
  title: string,
  allLayerFaces: readonly Face[],
  faceShiftStyles: ReadonlyMap<Face, LayerShiftStyle>,
  values: HeatmapValues,
): string {
  const labels = layerCells(layer, layout);
  const showHeat = values.showHeat;
  const triggerFaces = layer.faces.length === 0 ? allLayerFaces : layer.faces;
  const shiftStyles = new Map<string, LayerShiftStyle>();
  for (const face of triggerFaces) {
    const style = faceShiftStyles.get(face);
    if (!style) continue;
    for (const trigger of displayTriggerKeys(layout, face)) {
      if (handOfKey(trigger)) shiftStyles.set(resolveKeyId(trigger), style);
    }
  }
  const max = values.maxCount;
  // 隣に並ぶマトリックス（セル54×24）と同じくらいの密度に合わせる。
  // 図は実寸で置くので、この値がそのまま画面上のキーの大きさになる
  const KEY = 30;
  const PAD = 6;
  const THUMB_W = 1.9;
  let maxX = 0;
  let maxY = 0;

  const keys = [...geometry.keys.values()].map((key) => {
    const count = values.keyCounts.get(key.id) ?? 0;
    const colorCount = values.colorCounts.get(key.id) ?? 0;
    const t = heatIntensity(colorCount, max, values.colorScale);
    const thumb = key.row === THUMB_ROW;
    const w = (thumb ? THUMB_W : 1) * KEY;
    const x = (key.x - (thumb ? (THUMB_W - 1) / 2 : 0)) * KEY;
    const y = key.y * KEY;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + KEY);
    const cell = labels.get(key.id);
    const label = cell?.label ?? '';
    const annotation = cell?.annotation;
    const shiftStyle = shiftStyles.get(key.id);
    const share = ((count / Math.max(1, metrics.presses)) * 100).toFixed(1);
    const distance = values.keyDistance.get(key.id) ?? 0;
    const shiftTip = shiftStyle
      ? `<br><b>${layout.id === 'naginata-v18' && (key.id === THUMB_KEY.LT || key.id === THUMB_KEY.RT)
        ? `SandS（レイヤー ${shiftStyle.layerIndex}）`
        : `レイヤー ${shiftStyle.layerIndex} のシフトトリガー`}</b>`
      : '';
    const annotationText = annotation ? `<br>${escapeText(annotation)}` : '';
    const tip = showHeat
      ? `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>` +
        `<b>${count}</b> 打 (${share}%)<br>移動 <b>${distance.toFixed(1)} u</b>` +
        annotationText + shiftTip
      : `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span>` +
        annotationText + shiftTip;
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const text = `<text x="${x + w / 2}" y="${y + KEY / 2 + 4}" text-anchor="middle"
        font-size="${fontSize}" fill="${showHeat && t > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}"
        pointer-events="none">${escapeText(label)}</text>`;
    // 隣り合う面が地色で2px離れるよう、キー矩形は内側に1px詰める
    const fill = showHeat
      ? `color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))`
      : 'var(--panel)';
    return `<g data-tip="${escapeAttr(tip)}">
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${KEY - 2}" rx="5"
        fill="${fill}" stroke="${shiftStyle ? `var(--series-${shiftStyle.colorSlot})` : 'var(--line)'}"
        stroke-width="${shiftStyle ? 3 : 1}"/>
      ${text}
    </g>`;
  });

  // 実寸を属性で持たせ、CSS側（.fig-fixed）で引き伸ばさずに置く
  const W = maxX + PAD;
  const H = maxY + PAD;
  const caption = showHeat ? `${title}・打鍵頻度` : title;
  const ariaLabel = `${caption}${values.ariaSuffix}`;
  return `<figure class="layer-diagram" style="width:${W}px">
    <figcaption>${escapeText(caption)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="${escapeAttr(ariaLabel)}">${keys.join('')}</svg>
  </figure>`;
}

function renderComboTable(combos: readonly Face[], legends: Map<string, string>): string {
  if (combos.length === 0) return '';
  const rows = combos.map((face) => {
    const outputs = [...faceCells(face).values()].join(' / ');
    return `<tr><td>${escapeText(triggerText(face, legends))}</td><td>${escapeText(outputs)}</td></tr>`;
  }).join('');
  return `<details class="combo-table collapsible-list">
    <summary>コンボ（${combos.length}）</summary>
    <div class="scroll-x"><table>
      <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </details>`;
}

function renderModifierList(modifiers: readonly Layer[], legends: Map<string, string>): string {
  if (modifiers.length === 0) return '';
  const rows = modifiers.map((layer) => {
    const names = [...new Set(layer.faces.map((face) => face.layer).filter((name): name is string => name !== undefined))];
    const triggers = layer.faces.map((face) => triggerText(face, legends)).join(' / ');
    const title = names.length === 1 ? `${names[0]}: ${triggers}` : triggers;
    const outputs = layer.faces.flatMap((face) => [...faceCells(face).values()]).join(' / ');
    return `<tr><td>${escapeText(title)}</td><td>${escapeText(outputs)}</td></tr>`;
  }).join('');
  return `<details class="modifier-list collapsible-list">
    <summary>修飾（${modifiers.length}）</summary>
    <div class="scroll-x"><table>
      <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </details>`;
}

function layerIdForFace(layout: Layout, face: Face): string {
  const known = layout.faceLayerIds?.get(face);
  if (known) return known;
  const index = layout.faces?.indexOf(face) ?? -1;
  if (face.trigger.length > 1) return COMBO_LAYER_ID;
  return face.layer === undefined ? `face:${index}` : `layer:${face.layer}`;
}

function orderedLayers(groups: ReturnType<typeof classifyFaces>, layout: Layout): Layer[] {
  return [...groups.layers, ...groups.modifiers]
    .sort((first, second) => {
      const firstIndex = Math.min(...first.faces.map((face) => layout.faces?.indexOf(face) ?? Number.MAX_SAFE_INTEGER));
      const secondIndex = Math.min(...second.faces.map((face) => layout.faces?.indexOf(face) ?? Number.MAX_SAFE_INTEGER));
      return firstIndex - secondIndex;
    });
}

interface LayerViewEntry {
  layer: Layer;
  title: string;
  stat: LayerStat;
}

function emptyLayerStat(id: string, label: string): LayerStat {
  return {
    id,
    label,
    presses: 0,
    keyCounts: new Map(),
    keyDistance: new Map(),
    triggerKeyCounts: new Map(),
    pairedTriggerKeyCounts: new Map(),
  };
}

function mergeLayerStats(id: string, label: string, stats: readonly LayerStat[]): LayerStat {
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const triggerKeyCounts = new Map<string, number>();
  const pairedTriggerKeyCounts = new Map<string, number>();
  let presses = 0;
  for (const stat of stats) {
    presses += stat.presses;
    for (const [key, count] of stat.keyCounts) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + count);
    }
    for (const [key, distance] of stat.keyDistance) {
      keyDistance.set(key, (keyDistance.get(key) ?? 0) + distance);
    }
    for (const [key, count] of stat.triggerKeyCounts) {
      triggerKeyCounts.set(key, (triggerKeyCounts.get(key) ?? 0) + count);
    }
    for (const [key, count] of stat.pairedTriggerKeyCounts) {
      pairedTriggerKeyCounts.set(key, (pairedTriggerKeyCounts.get(key) ?? 0) + count);
    }
  }
  return { id, label, presses, keyCounts, keyDistance, triggerKeyCounts, pairedTriggerKeyCounts };
}

function layerViewEntries(metrics: Metrics, layout: Layout, layers: readonly Layer[]): LayerViewEntry[] {
  const stats = new Map(metrics.layers.map((stat) => [stat.id, stat]));
  const entries = layers.map((layer, index) => {
    const id = layer.faces.length > 0 ? layerIdForFace(layout, layer.faces[0]) : SINGLE_LAYER_ID;
    const title = layerTitle(layer, index, layout);
    return {
      layer,
      title,
      stat: stats.get(id) ?? emptyLayerStat(id, title),
    };
  });
  if (layout.id !== 'naginata-v18' || naginataLayerDetail || entries.length <= 2) return entries;

  const base = entries[0];
  const center = entries[1];
  const rest = entries.slice(2);
  return [
    {
      ...base,
      title: `${base.title}（レイヤー3以降を合算）`,
      stat: mergeLayerStats('naginata-default', `${base.title}（レイヤー3以降を合算）`, [
        base.stat,
        ...rest.map((entry) => entry.stat),
      ]),
    },
    center,
  ];
}

function renderLayerStats(
  metrics: Metrics,
  entries: readonly LayerViewEntry[],
  hasCombos: boolean,
): string {
  const total = metrics.presses;
  const rows = entries.map(({ title, stat }) => {
    const presses = stat.presses;
    const share = total ? (presses / total) * 100 : 0;
    return `<tr><th scope="row">${escapeText(title)}</th>` +
      `<td class="num">${presses}</td><td class="num">${share.toFixed(1)}%</td></tr>`;
  }).join('');
  const comboRow = hasCombos
    ? `<tr><th scope="row">コンボ計</th><td class="num">${metrics.comboPresses}</td>` +
      `<td class="num">${total ? ((metrics.comboPresses / total) * 100).toFixed(1) : '0.0'}%</td></tr>`
    : '';
  return `<details class="layer-stats collapsible-list">
    <summary>帰属先（${entries.length + (hasCombos ? 1 : 0)}）</summary>
    <div class="scroll-x"><table><thead><tr><th>帰属先</th><th>押下数</th><th>割合</th></tr></thead>
    <tbody>${rows}${comboRow}</tbody></table></div>
    <p class="note">層とコンボの押下数の合計: ${metrics.layers.reduce((sum, stat) => sum + stat.presses, 0) + metrics.comboPresses} / 総押下数: ${metrics.presses}</p>
  </details>`;
}

function renderHeatmap(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
) {
  const faces = layout.faces ?? [];
  const groups = classifyFaces(faces);
  const layers = orderedLayers(groups, layout);
  if (layers.length === 0) layers.push({ faces: [] });
  const entries = layerViewEntries(metrics, layout, layers);
  if (activeLayerTab >= entries.length) activeLayerTab = 0;
  const titles = entries.map((entry) => entry.title);
  const allLayerFaces = layers.flatMap((layer) => layer.faces);
  const displayLayers = entries.map((entry) => entry.layer);
  const faceShiftStyles = layerShiftStyles(displayLayers);
  const shiftLayers = entries
    .map((entry, index) => ({
      layer: entry.layer,
      index,
      style: entry.layer.faces
        .map((face) => faceShiftStyles.get(face))
        .find((style): style is LayerShiftStyle => style !== undefined),
    }))
    .filter((entry): entry is { layer: Layer; index: number; style: LayerShiftStyle } => entry.style !== undefined);
  const shiftLegend = shiftLayers.length > 0
    ? `<div class="shift-key-legend" aria-label="シフトキーの枠色">
        ${shiftLayers.map(({ layer, index, style }) => {
          const label = layer.faces.some((face) => isNaginataCenterShift(layout, face))
            ? 'SandS'
            : 'シフト';
          return `<span class="shift-key-swatch" style="--shift-color:var(--series-${style.colorSlot})">レイヤー ${index + 1} の${label}</span>`;
        }).join('')}
      </div>`
    : '';
  const selectedLayerView = layerView ?? (entries.length <= 5 ? 'side-by-side' : 'tabs');
  const colorScaleControls = `<div class="layer-view-controls" role="group" aria-label="層別ヒートマップの色の尺度">
      <span>色の尺度</span>
      <button type="button" class="ghost" data-layer-color-scale="linear" aria-pressed="${layerColorScale === 'linear'}">線形</button>
      <button type="button" class="ghost" data-layer-color-scale="log" aria-pressed="${layerColorScale === 'log'}">対数</button>
    </div>`;
  const naginataControls = layout.id === 'naginata-v18' && layers.length > 2
    ? `<div class="layer-view-controls" role="group" aria-label="薙刀式のレイヤー表示">
        <span>薙刀式の表示</span>
        <button type="button" class="ghost" data-naginata-layer-detail="false" aria-pressed="${!naginataLayerDetail}">2面にまとめる</button>
        <button type="button" class="ghost" data-naginata-layer-detail="true" aria-pressed="${naginataLayerDetail}">全レイヤー詳細</button>
      </div>`
    : '';
  const controls = entries.length > 1
    ? `<div class="layer-view-controls" role="group" aria-label="レイヤーの表示方法">
        <span>レイヤーの表示</span>
        <button type="button" class="ghost" data-layer-view="side-by-side" aria-pressed="${selectedLayerView === 'side-by-side'}">並置</button>
        <button type="button" class="ghost" data-layer-view="tabs" aria-pressed="${selectedLayerView === 'tabs'}">タブ</button>
      </div>`
    : '';
  const commonMax = Math.max(1, ...metrics.keyCounts.values());
  const baseLayer = layers.find((layer) => layer.faces.some((face) => face.trigger.length === 0)) ?? layers[0];
  const integrated = renderLayerSvg(
    metrics,
    layout,
    geometry,
    baseLayer,
    '統合',
    allLayerFaces,
    faceShiftStyles,
    {
      keyCounts: metrics.keyCounts,
      colorCounts: metrics.keyCounts,
      keyDistance: metrics.keyDistance,
      maxCount: commonMax,
      colorScale: 'linear',
      showHeat: true,
      ariaSuffix: '（全レイヤー合算・物理位置）',
    },
  );
  const colorCounts = entries.map((entry) => normalizedLayerColors(entry.layer, entry.stat));
  const layerMax = Math.max(1, ...colorCounts.flatMap((counts) => [...counts.values()]));
  const diagrams = entries.map((entry, index) => {
    return renderLayerSvg(
      metrics,
      layout,
      geometry,
      entry.layer,
      titles[index],
      allLayerFaces,
      faceShiftStyles,
      {
        keyCounts: entry.stat.keyCounts,
        colorCounts: colorCounts[index],
        keyDistance: entry.stat.keyDistance,
        maxCount: layerMax,
        colorScale: layerColorScale,
        showHeat: true,
        ariaSuffix: `（層別・${layerColorScale === 'log' ? '対数' : '線形'}・共通スケール）`,
      },
    );
  });
  const content = selectedLayerView === 'tabs' && entries.length > 1
    ? `<div class="layer-tabs" role="tablist" aria-label="レイヤー">
        ${titles.map((_, index) => `<button type="button" class="ghost" role="tab"
          aria-selected="${activeLayerTab === index}" data-layer-tab="${index}">${escapeText(`レイヤー ${index + 1}`)}</button>`).join('')}
      </div>
      <div class="layer-tab-panel">${diagrams.map((diagram, index) =>
        diagram.replace('<figure class="layer-diagram"', `<figure class="layer-diagram"${activeLayerTab === index ? '' : ' hidden'}`),
      ).join('')}</div>`
    : `<div class="layer-diagrams">${diagrams.join('')}</div>`;
  const hasCombos = groups.combos.length > 0 || layout.layerDefinitions?.some((definition) => definition.kind === 'combo') === true;
  const colorScaleLabel = layerColorScale === 'log' ? '対数' : '線形';
  const layerSection = `<section class="layer-section">
    <h3>統合ヒートマップ</h3>
    <div class="layer-diagrams">${integrated}</div>
  </section>
  <section class="layer-section">
    <h3>層別ヒートマップ（${entries.length}）</h3>
    <p class="note">層別図の色は層操作のための押下を除いたキー押下数で正規化し、表示中の全層で共通の最大値にしている。相互同時シフトと薙刀式の合算表示では、出力として扱うトリガー押下を色に残す。色の尺度は${colorScaleLabel}。実際の押下数はツールチップと帰属先表に残る。</p>
    ${colorScaleControls}${shiftLegend}${naginataControls}${controls}${content}
    ${renderLayerStats(metrics, entries, hasCombos)}
  </section>`;
  el.heatmap.innerHTML = layerSection + renderModifierList(groups.modifiers, layout.legends) +
    renderComboTable(groups.combos, layout.legends);
}

function setSensitivityScale(scale: SensitivityScale) {
  sensitivityScale = scale;
  for (const button of el.sensitivityScale.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scale === scale));
  }
  render();
}
el.sensitivityPanel.addEventListener('toggle', () => {
  if (!el.sensitivityPanel.open) {
    showSensitivityPlaceholder();
    return;
  }
  if (sensitivityDirty) render();
});
el.sensitivityScale.addEventListener('click', (e) => {
  const button = (e.target as Element).closest<HTMLButtonElement>('button[data-scale]');
  if (!button) return;
  // 尺度ボタンはsummary内にあるので、押してもdetailsの開閉を起こさない
  e.preventDefault();
  setSensitivityScale(button.dataset.scale as SensitivityScale);
});

el.heatmap.addEventListener('click', (e) => {
  const target = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!target) return;
  if (target.dataset.naginataLayerDetail !== undefined) {
    naginataLayerDetail = target.dataset.naginataLayerDetail === 'true';
    activeLayerTab = 0;
    render();
    return;
  }
  if (target.dataset.layerColorScale === 'linear' || target.dataset.layerColorScale === 'log') {
    layerColorScale = target.dataset.layerColorScale;
    render();
    return;
  }
  if (target.dataset.layerView === 'side-by-side' || target.dataset.layerView === 'tabs') {
    layerView = target.dataset.layerView;
    render();
    return;
  }
  if (target.dataset.layerTab !== undefined) {
    activeLayerTab = Number(target.dataset.layerTab);
    render();
  }
});

el.playback.addEventListener('click', (e) => {
  const target = (e.target as Element).closest<HTMLButtonElement>('button[data-playback-action]');
  if (!target) return;
  switch (target.dataset.playbackAction) {
    case 'toggle':
      if (playbackState.playing) pausePlayback();
      else startPlayback();
      break;
    case 'stop':
      stopPlayback();
      break;
    case 'back':
      if (!playbackTrace) return;
      playbackState = stepPlayback(playbackState, -1, playbackTrace.strokes.length);
      updatePlaybackView();
      break;
    case 'forward':
      if (!playbackTrace) return;
      playbackState = stepPlayback(playbackState, 1, playbackTrace.strokes.length);
      updatePlaybackView();
      break;
  }
});

el.playback.addEventListener('input', (e) => {
  const target = (e.target as Element).closest<HTMLInputElement>('input[data-playback-seek]');
  if (!target) return;
  beginPlaybackSeek();
  seekPlayback(target.value);
});

el.playback.addEventListener('pointerdown', (e) => {
  if ((e.target as Element).closest('input[data-playback-seek]')) beginPlaybackSeek();
});

el.playback.addEventListener('pointerup', (e) => {
  if ((e.target as Element).closest('input[data-playback-seek]')) finishPlaybackSeek();
});

el.playback.addEventListener('change', (e) => {
  const target = e.target as Element;
  const speed = target.closest<HTMLSelectElement>('select[data-playback-speed]');
  if (speed) {
    const value = Number(speed.value);
    if (PLAYBACK_SPEEDS.includes(value as PlaybackSpeed)) {
      playbackState = setPlaybackSpeed(playbackState, value as PlaybackSpeed);
      updatePlaybackView();
    }
    return;
  }
  const fingers = target.closest<HTMLInputElement>('input[data-playback-fingers]');
  if (fingers) {
    playbackShowFingers = fingers.checked;
    updatePlaybackView();
    return;
  }
  const romajiPlan = target.closest<HTMLInputElement>('input[data-playback-romaji-plan]');
  if (romajiPlan) {
    playbackShowRomajiPlan = romajiPlan.checked;
    if (playbackShowRomajiPlan) playbackShowPlanKeys = false;
    updatePlaybackView();
    return;
  }
  const planKeys = target.closest<HTMLInputElement>('input[data-playback-plan-keys]');
  if (planKeys) {
    playbackShowPlanKeys = planKeys.checked;
    if (playbackShowPlanKeys) playbackShowRomajiPlan = false;
    updatePlaybackView();
    return;
  }
  const trail = target.closest<HTMLInputElement>('input[data-playback-trail]');
  if (trail) {
    playbackShowTrail = trail.checked;
    updatePlaybackView();
    return;
  }
  const trailTau = target.closest<HTMLInputElement>('input[data-playback-trail-tau]');
  if (trailTau) {
    const value = Number(trailTau.value);
    if (Number.isInteger(value) && value >= 1 && value <= 20) playbackTrailTau = value;
    updatePlaybackView();
    return;
  }
  const orderLabels = target.closest<HTMLInputElement>('input[data-playback-order-labels]');
  if (orderLabels) {
    playbackShowOrderLabels = orderLabels.checked;
    updatePlaybackView();
    return;
  }
  const scale = target.closest<HTMLSelectElement>('select[data-playback-scale]');
  if (scale) {
    const value = Number(scale.value);
    if (PLAYBACK_SCALES.includes(value as PlaybackScale)) {
      playbackScale = value as PlaybackScale;
      rerenderPlaybackFigure();
      updatePlaybackView();
    }
    return;
  }
  const seek = target.closest<HTMLInputElement>('input[data-playback-seek]');
  if (seek) {
    // pointerupで終了済みなら再生状態を維持し、未終了ならここで確定する。
    seekPlayback(seek.value, playbackState.playing);
    if (playbackSeekWasPlaying !== undefined) finishPlaybackSeek();
  }
});

function onModeChange() {
  fillSampleOptions();
  syncSampleText();
  fillPicker();
  fillDetailOptions();
}
el.mode.addEventListener('input', onModeChange);
el.mode.addEventListener('change', onModeChange);
el.sample.addEventListener('change', () => {
  selectedSample[currentModeId()] = el.sample.value;
  el.text.value = currentSample();
  render();
});
el.compareChartMetric.addEventListener('change', () => {
  compareChartColumn = Number(el.compareChartMetric.value);
  render();
});
for (const node of [el.mode, el.geometry, el.window, el.sfbHome, el.sample, el.text, el.detailLayout, el.compareBaseline]) {
  node.addEventListener('input', render);
  node.addEventListener('change', render);
}
setupAddForm();
setupRomajiEditor();
setupTextPanel();
fillPicker();
fillDetailOptions();
bindMatrixSort(el.pressMatrix, 'press');
bindMatrixSort(el.fingerMatrix, 'finger');
bindMatrixSort(el.adjacentMeanMatrix, 'adjacentMean');
bindMatrixSort(el.adjacentStdDevMatrix, 'adjacentStdDev');
bindCompareSort(el.compare);
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
setupTheme(render);

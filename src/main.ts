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
import { evaluate, type Options, type Trace } from './evaluate.ts';
import { computeMetrics, type Metrics } from './metrics.ts';
import { nSensitivity } from './sensitivity.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Face, type Layout } from './layouts/index.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from './sample-text-ja.ts';
import {
  bindTips,
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
import { classifyFaces, faceCells, handOfKey, type Layer } from './layers.ts';

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
  heatmap: $<HTMLDivElement>('heatmap'),
  gapFigure: $<HTMLDivElement>('gap-figure'),
  fingerChart: $<HTMLDivElement>('finger-chart'),
  adjacentChart: $<HTMLDivElement>('adjacent-chart'),
  fingerMatrix: $<HTMLDivElement>('finger-matrix'),
  pressMatrix: $<HTMLDivElement>('press-matrix'),
  adjacentMeanMatrix: $<HTMLDivElement>('adjacent-mean-matrix'),
  adjacentStdDevMatrix: $<HTMLDivElement>('adjacent-stddev-matrix'),
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
 * スロットは 8 つで、自作配列を足して超えた分は巡回する（被って読みにくければ
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

/** 表示する配列の id。モードごとに覚える。保存値があればそれを使い、無ければ既定値 */
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

/** 配列を追加する欄。段ごとに 1 行、数字段は任意 */
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
      if (!format) throw new Error('DvorakJ の .txt、Vial の .vil、紅皿の .bnz / .ini を選ぶ');
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
      note.textContent = 'ん = n は、次が母音・な行・や行の時や語末では実際には nn が必要です。この設定では区別できません。';
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
type LayerView = 'side-by-side' | 'tabs';
let layerView: LayerView | undefined;
let activeLayerTab = 0;

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
    el.textMeta.textContent = '配列を 1 つ以上選ぶ';
    el.compareChart.innerHTML = '';
    syncCompareBaselineOptions([]);
    syncCompareChartOptions(false);
    el.compare.innerHTML = '';
    el.sensitivity.innerHTML = '';
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
  renderSensitivity(text, geometry, options);
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

function compareHeader(label: string, column: number, relative: boolean): string {
  const active = compareSort?.column === column ? compareSort.direction : undefined;
  const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
  const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
  const shownLabel = compareLabel(label, relative, column);
  return `<th><span class="table-sort" data-compare-sort="${column}" role="button" tabindex="0"
    aria-label="${escapeAttr(`${shownLabel}で配列を並べ替え`)}" aria-sort="${ariaSort}"
    title="クリックごとに昇順・降順・選択順へ切り替える">${escapeText(shownLabel)}${marker}</span></th>`;
}

/**
 * 配列 × 指の粒度でマトリックスに並べる。行は総移動距離の表と同じ選択順
 * （色のスロットが他の図と揃うことを優先し、総距離順の並べ替えはしない）。
 *
 * 指ごとの移動距離は入力文字数で正規化する（u/文字）。生の u は評価テキストの
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

  // 押下数は親指も含めた 10 本で出す。親指の移動距離は定義上 0 なので距離の面からは
  // 省いてあるが、押下は現に起きている（薙刀式の右親指など）。距離の面だけを見て
  // 「この指を使っていない」と読まれるのを防ぐため、ここは 0 の列も含めて全部並べる。
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
    // 隣接指の指標は 0.02〜0.6 の狭い帯に固まる。0 起点だと全セルが薄くなって差が読めない
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
 * 相対は N=0 を 100% とした減り方、絶対はそのままの総移動距離。
 * 相対は傾きの比較に、絶対は配列間の差の比較に効く。
 */
type SensitivityScale = 'relative' | 'absolute';
let sensitivityScale: SensitivityScale = 'relative';

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
        // 絶対表示では y 自身が生値なので併記しない
        raw: relative ? p.totalUnits : undefined,
      })),
    };
  });
  // N を増やしても候補集合が広がるだけで距離は減る一方なので、相対値は 100% を超えない。
  // 上端を 100% に固定して、自動調整で 105% のような目盛りが出るのを防ぐ
  el.sensitivity.innerHTML = relative
    ? lineChart(series, range, (v) => `${v.toFixed(0)}%`, { yMax: 100 })
    : lineChart(series, range, (v) => `${v.toFixed(0)} u`);
}

function renderDetail(results: Result[], geometry: ReturnType<typeof buildGeometry>) {
  const found = results.find((r) => r.layout.id === el.detailLayout.value) ?? results[0];
  const { metrics, layout } = found;

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

function triggerHandText(face: Layer['faces'][number]): string {
  const hands = new Set(face.trigger.map(handOfKey).filter((hand): hand is NonNullable<typeof hand> => hand !== undefined));
  if (hands.size !== 1) return '両手';
  return hands.has('left') ? '左手' : '右手';
}

function targetHandText(face: Face): string | undefined {
  const hands = new Set([...faceCells(face).keys()]
    .map(handOfKey)
    .filter((hand): hand is NonNullable<typeof hand> => hand !== undefined));
  if (hands.size !== 1) return undefined;
  return hands.has('left') ? '左手側' : '右手側';
}

const FACE_MODE_TEXT: Record<Face['mode'], string> = {
  simultaneous: '同時押し',
  prefix: '前置シフト',
  suffix: '後置シフト',
};

function triggerCaption(face: Face, legends: Map<string, string>): string {
  const trigger = triggerText(face, legends);
  const target = targetHandText(face);
  return `${triggerHandText(face)} ${trigger}シフト${target ? `（${target}のキー）` : ''}`;
}

function layerTitle(layer: Layer, index: number, legends: Map<string, string>): string {
  if (layer.faces.length === 0) return `レイヤー ${index + 1}: 単打`;
  const triggers = layer.faces
    .filter((face) => face.trigger.length > 0)
    .map((face) => triggerCaption(face, legends));
  if (triggers.length === 0) return `レイヤー ${index + 1}: 単打`;
  const names = [...new Set(layer.faces.map((face) => face.layer).filter((name): name is string => name !== undefined))];
  const name = names.length === 1 ? `${names[0]}: ` : '';
  const modes = [...new Set(layer.faces.map((face) => FACE_MODE_TEXT[face.mode]))].join(' / ');
  return `レイヤー ${index + 1}: ${name}${triggers.join(' / ')}（${modes}）`;
}

interface LayerCell {
  label: string;
  annotation?: string;
}

function layerCells(layer: Layer, layout: Layout): Map<string, LayerCell> {
  if (layer.faces.length === 0) {
    return new Map([...layout.legends].map(([key, label]) => [key, { label }]));
  }

  const cells = new Map<string, LayerCell>();
  for (const face of layer.faces) {
    const trigger = face.trigger.length > 0 ? triggerText(face, layout.legends) : '';
    const annotation = face.trigger.length > 0
      ? `${triggerHandText(face)} ${trigger}を押す`
      : undefined;
    for (const [key, label] of faceCells(face)) {
      const previous = cells.get(key);
      cells.set(key, previous
        ? { label: `${previous.label} / ${label}`, annotation: previous.annotation ?? annotation }
        : { label, annotation });
    }
  }
  return cells;
}

function renderLayerSvg(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  layer: Layer,
  title: string,
): string {
  const labels = layerCells(layer, layout);
  const showHeat = layer.faces.length === 0 || layer.faces.some((face) => face.trigger.length === 0);
  const max = Math.max(1, ...metrics.keyCounts.values());
  // 隣に並ぶマトリックス（セル 54×24）と同じくらいの密度に合わせる。
  // 図は実寸で置くので、この値がそのまま画面上のキーの大きさになる
  const KEY = 30;
  const PAD = 6;
  const THUMB_W = 1.9;
  let maxX = 0;
  let maxY = 0;

  const keys = [...geometry.keys.values()].map((key) => {
    const count = metrics.keyCounts.get(key.id) ?? 0;
    const t = count / max;
    const thumb = key.row === THUMB_ROW;
    const w = (thumb ? THUMB_W : 1) * KEY;
    const x = (key.x - (thumb ? (THUMB_W - 1) / 2 : 0)) * KEY;
    const y = key.y * KEY;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + KEY);
    const cell = labels.get(key.id);
    const label = cell?.label ?? '';
    const annotation = cell?.annotation;
    const share = ((count / Math.max(1, metrics.presses)) * 100).toFixed(1);
    const distance = metrics.keyDistance.get(key.id) ?? 0;
    const tip = showHeat
      ? `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>` +
        `<b>${count}</b> 打 (${share}%)<br>移動 <b>${distance.toFixed(1)} u</b>`
      : `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span>` +
        (annotation ? `<br>${escapeText(annotation)}` : '');
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const text = `<text x="${x + w / 2}" y="${y + KEY / 2 + 4}" text-anchor="middle"
        font-size="${fontSize}" fill="${showHeat && t > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}"
        pointer-events="none">${escapeText(label)}</text>`;
    // 隣り合う面が地色で 2px 離れるよう、キー矩形は内側に 1px 詰める
    const fill = showHeat
      ? `color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))`
      : 'var(--panel)';
    return `<g data-tip="${escapeAttr(tip)}">
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${KEY - 2}" rx="5"
        fill="${fill}" stroke="var(--line)"/>
      ${text}
    </g>`;
  });

  // 実寸を属性で持たせ、CSS 側（.fig-fixed）で引き伸ばさずに置く
  const W = maxX + PAD;
  const H = maxY + PAD;
  const caption = showHeat ? `${title} — 打鍵頻度（全レイヤー合算・物理位置）` : title;
  return `<figure class="layer-diagram" style="width:${W}px">
    <figcaption>${escapeText(caption)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="${escapeAttr(caption)}">${keys.join('')}</svg>
  </figure>`;
}

function renderComboTable(combos: readonly Face[], legends: Map<string, string>): string {
  if (combos.length === 0) return '';
  const rows = combos.map((face) => {
    const outputs = [...faceCells(face).values()].join(' / ');
    return `<tr><td>${escapeText(triggerText(face, legends))}</td><td>${escapeText(outputs)}</td></tr>`;
  }).join('');
  return `<section class="combo-table">
    <h3>コンボ（${combos.length}）</h3>
    <div class="scroll-x"><table>
      <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
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
  return `<section class="modifier-list">
    <h3>修飾（${modifiers.length}）</h3>
    <div class="scroll-x"><table>
      <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

function renderHeatmap(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
) {
  const faces = layout.faces ?? [];
  const groups = classifyFaces(faces);
  const layers: Layer[] = groups.layers.length > 0 ? groups.layers : [{ faces: [] }];
  if (activeLayerTab >= layers.length) activeLayerTab = 0;
  const titles = layers.map((layer, index) => layerTitle(layer, index, layout.legends));
  const selectedLayerView = layerView ?? (layers.length <= 5 ? 'side-by-side' : 'tabs');
  const controls = layers.length > 1
    ? `<div class="layer-view-controls" role="group" aria-label="レイヤーの表示方法">
        <span>レイヤーの表示</span>
        <button type="button" class="ghost" data-layer-view="side-by-side" aria-pressed="${selectedLayerView === 'side-by-side'}">並置</button>
        <button type="button" class="ghost" data-layer-view="tabs" aria-pressed="${selectedLayerView === 'tabs'}">タブ</button>
      </div>`
    : '';
  const diagrams = layers.map((layer, index) => renderLayerSvg(metrics, layout, geometry, layer, titles[index]));
  const content = selectedLayerView === 'tabs' && layers.length > 1
    ? `<div class="layer-tabs" role="tablist" aria-label="レイヤー">
        ${titles.map((_, index) => `<button type="button" class="ghost" role="tab"
          aria-selected="${activeLayerTab === index}" data-layer-tab="${index}">${escapeText(`レイヤー ${index + 1}`)}</button>`).join('')}
      </div>
      <div class="layer-tab-panel">${diagrams.map((diagram, index) =>
        diagram.replace('<figure class="layer-diagram"', `<figure class="layer-diagram"${activeLayerTab === index ? '' : ' hidden'}`),
      ).join('')}</div>`
    : `<div class="layer-diagrams">${diagrams.join('')}</div>`;
  const layerSection = `<section class="layer-section">
    <h3>レイヤー（${layers.length}）</h3>
    ${controls}${content}
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
el.sensitivityScale.addEventListener('click', (e) => {
  const button = (e.target as Element).closest<HTMLButtonElement>('button[data-scale]');
  if (button) setSensitivityScale(button.dataset.scale as SensitivityScale);
});

el.heatmap.addEventListener('click', (e) => {
  const target = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!target) return;
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
// 図解は固定例（§7〜§9）。画面の選択に連動させず、起動時に 1 度だけ描く
el.gapFigure.innerHTML = gapFigure(buildGeometry('row-staggered'));
bindTips(document.body);
setupTheme(render);

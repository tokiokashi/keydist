import type { AppElements } from './app-dom.ts';
import { LAYOUTS_JA, type Layout } from './layouts/index.ts';
import { SAMPLE_TEXT_JA } from './sample-text-ja.ts';
import { kanaToRomaji } from './romaji/kunrei.ts';
import {
  allRomajiRules,
  defaultRomajiRuleId,
  formatOverrides,
  parseOverrides,
  ROMAJI_RULES,
  saveRomajiSettings,
  tableForRule,
  type BuiltinRomajiRuleId,
  type RomajiRuleId,
  type RomajiSettings,
  type UserRomajiRule,
} from './romaji/rules.ts';
import { save as saveUserLayouts, type UserLayout } from './user-layouts.ts';

interface RomajiVariant {
  kana: string;
  alternatives: string[];
}

/** タイピングアプリで設定されるかな。順位は現代文サンプルで測る。 */
const ROMAJI_VARIANTS: RomajiVariant[] = [
  { kana: 'い', alternatives: ['i'] }, { kana: 'う', alternatives: ['u'] },
  { kana: 'か', alternatives: ['ka'] }, { kana: 'く', alternatives: ['ku'] },
  { kana: 'こ', alternatives: ['ko'] }, { kana: 'し', alternatives: ['si', 'shi'] },
  { kana: 'せ', alternatives: ['se'] }, { kana: 'ち', alternatives: ['ti', 'chi'] },
  { kana: 'つ', alternatives: ['tu', 'tsu'] }, { kana: 'ふ', alternatives: ['hu', 'fu'] },
  { kana: 'ん', alternatives: ['n', 'nn'] }, { kana: 'じ', alternatives: ['zi', 'ji'] },
  { kana: 'っ', alternatives: ['ltu', 'xtu'] }, { kana: 'ぁ', alternatives: ['la', 'xa'] },
  { kana: 'ぃ', alternatives: ['li', 'xi'] }, { kana: 'ぅ', alternatives: ['lu', 'xu'] },
  { kana: 'ぇ', alternatives: ['le', 'xe'] }, { kana: 'ぉ', alternatives: ['lo', 'xo'] },
  { kana: 'ゃ', alternatives: ['lya', 'xya'] }, { kana: 'ゅ', alternatives: ['lyu', 'xyu'] },
  { kana: 'ょ', alternatives: ['lyo', 'xyo'] }, { kana: 'しゃ', alternatives: ['sha', 'sya'] },
  { kana: 'しゅ', alternatives: ['shu', 'syu'] }, { kana: 'しぇ', alternatives: ['she', 'sye'] },
  { kana: 'しょ', alternatives: ['sho', 'syo'] }, { kana: 'じゃ', alternatives: ['ja', 'zya'] },
  { kana: 'じゅ', alternatives: ['ju', 'zyu'] }, { kana: 'じぇ', alternatives: ['je', 'zye'] },
  { kana: 'じょ', alternatives: ['jo', 'zyo'] }, { kana: 'ちゃ', alternatives: ['tya', 'cha'] },
  { kana: 'ちゅ', alternatives: ['tyu', 'chu'] }, { kana: 'ちょ', alternatives: ['tyo', 'cho'] },
  { kana: 'ちぃ', alternatives: ['tyi'] }, { kana: 'うぃ', alternatives: ['wi'] },
  { kana: 'うぇ', alternatives: ['we'] },
];

export interface RomajiEditorContext {
  el: AppElements;
  layoutsOf: (mode: 'en' | 'ja') => Layout[];
  getUserLayouts: () => UserLayout[];
  setUserLayouts: (layouts: UserLayout[]) => void;
  getRomajiSettings: () => RomajiSettings;
  setRomajiSettings: (settings: RomajiSettings) => void;
  clearTableCache: () => void;
  fillPicker: () => void;
  fillDetailOptions: () => void;
  render: () => void;
}

export interface RomajiEditorController {
  setup: () => void;
  fillRomajiSelect: (select: HTMLSelectElement, selectedId?: string) => void;
}

export function createRomajiEditor(ctx: RomajiEditorContext): RomajiEditorController {
  const { el: elements } = ctx;

  function fillRomajiSelect(select: HTMLSelectElement, selectedId = select.value): void {
    select.replaceChildren();
    const settings = ctx.getRomajiSettings();
    for (const rule of allRomajiRules(settings.rules)) select.append(new Option(rule.name, rule.id));
    if (selectedId && allRomajiRules(settings.rules).some((rule) => rule.id === selectedId)) {
      select.value = selectedId;
    }
  }

  function romajiEditorRule(id: string): UserRomajiRule | undefined {
    return ctx.getRomajiSettings().rules.find((rule) => rule.id === id);
  }

  function loadRomajiEditor(id: string): void {
    if (!id) {
      elements.romajiEdit.value = '';
      elements.romajiName.value = '';
      elements.romajiBase.value = 'kunrei';
      elements.romajiSokuon.checked = true;
      elements.romajiOverrides.value = '';
      elements.romajiError.hidden = true;
      fillRomajiVariants();
      return;
    }
    const custom = romajiEditorRule(id);
    const builtin = !custom && id in ROMAJI_RULES
      ? ROMAJI_RULES[id as BuiltinRomajiRuleId]
      : undefined;
    if (!custom && !builtin) return;
    elements.romajiEdit.value = id;
    elements.romajiName.value = custom?.name ?? builtin?.name ?? '';
    const base = custom?.base ?? builtin?.base ?? 'kunrei';
    elements.romajiBase.value = base;
    elements.romajiSokuon.checked = base === 'azik'
      ? false
      : custom?.generateSokuon ?? builtin?.generateSokuon ?? true;
    elements.romajiOverrides.value = formatOverrides(custom?.overrides ?? builtin?.overrides ?? {});
    elements.romajiError.hidden = true;
    fillRomajiVariants();
  }

  function fillRomajiEditorRules(selectedId = elements.romajiEdit.value || 'kunrei'): void {
    elements.romajiEdit.replaceChildren(new Option('新しい綴り', ''));
    const settings = ctx.getRomajiSettings();
    for (const rule of allRomajiRules(settings.rules)) elements.romajiEdit.append(new Option(rule.name, rule.id));
    const id = allRomajiRules(settings.rules).some((rule) => rule.id === selectedId) ? selectedId : 'kunrei';
    loadRomajiEditor(id);
  }

  function editorBaseTable(): Map<string, string> {
    const id = elements.romajiEdit.value;
    const custom = romajiEditorRule(id);
    const builtin = !custom && id in ROMAJI_RULES ? ROMAJI_RULES[id as BuiltinRomajiRuleId] : undefined;
    const base = custom?.base ?? builtin?.base ?? elements.romajiBase.value as BuiltinRomajiRuleId;
    return tableForRule(base, ctx.getRomajiSettings().rules);
  }

  function editorTable(): Map<string, string> {
    const table = editorBaseTable();
    const parsed = parseOverrides(elements.romajiOverrides.value);
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

  function setVariantOverride(kana: string, value: string): void {
    const roman = value.trim().toLowerCase();
    const lines = elements.romajiOverrides.value.split(/\r?\n/);
    const index = lines.findIndex((line) => {
      const equal = line.indexOf('=');
      return equal > 0 && line.slice(0, equal).trim() === kana;
    });
    if (!roman) {
      if (index >= 0) lines.splice(index, 1);
    } else if (index >= 0) lines[index] = `${kana} = ${roman}`;
    else if (lines.length === 1 && lines[0].trim() === '') lines[0] = `${kana} = ${roman}`;
    else lines.push(`${kana} = ${roman}`);
    elements.romajiOverrides.value = lines.join('\n');
  }

  function fillRomajiVariants(): void {
    const table = editorTable();
    const rows = ROMAJI_VARIANTS.map((variant, index) => {
      const current = table.get(variant.kana) ?? kanaToRomaji(variant.kana, table);
      const count = countOccurrences(SAMPLE_TEXT_JA.replace(/\s+/g, ''), variant.kana);
      const effect = (variant.alternatives[0].length - current.length) * count;
      return { variant, current, count, effect, index };
    }).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.index - b.index);
    elements.romajiVariants.replaceChildren();
    const listId = 'romaji-variant-options';
    const datalist = document.createElement('datalist');
    datalist.id = listId;
    for (const option of [...new Set(ROMAJI_VARIANTS.flatMap((variant) => variant.alternatives))]) datalist.append(new Option(option));
    elements.romajiVariants.append(datalist);
    for (const { variant, current, count, effect } of rows) {
      const row = document.createElement('div');
      row.className = 'romaji-variant';
      const label = document.createElement('span');
      label.textContent = variant.kana;
      const input = document.createElement('input');
      input.type = 'text'; input.value = current; input.spellcheck = false;
      input.setAttribute('list', listId); input.dataset.kana = variant.kana;
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
      input.addEventListener('input', () => setVariantOverride(variant.kana, input.value));
      elements.romajiVariants.append(row);
    }
  }

  function fillRomajiAssignments(): void {
    elements.romajiAssignments.replaceChildren();
    const settings = ctx.getRomajiSettings();
    const rules = allRomajiRules(settings.rules);
    const addHeader = (text: string) => {
      const heading = document.createElement('h4'); heading.textContent = text; elements.romajiAssignments.append(heading);
    };
    const addAssignment = (nameText: string, layoutId: string, assigned: RomajiRuleId, save: (id: RomajiRuleId) => void) => {
      const label = document.createElement('label'); label.className = 'romaji-assignment';
      const name = document.createElement('span'); name.textContent = nameText;
      const select = document.createElement('select');
      for (const rule of rules) select.append(new Option(rule.name, rule.id));
      select.value = rules.some((rule) => rule.id === assigned) ? assigned : defaultRomajiRuleId(layoutId);
      select.addEventListener('change', () => { save(select.value); ctx.fillPicker(); ctx.fillDetailOptions(); ctx.render(); });
      label.append(name, select); elements.romajiAssignments.append(label);
    };
    addHeader('組み込み配列');
    for (const layout of LAYOUTS_JA.filter((candidate) => candidate.romajiTable)) {
      const assigned = settings.assignments[layout.id] ?? defaultRomajiRuleId(layout.id);
      addAssignment(layout.name, layout.id, assigned, (id) => {
        const next = { ...ctx.getRomajiSettings(), assignments: { ...ctx.getRomajiSettings().assignments, [layout.id]: id } };
        ctx.setRomajiSettings(next); saveRomajiSettings(next);
      });
    }
    const userLayouts = ctx.getUserLayouts();
    if (userLayouts.length > 0) addHeader('自作配列');
    for (const definition of userLayouts) {
      addAssignment(definition.name, definition.id, definition.romaji, (id) => {
        const next = userLayouts.map((current) => current.id === definition.id ? { ...current, romaji: id } : current);
        ctx.setUserLayouts(next); saveUserLayouts(next); ctx.clearTableCache();
      });
    }
  }

  function setup(): void {
    elements.romajiBase.replaceChildren(
      new Option('標準（j / sh / ch）', 'qwerty'), new Option('訓令式', 'kunrei'),
      new Option('大西式', 'oonishi'), new Option('AZIK', 'azik'),
    );
    fillRomajiEditorRules();
    fillRomajiAssignments();
    elements.romajiSettings.addEventListener('click', () => {
      fillRomajiEditorRules(); fillRomajiAssignments(); elements.romajiDialog.showModal();
    });
    elements.romajiEdit.addEventListener('change', () => loadRomajiEditor(elements.romajiEdit.value));
    elements.romajiBase.addEventListener('change', () => {
      if (elements.romajiBase.value === 'azik') elements.romajiSokuon.checked = false;
    });
    elements.romajiNew.addEventListener('click', () => { loadRomajiEditor(''); elements.romajiName.focus(); });
    elements.romajiForm.addEventListener('submit', (event) => {
      if ((event.submitter as HTMLButtonElement | null)?.value === 'cancel') return;
      event.preventDefault();
      const name = elements.romajiName.value.trim();
      const parsed = parseOverrides(elements.romajiOverrides.value);
      const errors = name ? parsed.errors : ['名前を入力する'];
      elements.romajiError.textContent = errors.join(' / '); elements.romajiError.hidden = errors.length === 0;
      if (errors.length) return;
      const current = ctx.getRomajiSettings();
      const id = elements.romajiEdit.value && !(elements.romajiEdit.value in ROMAJI_RULES)
        ? elements.romajiEdit.value : `custom-${Date.now().toString(36)}`;
      const rule: UserRomajiRule = {
        id, name, base: elements.romajiBase.value as BuiltinRomajiRuleId,
        overrides: parsed.overrides,
        generateSokuon: elements.romajiBase.value === 'azik' ? false : elements.romajiSokuon.checked,
      };
      const rules = current.rules.some((candidate) => candidate.id === id)
        ? current.rules.map((candidate) => candidate.id === id ? rule : candidate)
        : [...current.rules, rule];
      const next = { ...current, rules };
      ctx.setRomajiSettings(next); ctx.clearTableCache(); saveRomajiSettings(next);
      fillRomajiEditorRules(id); fillRomajiAssignments(); fillRomajiSelect(elements.newRomaji, elements.newRomaji.value);
      ctx.fillPicker(); ctx.fillDetailOptions(); ctx.render();
    });
  }

  return { setup, fillRomajiSelect };
}

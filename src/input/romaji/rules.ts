import { UNSAFE_OBJECT_KEYS, type CodecDiagnostic, type DecodedWithDiagnostics } from '../codec/index.ts';
import { azik } from './azik.ts';
import { kunrei, addSokuonForms } from './kunrei.ts';
import { OONISHI_OVERRIDES, oonishiRomaji } from './oonishi.ts';
import { QWERTY_LEGEND } from '../shapes/geometry.ts';

export type BuiltinRomajiRuleId = 'kunrei' | 'oonishi' | 'azik' | 'qwerty';
export type RomajiRuleId = string;

export interface RomajiRuleSpec {
  base: BuiltinRomajiRuleId;
  overrides: Record<string, string>;
  /** 促音の直後に子音を重ねた見出しを自動生成するか */
  generateSokuon: boolean;
}

export interface UserRomajiRule extends RomajiRuleSpec {
  id: string;
  name: string;
}

export interface RomajiSettings {
  rules: UserRomajiRule[];
  /** 日本語モードで使うローマ字ルール。キーは配列 id */
  assignments: Record<string, RomajiRuleId>;
}

export const ROMAJI_RULES: Record<BuiltinRomajiRuleId, RomajiRuleSpec & {
  name: string;
  table: () => Map<string, string>;
}> = {
  qwerty: {
    name: '標準（j / sh / ch）',
    base: 'kunrei',
    overrides: {
      じ: 'ji',
      じゃ: 'ja', じゅ: 'ju', じょ: 'jo', じぇ: 'je',
      しゃ: 'sha', しゅ: 'shu', しょ: 'sho', しぇ: 'she',
      ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ちぇ: 'che',
    },
    generateSokuon: true,
    table: () => kunrei(ROMAJI_RULES.qwerty.overrides),
  },
  kunrei: {
    name: '訓令式（si / sya / zi / zya）',
    base: 'kunrei',
    overrides: {},
    generateSokuon: true,
    table: () => kunrei(),
  },
  oonishi: {
    name: '大西式（si / sha / ji / ja）',
    base: 'kunrei',
    overrides: OONISHI_OVERRIDES,
    generateSokuon: true,
    table: () => oonishiRomaji(),
  },
  azik: {
    name: 'AZIK（拡張ローマ字。二重母音・撥音・促音を1綴りに短縮）',
    base: 'azik',
    overrides: {},
    generateSokuon: false,
    table: () => azik(),
  },
};

const QWERTY_KEYS = new Set([...QWERTY_LEGEND.join('')]);

/** 全体のレベルの既定。推奨を持たない配列はこれで打つ。 */
export const DEFAULT_ROMAJI_RULE_ID: BuiltinRomajiRuleId = 'kunrei';

/**
 * 配列が組み込みで持つローマ字規則の推奨。無ければ`undefined`（全体の値に従う）。
 * 大西配列は公式が前提とする大西式の綴り、TK音直入力法のコンボは訓令式（sya / zya）の綴りを
 * 前提に組まれているので、全体を別の規則へ変えても、この2つは推奨のまま打つ。
 * 全体の既定と同じ訓令式でも、TK音直入力法は「推奨として持つ」ので全体の変更に流されない。
 */
export function recommendedRomajiRuleId(layoutId: string): BuiltinRomajiRuleId | undefined {
  if (layoutId === 'oonishi') return 'oonishi';
  if (layoutId === 'oonishi-custom') return 'kunrei';
  return undefined;
}

/** 全体の値を変えていない時に、その配列で使うルール。 */
export function defaultRomajiRuleId(layoutId: string): BuiltinRomajiRuleId {
  return recommendedRomajiRuleId(layoutId) ?? DEFAULT_ROMAJI_RULE_ID;
}

/** 基底ルールと差分から、評価器に渡すテーブルを組み立てる。 */
export function buildRomajiTable(rule: UserRomajiRule): Map<string, string> {
  const base = baseTable(rule.base, false);
  for (const [kana, roman] of Object.entries(rule.overrides)) base.set(kana, roman);
  // AZIK は「っ」を ; の 1 打で持つため、子音重ねを足すと本来の短縮を隠してしまう。
  if (rule.generateSokuon && rule.base !== 'azik') addSokuonForms(base);
  return base;
}

export function tableForRule(
  id: RomajiRuleId,
  customRules: UserRomajiRule[] = [],
): Map<string, string> {
  const builtin = isBuiltin(id) ? ROMAJI_RULES[id] : undefined;
  if (builtin) return builtin.table();
  const custom = customRules.find((rule) => rule.id === id);
  return custom ? buildRomajiTable(custom) : ROMAJI_RULES.kunrei.table();
}

function baseTable(base: BuiltinRomajiRuleId, generateSokuon: boolean): Map<string, string> {
  switch (base) {
    case 'qwerty': return kunrei(ROMAJI_RULES.qwerty.overrides, generateSokuon);
    case 'oonishi': return oonishiRomaji({}, generateSokuon);
    case 'azik': return azik({}, generateSokuon);
    case 'kunrei': return kunrei({}, generateSokuon);
  }
}

export function isBuiltin(id: string): id is BuiltinRomajiRuleId {
  return Object.hasOwn(ROMAJI_RULES, id);
}

export function allRomajiRules(customRules: UserRomajiRule[] = []) {
  const builtinIds: BuiltinRomajiRuleId[] = ['kunrei', 'oonishi', 'azik', 'qwerty'];
  return [
    ...builtinIds.map((id) => ({ id, name: ROMAJI_RULES[id].name })),
    ...customRules.map(({ id, name }) => ({ id, name })),
  ];
}


/** 差分欄の `かな = romaji` を読み取る。空行と # コメントは無視する。 */
export function parseOverrides(text: string): { overrides: Record<string, string>; errors: string[] } {
  const overrides: Record<string, string> = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const equal = line.indexOf('=');
    if (equal < 1) {
      errors.push(`${i + 1} 行目: 「かな = 綴り」の形で書く`);
      return;
    }
    const kana = line.slice(0, equal).trim();
    const roman = line.slice(equal + 1).trim().toLowerCase();
    if (!kana || !roman || /\s/.test(kana) || /\s/.test(roman)) {
      errors.push(`${i + 1} 行目: かなと綴りを空白なしで指定する`);
      return;
    }
    if (!/[ぁ-ゖァ-ヺー]/u.test(kana)) {
      errors.push(`${i + 1} 行目: 左辺はかなで指定する`);
      return;
    }
    if ([...roman].some((key) => !QWERTY_KEYS.has(key))) {
      errors.push(`${i + 1} 行目: 綴りにキーボードに無いキーが含まれている`);
      return;
    }
    if (overrides[kana] !== undefined) {
      errors.push(`${i + 1} 行目: 「${kana}」が重複している`);
      return;
    }
    overrides[kana] = roman;
  });
  return { overrides, errors };
}

export function formatOverrides(overrides: Record<string, string>): string {
  return Object.entries(overrides).map(([kana, roman]) => `${kana} = ${roman}`).join('\n');
}

export function isUserRomajiRule(value: unknown): value is UserRomajiRule {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.name === 'string' && value.name.length > 0 &&
    isBuiltin(value.base) && isRecord(value.overrides) &&
    Object.entries(value.overrides).every(([kana, roman]) =>
      kana.length > 0 && typeof roman === 'string' && roman.length > 0,
    ) && typeof value.generateSokuon === 'boolean';
}

/**
 * 自作のローマ字規則の一覧を読む。壊れた要素とid重複は捨てて診断を積む（`decodeUserLayouts`と同じ方針）。
 * 値があって配列でない時は全件が消えるので診断を積み、`undefined`（項目が無い）は空で正しいので積まない。
 */
export function decodeUserRomajiRules(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): UserRomajiRule[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) diagnostics.push({ path, message: '配列形式でないためローマ字規則を捨てた' });
    return [];
  }
  const seen = new Set<string>();
  const rules: UserRomajiRule[] = [];
  raw.forEach((candidate, index) => {
    if (!isUserRomajiRule(candidate)) {
      diagnostics.push({ path: `${path}[${index}]`, message: '形式が不正なためローマ字規則を捨てた' });
      return;
    }
    // 組み込みと同じidの自作は、規則のidを引く時に組み込みと区別できないので読まない
    if (isBuiltin(candidate.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${candidate.id}」が組み込みの規則と同じため捨てた` });
      return;
    }
    if (seen.has(candidate.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${candidate.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(candidate.id);
    rules.push(candidate);
  });
  return rules;
}

/**
 * 保存された自作のローマ字規則と割り当てを読む。値があって想定の形でない時（nullを含む）と、
 * 壊れた要素を捨てる時は診断を積む。`undefined`（保存が無い・項目が無い）は空で正しいので診断しない。
 */
export function decodeStoredRomajiSettings(value: unknown): DecodedWithDiagnostics<RomajiSettings> {
  const diagnostics: CodecDiagnostic[] = [];
  if (!isRecord(value)) {
    if (value !== undefined) diagnostics.push({ path: '', message: '形式が不正なため自作のローマ字規則を捨てた' });
    return { value: { rules: [], assignments: {} }, diagnostics };
  }
  const rules = decodeUserRomajiRules(value.rules, 'rules', diagnostics);
  const assignments: Record<string, string> = {};
  if (isRecord(value.assignments)) {
    for (const [key, id] of Object.entries(value.assignments)) {
      // 予約名のキーは代入で自分のプロパティにならず黙って消えるので、捨てる旨を診断に残す
      if (UNSAFE_OBJECT_KEYS.has(key)) diagnostics.push({ path: `assignments.${key}`, message: `予約名のキー「${key}」を捨てた` });
      else if (typeof id === 'string') assignments[key] = id;
      else diagnostics.push({ path: `assignments.${key}`, message: '文字列でないため規則の割り当てを捨てた' });
    }
  } else if (value.assignments !== undefined) {
    diagnostics.push({ path: 'assignments', message: '形式が不正なため規則の割り当てを捨てた' });
  }
  return { value: { rules, assignments }, diagnostics };
}

export function sanitizeRomajiSettings(value: unknown): RomajiSettings {
  if (!isRecord(value)) return { rules: [], assignments: {} };
  const rules = Array.isArray(value.rules) ? value.rules.filter(isUserRomajiRule) : [];
  const assignments = isRecord(value.assignments)
    ? Object.fromEntries(Object.entries(value.assignments).filter(([, id]) =>
      typeof id === 'string' && id.length > 0,
    ))
    : {};
  return { rules, assignments };
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

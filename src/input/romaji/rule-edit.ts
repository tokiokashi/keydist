import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import { kanaToRomaji } from './kunrei.ts';
import { buildRomajiTable, ROMAJI_RULES, type BuiltinRomajiRuleId, type UserRomajiRule } from './rules.ts';
import { ROMAJI_VARIANTS } from './spelling-variations.ts';

/**
 * 自作のローマ字規則の手持ちを操作する純関数。
 * `input/shapes/user-finger-assignments.ts`と同じ規約で、**変化が無ければ同一の配列参照を返す**。
 * コマンド層（`engine/commands.ts`）はこの参照の一致でno-opを判定する。
 */

/** 自作のローマ字規則のidの接頭辞。組み込みの規則のid（kunrei・oonishi・azik・qwerty）と衝突しない。 */
export const USER_ROMAJI_RULE_ID_PREFIX = 'romaji-';

export const newRomajiRuleId = (): string =>
  `${USER_ROMAJI_RULE_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 規則の中身（名前とid以外）。 */
export type RomajiRuleContent = Pick<UserRomajiRule, 'base' | 'overrides' | 'generateSokuon'>;

/** 新規作成。差分を持たない、基底だけの規則から始める。AZIKは促音の子音重ねを持たない。 */
export function createUserRomajiRule(
  rules: readonly UserRomajiRule[],
  generateId: () => string,
  name: string,
  base: BuiltinRomajiRuleId,
): readonly UserRomajiRule[] {
  return [...rules, { id: generateId(), name, base, overrides: {}, generateSokuon: base !== 'azik' }];
}

/** 複製。複製元が存在しないidなら何もしない。 */
export function duplicateUserRomajiRule(
  rules: readonly UserRomajiRule[],
  sourceId: string,
  generateId: () => string,
  name?: string,
): readonly UserRomajiRule[] {
  const source = rules.find((rule) => rule.id === sourceId);
  if (source === undefined) return rules;
  return [...rules, { ...source, id: generateId(), name: name ?? `${source.name}のコピー`, overrides: { ...source.overrides } }];
}

/** 改名。対象が存在しない、または既に同じ名前なら何もしない。 */
export function renameUserRomajiRule(
  rules: readonly UserRomajiRule[],
  id: string,
  name: string,
): readonly UserRomajiRule[] {
  const target = rules.find((rule) => rule.id === id);
  if (target === undefined || target.name === name) return rules;
  return rules.map((rule) => rule.id === id ? { ...rule, name } : rule);
}

/** 中身の書き換え。対象が存在しない、または中身が変わらないなら何もしない。idと名前は変えない。 */
export function updateUserRomajiRule(
  rules: readonly UserRomajiRule[],
  id: string,
  content: RomajiRuleContent,
): readonly UserRomajiRule[] {
  const target = rules.find((rule) => rule.id === id);
  if (target === undefined || sameContent(target, content)) return rules;
  const overrides = { ...content.overrides };
  return rules.map((rule) => rule.id === id
    ? { ...rule, base: content.base, generateSokuon: content.generateSokuon, overrides }
    : rule);
}

function sameContent(a: RomajiRuleContent, b: RomajiRuleContent): boolean {
  if (a.base !== b.base || a.generateSokuon !== b.generateSokuon) return false;
  const aKeys = Object.keys(a.overrides);
  return aKeys.length === Object.keys(b.overrides).length && aKeys.every((kana) => a.overrides[kana] === b.overrides[kana]);
}

const QWERTY_KEYS = new Set([...QWERTY_LEGEND.join('')]);

/** 綴りとして置ける文字列か。空でなく、空白を含まず、QWERTYのキーだけで書けること。 */
export function isTypableSpelling(roman: string): boolean {
  return roman.length > 0 && [...roman].every((key) => QWERTY_KEYS.has(key));
}

/** 差分の見出しにできるかな。空白を含まず、かなを1文字以上含むこと（複数のかなも可）。 */
export function isKanaKey(kana: string): boolean {
  return !/\s/.test(kana) && /[ぁ-ゖァ-ヺー]/u.test(kana);
}

/**
 * かな1つの綴りを差し替えた差分を返す。`roman`が空なら、そのかなの差分を外して基底の綴りへ戻す。
 * 綴りが置けない文字列の時は`undefined`を返す（呼び出し側が入力の誤りとして示す）。
 * 小文字として扱う。
 */
export function withSpelling(
  overrides: Readonly<Record<string, string>>,
  kana: string,
  roman: string,
): Record<string, string> | undefined {
  const next = { ...overrides };
  const spelling = roman.trim().toLowerCase();
  if (spelling === '') {
    delete next[kana];
    return next;
  }
  if (!isTypableSpelling(spelling)) return undefined;
  next[kana] = spelling;
  return next;
}

/** 揺れる箇所の一覧の1行。 */
export interface SpellingRow {
  readonly kana: string;
  /** 基底のルールの綴り。 */
  readonly base: string;
  /** この規則の綴り。 */
  readonly current: string;
  /** 基底のルールと綴りが違うか。 */
  readonly differs: boolean;
  /** 基底のほかに使われる綴りの候補。固定の一覧に無いかなは空。 */
  readonly alternatives: readonly string[];
}

function spellingIn(table: Map<string, string>, kana: string): string {
  return table.get(kana) ?? kanaToRomaji(kana, table);
}

/**
 * 揺れる箇所の一覧。固定の一覧のかなを並べ、固定の一覧に無いかなを上書きしていれば末尾に足す
 * （上書きが全部一覧に出る）。基底の綴りは組み込みの基底のルールの表から、この規則の綴りは
 * 実際に解決に使う表（`buildRomajiTable`）から読む。
 */
export function spellingRows(rule: UserRomajiRule): readonly SpellingRow[] {
  const baseTable = ROMAJI_RULES[rule.base].table();
  const ruleTable = buildRomajiTable(rule);
  const listed = new Set(ROMAJI_VARIANTS.map((variant) => variant.kana));
  const entries = [
    ...ROMAJI_VARIANTS.map((variant) => ({ kana: variant.kana, alternatives: variant.alternatives })),
    ...Object.keys(rule.overrides)
      .filter((kana) => !listed.has(kana))
      .map((kana) => ({ kana, alternatives: [] as readonly string[] })),
  ];
  return entries.map(({ kana, alternatives }) => {
    const base = spellingIn(baseTable, kana);
    const current = spellingIn(ruleTable, kana);
    return { kana, base, current, differs: base !== current, alternatives };
  });
}

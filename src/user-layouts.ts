import {
  canonicalInputAlternativeIdentity,
  compileSequenceInputAlternative,
  validateCanonicalInputMap,
  type InputAlternative,
} from './core/semantic-input/index.ts';
import { QWERTY_LEGEND, resolveKeyId, type NonThumb } from './geometry.ts';
import { fromRows, SINGLE_LAYER_ID, withRomaji, type Layout } from './layouts/index.ts';
import { ROMAJI_RULES, tableForRule, type RomajiRuleId, type UserRomajiRule } from './romaji/rules.ts';
import type { Sequence } from './layouts/types.ts';

const STORAGE_KEY = 'keydist:layouts';

/** 選べるローマ字の綴り */
export { ROMAJI_RULES };
export type { RomajiRuleId } from './romaji/rules.ts';

export interface UserLayout {
  id: string;
  name: string;
  /** 数字段・上段・ホーム段・下段。数字段は空文字でもよい */
  rows: [string, string, string, string];
  romaji: RomajiRuleId;
  /** 取り込み形式が持つ、単打の段定義では表せないかな・コンボ */
  sequences?: [string, Sequence][];
  /** keyId → 取り込み元の表示ラベル */
  legends?: [string, string][];
  /** かなをローマ字へ変換せず、sequencesを直接使う */
  direct?: boolean;
  /** 配列側が前提とする非親指のホームキー。省略時は物理形状側の既定値を使う */
  homeKeys?: Partial<Record<NonThumb, string>>;
}

/** 各段に置けるキーの数 */
export const ROW_LIMITS = QWERTY_LEGEND.map((row) => row.length);
export const ROW_LABELS = ['数字段', '上段', 'ホーム段', '下段'];

export function load(): UserLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserLayout[];
    return sanitizeUserLayouts(parsed);
  } catch {
    return [];
  }
}

export function save(layouts: UserLayout[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // 保存できなくてもその場の評価は成立する
  }
}

const isSequenceEntry = (entry: unknown): entry is [string, Sequence] =>
  Array.isArray(entry) &&
  entry.length === 2 &&
  typeof entry[0] === 'string' &&
  Array.isArray(entry[1]) &&
  entry[1].every((step) => Array.isArray(step) && step.every((key) => typeof key === 'string'));

const isLegendEntry = (entry: unknown): entry is [string, string] =>
  Array.isArray(entry) &&
  entry.length === 2 &&
  typeof entry[0] === 'string' &&
  typeof entry[1] === 'string';

const isHomeKeys = (value: unknown): value is Partial<Record<NonThumb, string>> =>
  value === undefined || (
    value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((key) => typeof key === 'string')
  );

export const isValidUserLayout = (l: unknown): l is UserLayout => {
  if (!l || typeof l !== 'object') return false;
  const value = l as Partial<UserLayout>;
  return typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.rows) &&
    value.rows.length === 4 &&
    value.rows.every((row) => typeof row === 'string') &&
    (value.sequences === undefined ||
      (Array.isArray(value.sequences) && value.sequences.every(isSequenceEntry))) &&
    (value.legends === undefined ||
      (Array.isArray(value.legends) && value.legends.every(isLegendEntry))) &&
    (value.direct === undefined || typeof value.direct === 'boolean') &&
    isHomeKeys(value.homeKeys);
};

export function sanitizeUserLayouts(value: unknown): UserLayout[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter(isValidUserLayout).filter((layout) => {
    if (seen.has(layout.id)) return false;
    seen.add(layout.id);
    return true;
  });
}

/**
 * 入力を検査する。列数オーバーだけを弾く。
 * 同じ文字が複数のキーに載る配列はありうるので重複は通し、
 * canonical input alternativeとして全pathを保持する。
 */
export function validate(rows: string[]): string[] {
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const length = [...row.trim()].length;
    if (length > ROW_LIMITS[i]) {
      errors.push(`${ROW_LABELS[i]}が ${length} 文字。この形状には ${ROW_LIMITS[i]} 個までしか置けない`);
    }
  });
  if (rows.slice(1).every((r) => r.trim() === '')) errors.push('英字の段が空');
  return errors;
}

/** 数字段が空ならQWERTYのものを使う */
export function toLayout(def: UserLayout): Layout {
  const imported = def.sequences !== undefined || def.legends !== undefined;
  const rows = def.rows.map((r, i) => (r.trim() === '' && !imported ? QWERTY_LEGEND[i] : r));
  // imported形式は物理spaceを機能キーとして扱う場合があるため、
  // syntheticなthumb-r -> ' ' を足さず、明示されたsequenceだけをkeymapへ入れる。
  const layout = fromRows(
    def.id,
    def.name,
    rows,
    imported ? {} : { RT: ' ' },
  );
  if (!def.sequences && !def.legends) return { ...layout, homeKeys: def.homeKeys };
  const map = new Map(layout.map);
  const canonicalInputs = new Map<string, InputAlternative[]>(
    [...layout.canonicalInputs].map(([output, alternatives]) =>
      [output, [...alternatives]] as const),
  );
  for (const [output, sequence] of def.sequences ?? []) {
    // imported sequenceは従来mapを上書きしていたためauthoring defaultとして先頭へ置く。
    map.set(output, sequence);
    const alternative = compileSequenceInputAlternative(output, sequence, SINGLE_LAYER_ID);
    const alternativeIdentity = canonicalInputAlternativeIdentity(alternative);
    canonicalInputs.set(output, [
      alternative,
      ...(canonicalInputs.get(output) ?? []).filter((candidate) =>
        canonicalInputAlternativeIdentity(candidate) !== alternativeIdentity),
    ]);
  }
  const legends = new Map(layout.legends);
  for (const [key, label] of def.legends ?? []) legends.set(resolveKeyId(key), label);
  validateCanonicalInputMap(canonicalInputs);
  return {
    ...layout,
    map,
    canonicalInputs,
    legends,
    homeKeys: def.homeKeys,
  };
}

export function toJapaneseLayout(def: UserLayout, customRules: UserRomajiRule[] = []): Layout {
  const layout = toLayout(def);
  return def.direct ? layout : withRomaji(layout, tableForRule(def.romaji, customRules));
}

export const newId = () => `user-${Date.now().toString(36)}`;

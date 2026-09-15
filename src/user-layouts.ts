import { QWERTY_LEGEND, resolveKeyId } from './geometry.ts';
import { fromRows, withRomaji, type Layout } from './layouts/index.ts';
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
  /** かなをローマ字へ変換せず、sequences を直接使う */
  direct?: boolean;
}

/** 各段に置けるキーの数 */
export const ROW_LIMITS = QWERTY_LEGEND.map((row) => row.length);
export const ROW_LABELS = ['数字段', '上段', 'ホーム段', '下段'];

export function load(): UserLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserLayout[];
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
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

const isValid = (l: unknown): l is UserLayout => {
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
    (value.direct === undefined || typeof value.direct === 'boolean');
};

/**
 * 入力を検査する。列数オーバーだけを弾く。
 * 同じ文字が複数のキーに載る配列はありうるので重複は通す（打鍵には先の方を使う）。
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

/** 数字段が空なら QWERTY のものを使う */
export function toLayout(def: UserLayout): Layout {
  const imported = def.sequences !== undefined || def.legends !== undefined;
  const rows = def.rows.map((r, i) => (r.trim() === '' && !imported ? QWERTY_LEGEND[i] : r));
  const layout = fromRows(def.id, def.name, rows);
  if (!def.sequences && !def.legends) return layout;
  const map = new Map(layout.map);
  for (const [output, sequence] of def.sequences ?? []) map.set(output, sequence);
  const legends = new Map(layout.legends);
  for (const [key, label] of def.legends ?? []) legends.set(resolveKeyId(key), label);
  const maxCharLength = Math.max(1, ...[...map.keys()].map((key) => key.length));
  return { ...layout, map, legends, maxCharLength };
}

export function toJapaneseLayout(def: UserLayout, customRules: UserRomajiRule[] = []): Layout {
  const layout = toLayout(def);
  return def.direct ? layout : withRomaji(layout, tableForRule(def.romaji, customRules));
}

export const newId = () => `user-${Date.now().toString(36)}`;

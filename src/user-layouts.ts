import { QWERTY_LEGEND } from './geometry.ts';
import { fromRows, withRomaji, type Layout } from './layouts/index.ts';
import { kunrei } from './romaji/kunrei.ts';
import { oonishiRomaji } from './romaji/oonishi.ts';

const STORAGE_KEY = 'keydist:layouts';

/** 選べるローマ字の綴り */
export const ROMAJI_RULES = {
  kunrei: { name: '訓令式（si / sya / zi / zya）', table: kunrei },
  oonishi: { name: '大西式（si / sha / ji / ja）', table: oonishiRomaji },
} as const;

export type RomajiRuleId = keyof typeof ROMAJI_RULES;

export interface UserLayout {
  id: string;
  name: string;
  /** 数字段・上段・ホーム段・下段。数字段は空文字でもよい */
  rows: [string, string, string, string];
  romaji: RomajiRuleId;
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

const isValid = (l: unknown): l is UserLayout =>
  !!l &&
  typeof (l as UserLayout).id === 'string' &&
  typeof (l as UserLayout).name === 'string' &&
  Array.isArray((l as UserLayout).rows) &&
  (l as UserLayout).rows.length === 4;

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
  const rows = def.rows.map((r, i) => (r.trim() === '' ? QWERTY_LEGEND[i] : r.trim()));
  return fromRows(def.id, def.name, rows);
}

export function toJapaneseLayout(def: UserLayout): Layout {
  return withRomaji(toLayout(def), ROMAJI_RULES[def.romaji].table());
}

export const newId = () => `user-${Date.now().toString(36)}`;

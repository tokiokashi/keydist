import type { CodecDiagnostic, DecodedWithDiagnostics } from '../codec/index.ts';
import {
  canonicalInputAlternativeIdentity,
  compileSequenceInputAlternative,
  validateCanonicalInputMap,
  type InputAlternative,
} from '../semantics/index.ts';
import { QWERTY_LEGEND, resolveKeyId, type NonThumb } from '../shapes/geometry.ts';
import { fromRows, SINGLE_LAYER_ID, withRomaji, type Layout } from './index.ts';
import { ROMAJI_RULES, tableForRule, type RomajiRuleId, type UserRomajiRule } from '../romaji/rules.ts';
import type { Sequence } from './types.ts';

/** 選べるローマ字の綴り */
export { ROMAJI_RULES };
export type { RomajiRuleId } from '../romaji/rules.ts';

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
  /** 配列側が前提とする非親指のホームキー。省略時は物理配列側の既定値を使う */
  homeKeys?: Partial<Record<NonThumb, string>>;
}

/** 各段に置けるキーの数 */
export const ROW_LIMITS = QWERTY_LEGEND.map((row) => row.length);
export const ROW_LABELS = ['数字段', '上段', 'ホーム段', '下段'];


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

/**
 * 保存された自作配列の一覧を読む。値があって配列でない時（nullを含む）と、壊れた要素・id重複を
 * 捨てる時は診断を積む。`undefined`（保存が無い）は空の一覧で正しいので診断しない。
 */
export function decodeUserLayouts(value: unknown): DecodedWithDiagnostics<UserLayout[]> {
  if (!Array.isArray(value)) {
    const diagnostics = value === undefined
      ? []
      : [{ path: '', message: '配列形式でないため自作の配列を捨てた' }];
    return { value: [], diagnostics };
  }
  const diagnostics: CodecDiagnostic[] = [];
  const seen = new Set<string>();
  const layouts: UserLayout[] = [];
  value.forEach((candidate, index) => {
    const path = `[${index}]`;
    if (!isValidUserLayout(candidate)) {
      diagnostics.push({ path, message: '形式が不正なため自作の配列を捨てた' });
      return;
    }
    if (seen.has(candidate.id)) {
      diagnostics.push({ path, message: `id「${candidate.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(candidate.id);
    layouts.push(candidate);
  });
  return { value: layouts, diagnostics };
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
      errors.push(`${ROW_LABELS[i]}が ${length} 文字。この物理配列には ${ROW_LIMITS[i]} 個までしか置けない`);
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

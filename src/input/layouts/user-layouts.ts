import { defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic, type DecodedWithDiagnostics } from '../codec/index.ts';
import { droppedDuplicateId, droppedNotArray } from '#input/codec/index.ts';
import {
  canonicalInputAlternativeIdentity,
  compileSequenceInputAlternative,
  validateCanonicalInputMap,
  type InputAlternative,
} from '../semantics/index.ts';
import { QWERTY_LEGEND, resolveKeyId, type NonThumb } from '../shapes/geometry.ts';
import { fromRows, SINGLE_LAYER_ID, withRomaji, withShiftedOutputs, type Layout } from './index.ts';
import { ROMAJI_RULES, tableForRule, type RomajiRuleId, type UserRomajiRule } from '../romaji/rules.ts';
import { buildFaceLayout, FACE_BODY_PROPERTIES, readFaceBody, type UserFaceBody } from './kana-face-layout.ts';
import type { Sequence } from './types.ts';

export type { UserFace, UserFaceBody } from './kana-face-layout.ts';

/** 選べるローマ字の綴り */
export { ROMAJI_RULES };
export type { RomajiRuleId } from '../romaji/rules.ts';

interface UserLayoutCommon {
  id: string;
  name: string;
  /** 配列側が前提とする非親指のホームキー。省略時は物理配列側の既定値を使う */
  homeKeys?: Partial<Record<NonThumb, string>>;
}

/** 段の文字（と取り込み形式）で定義する配列 */
export interface StageUserLayout extends UserLayoutCommon {
  /** 数字段・上段・ホーム段・下段。数字段は空文字でもよい */
  rows: [string, string, string, string];
  /**
   * 推奨のローマ字規則。省略した配列は推奨を持たず、全体の値の規則で打つ。
   * 指す規則が無い配列（読み込んだファイルに規則が無い等）もこの形で持つ。ローマ字を経ない配列は見ない
   */
  romaji?: RomajiRuleId;
  /** 取り込み形式が持つ、単打の段定義では表せないかな・コンボ */
  sequences?: [string, Sequence][];
  /** keyId → 取り込み元の表示ラベル */
  legends?: [string, string][];
  /** かなをローマ字へ変換せず、sequencesを直接使う */
  direct?: boolean;
  faces?: undefined;
  composition?: undefined;
}

/**
 * 面で定義するかな配列。ローマ字を経ずに直接打つ配列で、段の文字・取り込み形式・ローマ字規則とは併せ持たない。
 * `rows` を持たないのは、面の上のキーごとの出力が段の文字の代わりだから（両方あると、どちらが打鍵を決めるかが二重になる）。
 */
export interface FaceUserLayout extends UserLayoutCommon, UserFaceBody {
  rows?: undefined;
  romaji?: undefined;
  sequences?: undefined;
  legends?: undefined;
  direct?: undefined;
}

export type UserLayout = StageUserLayout | FaceUserLayout;

/** 面で定義する配列か。 */
export const isFaceUserLayout = (layout: UserLayout): layout is FaceUserLayout => layout.faces !== undefined;

/** ローマ字を経ずにかなを直接打つ配列か（`direct` の配列と、面で定義する配列）。 */
export const isDirectUserLayout = (layout: UserLayout): boolean => layout.direct === true || layout.faces !== undefined;

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
  Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string';

const isHomeKeys = (value: unknown): value is Partial<Record<NonThumb, string>> =>
  value === undefined ||
  (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((key) => typeof key === 'string'));

/** 面で定義する形のどれかの項目を持つか（持てば、面の形として読む）。 */
const hasFaceProperty = (value: Record<string, unknown>): boolean => [...FACE_BODY_PROPERTIES].some((name) => value[name] !== undefined);

/** 面で定義する配列が、段の文字・取り込み形式・ローマ字規則と併せ持たない項目。 */
const STAGE_PROPERTIES = ['rows', 'romaji', 'sequences', 'legends', 'direct'] as const;

/**
 * 面で定義する配列として読む。面の形を満たさなければ理由を返す。満たせば、triggerのキーを正式名にそろえた配列を返す。
 * 面の形と段の形は排他なので、段の形の項目を持つ配列は読めない。
 */
function readFaceUserLayout(value: Record<string, unknown>): FaceUserLayout | string {
  const stage = STAGE_PROPERTIES.find((name) => value[name] !== undefined);
  if (stage !== undefined) return `面で定義する配列は、段の形の項目「${stage}」を併せ持てません`;
  const { body, problems } = readFaceBody(value);
  if (body === undefined) return problems[0]?.message ?? '面の定義を読めません';
  return { ...(value as unknown as UserLayoutCommon), ...body };
}

/**
 * 保存された自作の配列として読む。読めなければ、捨てる理由を返す。面で定義する配列は、
 * 面の形の読み込み（JSONの貼り付けと同じ）を通し、triggerのキーを正式名にそろえて返す。
 */
function readUserLayout(l: unknown): UserLayout | string {
  const form = '形式が不正なため自作の配列を捨てました';
  if (!l || typeof l !== 'object' || Array.isArray(l)) return form;
  const value = l as Record<string, unknown>;
  const common = typeof value.id === 'string' && typeof value.name === 'string' && isHomeKeys(value.homeKeys);
  if (!common) return form;
  if (hasFaceProperty(value)) {
    const read = readFaceUserLayout(value);
    return typeof read === 'string' ? `${form}（${read}）` : read;
  }
  const stage = value as Partial<StageUserLayout>;
  const valid =
    (stage.romaji === undefined || typeof stage.romaji === 'string') &&
    Array.isArray(stage.rows) &&
    stage.rows.length === 4 &&
    stage.rows.every((row) => typeof row === 'string') &&
    (stage.sequences === undefined || (Array.isArray(stage.sequences) && stage.sequences.every(isSequenceEntry))) &&
    (stage.legends === undefined || (Array.isArray(stage.legends) && stage.legends.every(isLegendEntry))) &&
    (stage.direct === undefined || typeof stage.direct === 'boolean');
  return valid ? (value as unknown as StageUserLayout) : form;
}

export const isValidUserLayout = (l: unknown): l is UserLayout => typeof readUserLayout(l) !== 'string';

/**
 * 保存された自作配列の一覧を読む。値があって配列でない時（nullを含む）と、壊れた要素・id重複を
 * 捨てる時は診断を積む。`undefined`（保存が無い）は空の一覧で正しいので診断しない。
 */
export function decodeUserLayouts(value: unknown): DecodedWithDiagnostics<UserLayout[]> {
  if (!Array.isArray(value)) {
    const diagnostics = value === undefined ? [] : [{ path: '', message: droppedNotArray('自作の配列') }];
    return { value: [], diagnostics };
  }
  const diagnostics: CodecDiagnostic[] = [];
  const seen = new Set<string>();
  const layouts: UserLayout[] = [];
  value.forEach((candidate, index) => {
    const path = `[${index}]`;
    const read = readUserLayout(candidate);
    if (typeof read === 'string') {
      diagnostics.push({ path, message: read });
      return;
    }
    if (seen.has(read.id)) {
      diagnostics.push({ path, message: droppedDuplicateId(read.id) });
      return;
    }
    seen.add(read.id);
    layouts.push(read);
  });
  return { value: layouts, diagnostics };
}

/**
 * 自作の配列の手持ちのcodec（版1）。配列そのものの形は`decodeUserLayouts`が決め、
 * ここは版付きの外殻と診断の経路（`layouts`以下）だけを持つ。
 * `layouts`が配列でなくても資産全体は失敗にせず空扱いにする（捨てた旨の診断は積む）。
 */
export const USER_LAYOUTS_CODEC: AssetCodec<readonly UserLayout[]> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const decoded = decodeUserLayouts(payload.layouts);
    for (const diagnostic of decoded.diagnostics) {
      diagnostics.push({ path: `layouts${diagnostic.path}`, message: diagnostic.message });
    }
    return decoded.value;
  },
  encodePayload: (value) => ({ layouts: value.map((layout) => structuredClone(layout)) }),
});

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
      errors.push(`${ROW_LABELS[i]}が ${length} 文字。この物理配列には ${ROW_LIMITS[i]} 個までしか置けません`);
    }
  });
  if (rows.slice(1).every((r) => r.trim() === '')) errors.push('英字の段が空');
  return errors;
}

/** 数字段が空ならQWERTYのものを使う */
export function toLayout(def: UserLayout): Layout {
  if (def.faces !== undefined) {
    const layout = buildFaceLayout(def.id, def.name, def);
    return def.homeKeys === undefined ? layout : { ...layout, homeKeys: def.homeKeys };
  }
  const imported = def.sequences !== undefined || def.legends !== undefined;
  const rows = def.rows.map((r, i) => (r.trim() === '' && !imported ? QWERTY_LEGEND[i] : r));
  // imported形式は物理spaceを機能キーとして扱う場合があるため、
  // syntheticなthumb-r -> ' ' を足さず、明示されたsequenceだけをkeymapへ入れる。
  const layout = fromRows(def.id, def.name, rows, imported ? {} : { RT: ' ' });
  if (!def.sequences && !def.legends) {
    // 組み込みの英字配列と同じく、単打の段定義には通常Shiftの出力を付ける。
    // 直接かな配列は組み込みにShift記号が無いので付けない。
    const base = def.direct ? layout : withShiftedOutputs(layout);
    return { ...base, ...(def.homeKeys === undefined ? {} : { homeKeys: def.homeKeys }) };
  }
  const map = new Map(layout.map);
  const canonicalInputs = new Map<string, InputAlternative[]>(
    [...layout.canonicalInputs].map(([output, alternatives]) => [output, [...alternatives]] as const),
  );
  for (const [output, sequence] of def.sequences ?? []) {
    // imported sequenceは従来mapを上書きしていたためauthoring defaultとして先頭へ置く。
    map.set(output, sequence);
    const alternative = compileSequenceInputAlternative(output, sequence, SINGLE_LAYER_ID);
    const alternativeIdentity = canonicalInputAlternativeIdentity(alternative);
    canonicalInputs.set(output, [
      alternative,
      ...(canonicalInputs.get(output) ?? []).filter((candidate) => canonicalInputAlternativeIdentity(candidate) !== alternativeIdentity),
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
    ...(def.homeKeys === undefined ? {} : { homeKeys: def.homeKeys }),
  };
}

export function toJapaneseLayout(def: UserLayout, customRules: UserRomajiRule[] = []): Layout {
  const layout = toLayout(def);
  if (isDirectUserLayout(def) || def.romaji === undefined) return layout;
  return withRomaji(layout, tableForRule(def.romaji, customRules));
}

export const newId = () => `user-${Date.now().toString(36)}`;

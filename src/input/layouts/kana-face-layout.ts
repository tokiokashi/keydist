import { isRecord, UNSAFE_OBJECT_KEYS } from '../codec/index.ts';
import { keyId, LEFT_COLUMN_KEYS, QWERTY_LEGEND, resolveKeyId, SHIFT_KEY, THUMB_KEY } from '../shapes/geometry.ts';
import { physicalKeyDisplayLabel } from '../shapes/key-labels.ts';
import type { RomajiRuleId } from '../romaji/rules.ts';
import { composeKanaMarks, DAKUTEN_MARK, HANDAKUTEN_MARK, type KanaMarkComposition } from './kana-composition.ts';
import type { LayoutKind } from './kind.ts';
import { fromFaces, type Face, type FaceMode, type InputRole, type Layout, type LayerKind, type TriggerOrder, type TriggerPersistence } from './types.ts';

/**
 * 面で定義する配列（かなの種類・英字の種類）の、利用者が書く形（保存・JSONの貼り付けで共通）と、`Layout` への組み立て。
 *
 * 面は「triggerのキー集合・打鍵の順序・triggerの持続・面の上のキーごとの出力」の並び。
 * 順序・持続・入力の意味は、triggerを持つ面では必ず書く（値を推論しない）。
 * 意味（`SemanticInput`）は既存の `fromFaces` とcompilerが作る。
 */

/** 面1つ。 */
export interface UserFace {
  /** triggerのキーのid。単打の面は空。親指・Shiftのキーと、QWERTY刻印のキー、左端の列の3つのキーを書ける */
  trigger: string[];
  /** 打鍵の順序（同時・前置・後置）。triggerを持つ面は必須、単打の面は持たない */
  mode?: FaceMode;
  /** triggerの持続（単発・保持）。triggerを持つ面は必須、単打の面は持たない */
  triggerPersistence?: TriggerPersistence;
  /** 面が担う入力の意味 */
  inputRole: InputRole;
  /** compositionの面をレイヤーとコンボ枠のどちらへ計上するか。compositionの面だけが持ち、必須 */
  compositionAggregation?: LayerKind;
  /** 同時の面でも、triggerを先（または後）に押すことを要求する */
  triggerOrder?: TriggerOrder;
  /** 同じ名前の単一キーの面を1レイヤーへ畳む。単打の面は持たない */
  layer?: string;
  /** 修飾の面の、triggerのキー → 修飾の組の名前。修飾の面だけが持つ */
  modifierGroups?: Record<string, string>;
  /** 面の上のキー（QWERTY刻印のキーと、左端の列の `backquote`・`tab`・`caps-lock`）のid → 出力 */
  outputs: Record<string, string>;
}

/** かなの種類の面の形の中身。ローマ字を経ずにかなを直接打つ。 */
export interface KanaFaceBody {
  kind: 'kana';
  faces: UserFace[];
  /** 濁点・半濁点を後置して合成するか。それぞれ明示する。かなの種類だけが持ち、必須 */
  composition: KanaMarkComposition;
  romaji?: undefined;
}

/** 英字の種類の面の形の中身。日本語のテキストにはローマ字規則を通して使う。 */
export interface AlphaFaceBody {
  kind: 'alpha';
  faces: UserFace[];
  /** 推奨のローマ字規則。省略した配列は推奨を持たず、全体の値の規則で打つ */
  romaji?: RomajiRuleId;
  composition?: undefined;
}

/** 面の形の配列の中身。種類で持てる項目が分かれる。 */
export type UserFaceBody = KanaFaceBody | AlphaFaceBody;

/** 読み込みや組み立ての誤り1件。`path` は `faces[2].outputs.q` のように定義の中の位置。 */
export interface FaceLayoutProblem {
  readonly path: string;
  /** 利用者に見せる文 */
  readonly message: string;
  /** 内部の検査が返した文。画面の本文には出さず、詳細として添える */
  readonly detail?: string;
}

/** 同じかなが2か所以上にある旨（代わりの打ち方）。誤りではない。 */
export interface FaceLayoutNotice {
  readonly output: string;
  readonly message: string;
}

const MODES: readonly FaceMode[] = ['simultaneous', 'prefix', 'suffix'];
const PERSISTENCES: readonly TriggerPersistence[] = ['single', 'hold-capable'];
const INPUT_ROLES: readonly InputRole[] = ['layer', 'modifier', 'composition'];
const AGGREGATIONS: readonly LayerKind[] = ['layer', 'combo'];
const TRIGGER_ORDERS: readonly TriggerOrder[] = ['prefix', 'suffix'];

const FACE_PROPERTIES: ReadonlySet<string> = new Set([
  'trigger',
  'mode',
  'triggerPersistence',
  'inputRole',
  'compositionAggregation',
  'triggerOrder',
  'layer',
  'modifierGroups',
  'outputs',
]);
/** 面の形だけが持つ項目。段の形と面の形を見分けるのに使う（`kind` と `romaji` は段の形も持つので入れない） */
export const FACE_BODY_PROPERTIES: ReadonlySet<string> = new Set(['faces', 'composition']);
const KINDS: readonly LayoutKind[] = ['alpha', 'kana'];
const COMPOSITION_PROPERTIES: ReadonlySet<string> = new Set(['dakuten', 'handakuten']);

/** 面の上に置ける行数（QWERTY刻印の4行）と、1行の列数の上限 */
const MAX_ROWS = QWERTY_LEGEND.length;
const MAX_COLUMNS = 16;

const GRID_KEY = /^r(\d+)c(\d+)$/;

/** 面の上のキー（出力を置ける位置）の行と列。物理キーの名前でなければ `undefined`。 */
export function gridPositionOf(key: string): { row: number; col: number } | undefined {
  for (const [row, legend] of QWERTY_LEGEND.entries()) {
    const col = legend.indexOf(key);
    if (key.length === 1 && col >= 0) return { row, col };
  }
  const grid = GRID_KEY.exec(key);
  if (grid === null) return undefined;
  const row = Number(grid[1]);
  const col = Number(grid[2]);
  // 刻印で書ける位置を `r0c0` のように別名で書くのは認めない（同じキーが2通りの名前を持たないように）
  if (row >= MAX_ROWS || col >= MAX_COLUMNS || keyId(row, col) !== key) return undefined;
  return { row, col };
}

const LEFT_COLUMN_KEY_SET: ReadonlySet<string> = new Set(LEFT_COLUMN_KEYS);

/** 面の出力・ホームキーに書けるキーか（面の上のキーと、左端の列の3つのキー）。 */
export const isFaceOutputKey = (key: string): boolean => LEFT_COLUMN_KEY_SET.has(key) || gridPositionOf(key) !== undefined;

const TRIGGER_NAMED_KEYS: ReadonlySet<string> = new Set([THUMB_KEY.LT, THUMB_KEY.RT, 'space', SHIFT_KEY.L, SHIFT_KEY.R]);

/** triggerに書けるキーか（面の上のキー、左端の列の3つのキー、親指、Shift）。 */
const isTriggerKey = (key: string): boolean => TRIGGER_NAMED_KEYS.has(key) || isFaceOutputKey(key);

const keyName = (key: string): string => `${physicalKeyDisplayLabel(key)}（${key}）`;

const describeValue = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** 面の名前。利用者は面を並びの順で数える。 */
const faceLabel = (index: number): string => `面${index + 1}`;

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** 読み込みの途中で誤りを積む入れ物。 */
class Problems {
  readonly list: FaceLayoutProblem[] = [];
  add(path: string, message: string, detail?: string): false {
    this.list.push({ path, message, ...(detail === undefined ? {} : { detail }) });
    return false;
  }
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string, label: string, problems: Problems): Parsed<T> {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return { ok: true, value: value as T };
  problems.add(path, `${label}は ${allowed.map((entry) => `「${entry}」`).join('・')} のどれかで書いてください（${describeValue(value)}）`);
  return { ok: false };
}

function readFace(raw: unknown, index: number, problems: Problems): UserFace | undefined {
  const path = `faces[${index}]`;
  const label = faceLabel(index);
  if (!isRecord(raw)) {
    problems.add(path, `${label}がオブジェクトではありません`);
    return undefined;
  }
  const before = problems.list.length;
  for (const name of Object.keys(raw)) {
    if (UNSAFE_OBJECT_KEYS.has(name) || !FACE_PROPERTIES.has(name)) {
      problems.add(`${path}.${name}`, `${label}に、知らない項目「${name}」があります`);
    }
  }

  // trigger
  const trigger: string[] = [];
  if (!Array.isArray(raw.trigger)) {
    problems.add(`${path}.trigger`, `${label}の切り替えのキー（trigger）を配列で書いてください。単打の面は空の配列です`);
  } else {
    raw.trigger.forEach((entry: unknown, triggerIndex) => {
      const triggerPath = `${path}.trigger[${triggerIndex}]`;
      if (typeof entry !== 'string' || !isTriggerKey(entry)) {
        problems.add(triggerPath, `${label}の切り替えのキー ${describeValue(entry)} は、物理キーの名前ではありません`);
        return;
      }
      const resolved = resolveKeyId(entry);
      if (trigger.includes(resolved)) {
        problems.add(triggerPath, `${label}の切り替えのキーに、同じキー ${keyName(resolved)} が2回あります`);
        return;
      }
      trigger.push(resolved);
    });
  }
  const triggerless = Array.isArray(raw.trigger) && raw.trigger.length === 0;
  const triggered = Array.isArray(raw.trigger) && raw.trigger.length > 0;

  // 順序・持続: triggerを持つ面は必ず書き、単打の面は持たない
  let mode: FaceMode | undefined;
  if (triggered) {
    if (raw.mode === undefined) {
      problems.add(`${path}.mode`, `${label}は、打鍵の順序（mode）を書いてください`);
    } else {
      const read = readEnum(raw.mode, MODES, `${path}.mode`, `${label}の打鍵の順序（mode）`, problems);
      if (read.ok) mode = read.value;
    }
  } else if (triggerless && raw.mode !== undefined) {
    problems.add(`${path}.mode`, `${label}は単打の面なので、打鍵の順序（mode）を持てません`);
  }
  let triggerPersistence: TriggerPersistence | undefined;
  if (triggered) {
    if (raw.triggerPersistence === undefined) {
      problems.add(`${path}.triggerPersistence`, `${label}は、切り替えのキーの持続（triggerPersistence）を書いてください`);
    } else {
      const read = readEnum(
        raw.triggerPersistence,
        PERSISTENCES,
        `${path}.triggerPersistence`,
        `${label}の切り替えのキーの持続（triggerPersistence）`,
        problems,
      );
      if (read.ok) triggerPersistence = read.value;
    }
  } else if (triggerless && raw.triggerPersistence !== undefined) {
    problems.add(`${path}.triggerPersistence`, `${label}は単打の面なので、切り替えのキーの持続（triggerPersistence）を持てません`);
  }

  // 入力の意味
  let inputRole: InputRole | undefined;
  if (raw.inputRole === undefined) {
    problems.add(`${path}.inputRole`, `${label}は、入力の意味（inputRole）を書いてください`);
  } else {
    const read = readEnum(raw.inputRole, INPUT_ROLES, `${path}.inputRole`, `${label}の入力の意味（inputRole）`, problems);
    if (read.ok) inputRole = read.value;
  }
  let compositionAggregation: LayerKind | undefined;
  if (inputRole === 'composition') {
    if (raw.compositionAggregation === undefined) {
      problems.add(
        `${path}.compositionAggregation`,
        `${label}はcompositionの面なので、レイヤーとコンボ枠のどちらに数えるか（compositionAggregation）を書いてください`,
      );
    } else {
      const read = readEnum(
        raw.compositionAggregation,
        AGGREGATIONS,
        `${path}.compositionAggregation`,
        `${label}の数え方（compositionAggregation）`,
        problems,
      );
      if (read.ok) compositionAggregation = read.value;
    }
  } else if (inputRole !== undefined && raw.compositionAggregation !== undefined) {
    problems.add(`${path}.compositionAggregation`, `${label}の数え方（compositionAggregation）は、入力の意味がcompositionの面だけが持てます`);
  }

  // 任意の項目
  let triggerOrder: TriggerOrder | undefined;
  if (raw.triggerOrder !== undefined) {
    if (triggerless) {
      problems.add(`${path}.triggerOrder`, `${label}は単打の面なので、切り替えのキーの先押し（triggerOrder）を持てません`);
    } else {
      const read = readEnum(raw.triggerOrder, TRIGGER_ORDERS, `${path}.triggerOrder`, `${label}の切り替えのキーの先押し（triggerOrder）`, problems);
      if (read.ok) triggerOrder = read.value;
    }
  }
  if (triggerOrder !== undefined && mode !== undefined && mode !== 'simultaneous' && mode !== triggerOrder) {
    problems.add(
      `${path}.triggerOrder`,
      `${label}の打鍵の順序（mode）が「${mode}」なのに、切り替えのキーの先押し（triggerOrder）が「${triggerOrder}」で食い違っています`,
    );
  }
  let layer: string | undefined;
  if (raw.layer !== undefined) {
    if (triggerless) {
      problems.add(`${path}.layer`, `${label}は単打の面なので、レイヤーの名前（layer）を持てません`);
    } else if (typeof raw.layer !== 'string' || raw.layer === '') {
      problems.add(`${path}.layer`, `${label}のレイヤーの名前（layer）は、空でない文字列で書いてください`);
    } else {
      layer = raw.layer;
    }
  }
  if (compositionAggregation === 'layer' && trigger.length !== 1) {
    problems.add(
      `${path}.compositionAggregation`,
      `${label}はレイヤーに数えるcompositionの面なので、切り替えのキー（trigger）は1キーだけで書いてください`,
    );
  }
  if (compositionAggregation === 'combo' && layer !== undefined) {
    problems.add(`${path}.layer`, `${label}はコンボ枠に数えるcompositionの面なので、レイヤーの名前（layer）を持てません`);
  }
  let modifierGroups: Record<string, string> | undefined;
  if (raw.modifierGroups !== undefined) {
    if (inputRole !== undefined && inputRole !== 'modifier') {
      problems.add(`${path}.modifierGroups`, `${label}の修飾の組（modifierGroups）は、入力の意味がmodifierの面だけが持てます`);
    } else if (!isRecord(raw.modifierGroups)) {
      problems.add(`${path}.modifierGroups`, `${label}の修飾の組（modifierGroups）は、キー → 組の名前のオブジェクトで書いてください`);
    } else {
      const groups: Record<string, string> = {};
      for (const [key, group] of Object.entries(raw.modifierGroups)) {
        const groupPath = `${path}.modifierGroups.${key}`;
        if (UNSAFE_OBJECT_KEYS.has(key) || !isTriggerKey(key)) {
          problems.add(groupPath, `${label}の修飾の組のキー「${key}」は、物理キーの名前ではありません`);
        } else if (typeof group !== 'string' || group === '') {
          problems.add(groupPath, `${label}の修飾の組の名前は、空でない文字列で書いてください（${keyName(resolveKeyId(key))}）`);
        } else if (resolveKeyId(key) in groups) {
          problems.add(groupPath, `${label}の修飾の組に、同じキー ${keyName(resolveKeyId(key))} が2回あります`);
        } else {
          groups[resolveKeyId(key)] = group;
        }
      }
      modifierGroups = groups;
      if (Array.isArray(raw.trigger) && trigger.length === raw.trigger.length) {
        for (const key of Object.keys(groups)) {
          if (!trigger.includes(key)) {
            problems.add(`${path}.modifierGroups.${key}`, `${label}の修飾の組のキー ${keyName(key)} は、同じ面の切り替えのキー（trigger）にありません`);
          }
        }
        const missing = trigger.filter((key) => !(key in groups));
        if (missing.length > 0 && Object.keys(groups).every((key) => trigger.includes(key))) {
          problems.add(
            `${path}.modifierGroups`,
            `${label}の修飾の組は、切り替えのキーをすべて分類してください（足りないキー: ${missing.map(keyName).join('・')}）`,
          );
        }
      }
    }
  }

  // 面の上のキーごとの出力
  const outputs: Record<string, string> = {};
  if (!isRecord(raw.outputs)) {
    problems.add(`${path}.outputs`, `${label}の出力（outputs）を、キー → 出力のオブジェクトで書いてください`);
  } else {
    const entries = Object.entries(raw.outputs);
    if (entries.length === 0) problems.add(`${path}.outputs`, `${label}に出力が1つもありません`);
    for (const [key, output] of entries) {
      const outputPath = `${path}.outputs.${key}`;
      if (UNSAFE_OBJECT_KEYS.has(key) || !isFaceOutputKey(key)) {
        problems.add(outputPath, `${label}の出力のキー「${key}」は、面の上の物理キーの名前ではありません`);
      } else if (typeof output !== 'string' || output.trim() === '') {
        problems.add(outputPath, `${label}の${keyName(key)}の出力が空です`);
      } else {
        outputs[key] = output;
      }
    }
    for (const key of trigger) {
      if (key in outputs) problems.add(`${path}.outputs.${key}`, `${label}の切り替えのキー ${keyName(key)} に、同じ面の出力があります`);
    }
  }

  if (problems.list.length > before || inputRole === undefined) return undefined;
  return {
    trigger,
    ...(mode === undefined ? {} : { mode }),
    ...(triggerPersistence === undefined ? {} : { triggerPersistence }),
    inputRole,
    ...(compositionAggregation === undefined ? {} : { compositionAggregation }),
    ...(triggerOrder === undefined ? {} : { triggerOrder }),
    ...(layer === undefined ? {} : { layer }),
    ...(modifierGroups === undefined ? {} : { modifierGroups }),
    outputs,
  };
}

function readComposition(raw: unknown, problems: Problems): KanaMarkComposition | undefined {
  if (raw === undefined) {
    problems.add('composition', '濁点・半濁点を後から打って合成するか（composition）を書いてください');
    return undefined;
  }
  if (!isRecord(raw)) {
    problems.add('composition', '濁点・半濁点の合成（composition）を、dakutenとhandakutenを持つオブジェクトで書いてください');
    return undefined;
  }
  const before = problems.list.length;
  for (const name of Object.keys(raw)) {
    if (UNSAFE_OBJECT_KEYS.has(name) || !COMPOSITION_PROPERTIES.has(name)) {
      problems.add(`composition.${name}`, `濁点・半濁点の合成（composition）に、知らない項目「${name}」があります`);
    }
  }
  const dakuten = raw.dakuten;
  const handakuten = raw.handakuten;
  if (typeof dakuten !== 'boolean') problems.add('composition.dakuten', '濁点で合成するか（composition.dakuten）をtrueかfalseで書いてください');
  if (typeof handakuten !== 'boolean')
    problems.add('composition.handakuten', '半濁点で合成するか（composition.handakuten）をtrueかfalseで書いてください');
  if (problems.list.length > before) return undefined;
  return { dakuten: dakuten as boolean, handakuten: handakuten as boolean };
}

/** 同じtriggerと順序の面を同じ面とみなす鍵。 */
const faceIdentity = (face: UserFace): string => `${[...face.trigger].sort().join('+')}|${face.trigger.length === 0 ? '' : (face.mode ?? '')}`;

/**
 * 面の形の中身を読む。`raw` は `kind`・`faces` と、種類ごとの項目（かなの種類は `composition`、英字の種類は任意の `romaji`）を持つオブジェクト
 * （`UserLayout` の一部、またはJSONの本体）。種類で持てない項目を持つ時は誤りにする。
 * 誤りは全部集めて返す（1件目で止めない）。誤りが無ければ、triggerのキーを正式名にそろえた中身を返す。
 * ほかの項目（`id`・`name`・`homeKeys` など）は呼び出し側が見る。
 */
export function readFaceBody(raw: Record<string, unknown>): { readonly body: UserFaceBody | undefined; readonly problems: readonly FaceLayoutProblem[] } {
  const problems = new Problems();
  const kindRead = readEnum(raw.kind, KINDS, 'kind', '配列の種類（kind）', problems);
  const faces: UserFace[] = [];
  let facesOk = true;
  if (!Array.isArray(raw.faces)) {
    problems.add('faces', '面（faces）を配列で書いてください');
    facesOk = false;
  } else if (raw.faces.length === 0) {
    problems.add('faces', '面が1つもありません');
    facesOk = false;
  } else {
    raw.faces.forEach((entry: unknown, index) => {
      const face = readFace(entry, index, problems);
      if (face === undefined) facesOk = false;
      else faces.push(face);
    });
  }
  const kind = kindRead.ok ? kindRead.value : undefined;
  let composition: KanaMarkComposition | undefined;
  let romaji: RomajiRuleId | undefined;
  if (kind === 'kana') {
    composition = readComposition(raw.composition, problems);
    if (raw.romaji !== undefined) problems.add('romaji', 'かなの種類の配列はローマ字を経ないので、ローマ字規則「romaji」を持てません');
  } else if (kind === 'alpha') {
    if (raw.composition !== undefined) {
      problems.add('composition', '英字の種類の配列は、濁点・半濁点の合成「composition」を持てません。かなの種類だけが持てます');
    }
    if (raw.romaji !== undefined) {
      if (typeof raw.romaji === 'string') romaji = raw.romaji;
      else problems.add('romaji', `ローマ字規則（romaji）を文字列で書いてください（${describeValue(raw.romaji)}）`);
    }
  }

  if (facesOk) {
    const seen = new Map<string, number>();
    faces.forEach((face, index) => {
      const identity = faceIdentity(face);
      const first = seen.get(identity);
      if (first === undefined) {
        seen.set(identity, index);
      } else {
        const trigger = face.trigger.length === 0 ? '単打' : face.trigger.map((key) => physicalKeyDisplayLabel(key)).join('+');
        problems.add(
          `faces[${index}]`,
          `${faceLabel(index)}は${faceLabel(first)}と、切り替えのキーと打鍵の順序が同じです（${trigger}${face.mode === undefined ? '' : `・${face.mode}`}）。1つの面にまとめてください`,
        );
      }
    });
    const compositionLayerTriggers = new Map<string, number>();
    faces.forEach((face, index) => {
      if (face.inputRole !== 'composition' || face.compositionAggregation !== 'layer' || face.trigger.length !== 1) return;
      const key = face.trigger[0]!;
      const first = compositionLayerTriggers.get(key);
      if (first === undefined) compositionLayerTriggers.set(key, index);
      else {
        problems.add(
          `faces[${index}]`,
          `${faceLabel(index)}は${faceLabel(first)}と、レイヤーに数えるcompositionの面の切り替えのキー ${keyName(key)} が同じです。1つの面にまとめてください`,
        );
      }
    });
    if (composition !== undefined) {
      const present = (mark: string) => faces.some((face) => Object.values(face.outputs).includes(mark));
      if (composition.dakuten && !present(DAKUTEN_MARK)) {
        problems.add('composition.dakuten', `濁点で合成すると指定していますが、濁点（${DAKUTEN_MARK}）がどの面にもありません`);
      }
      if (composition.handakuten && !present(HANDAKUTEN_MARK)) {
        problems.add('composition.handakuten', `半濁点で合成すると指定していますが、半濁点（${HANDAKUTEN_MARK}）がどの面にもありません`);
      }
    }
  }

  if (problems.list.length > 0 || kind === undefined) return { body: undefined, problems: problems.list };
  if (kind === 'kana')
    return composition === undefined ? { body: undefined, problems: problems.list } : { body: { kind, faces, composition }, problems: [] };
  return {
    body: { kind, faces, ...(romaji === undefined ? {} : { romaji }) },
    problems: [],
  };
}

/** 面の上のキーの出力を、`Face.rows`（QWERTY刻印の行・列の並び）にする。左端の列の3つのキーは含めない。 */
function rowsOf(outputs: Readonly<Record<string, string>>): string[][] {
  const rows: string[][] = [];
  for (const [key, output] of Object.entries(outputs)) {
    const position = gridPositionOf(key);
    if (position === undefined) continue;
    while (rows.length <= position.row) rows.push([]);
    const row = rows[position.row];
    while (row.length <= position.col) row.push('');
    row[position.col] = output;
  }
  return rows;
}

/** 左端の列の3つのキーの出力を、`Face.extraCells` にする。 */
function extraCellsOf(outputs: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(outputs).filter(([key]) => LEFT_COLUMN_KEY_SET.has(key)));
}

/** 利用者が書いた面を `Face` にする。書いていない項目は足さない。 */
export function toFace(face: UserFace): Face {
  return {
    trigger: face.trigger,
    mode: face.mode ?? 'simultaneous',
    rows: rowsOf(face.outputs),
    ...(Object.keys(extraCellsOf(face.outputs)).length === 0 ? {} : { extraCells: extraCellsOf(face.outputs) }),
    inputRole: face.inputRole,
    ...(face.triggerPersistence === undefined ? {} : { triggerPersistence: face.triggerPersistence }),
    ...(face.compositionAggregation === undefined ? {} : { compositionAggregation: face.compositionAggregation }),
    ...(face.triggerOrder === undefined ? {} : { triggerOrder: face.triggerOrder }),
    ...(face.layer === undefined ? {} : { layer: face.layer }),
    ...(face.modifierGroups === undefined ? {} : { modifierGroups: face.modifierGroups }),
  };
}

/** 組み立てに失敗した。どの面の誤りかを `problems` に持つ。 */
export class FaceLayoutBuildError extends Error {
  readonly problems: readonly FaceLayoutProblem[];
  constructor(problems: readonly FaceLayoutProblem[]) {
    super(problems.map((problem) => problem.message).join('、'));
    this.name = 'FaceLayoutBuildError';
    this.problems = problems;
  }
}

const reasonOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** `fromFaces` が投げた時に、先頭から面を足していって初めて組めなくなる面と、その時の内部の文を探す。 */
function culpritOf(faces: readonly Face[], id: string, name: string): { index: number; reason: string } | undefined {
  for (let count = 1; count <= faces.length; count += 1) {
    try {
      fromFaces(id, name, faces.slice(0, count));
    } catch (cause) {
      return { index: count - 1, reason: reasonOf(cause) };
    }
  }
  return undefined;
}

/** 読み込みの段で弾けなかった組み立ての失敗に付ける、利用者向けの文。内部の文は詳細に分ける。 */
const BUILD_HINT = '切り替えのキーと打鍵の順序、同じキーの出力を見直してください';

/**
 * 面から `Layout` を組む。組めない時は `FaceLayoutBuildError` を投げる。
 * 組めなくなった面は、先頭から足していって最初に組めなくなる面として特定する。
 */
export function buildFaceLayout(id: string, name: string, body: UserFaceBody): Layout {
  const faces = body.faces.map(toFace);
  let layout: Layout;
  try {
    layout = fromFaces(id, name, faces);
  } catch (cause) {
    const culprit = culpritOf(faces, id, name);
    throw new FaceLayoutBuildError([
      culprit === undefined
        ? { path: 'faces', message: `面の組み合わせから配列を組めません。${BUILD_HINT}`, detail: reasonOf(cause) }
        : { path: `faces[${culprit.index}]`, message: `${faceLabel(culprit.index)}を加えると配列を組めません。${BUILD_HINT}`, detail: culprit.reason },
    ]);
  }
  // 濁点・半濁点の合成はかなの種類だけが持つ
  if (body.kind === 'alpha') return layout;
  try {
    return composeKanaMarks(layout, body.composition, name);
  } catch (cause) {
    throw new FaceLayoutBuildError([
      { path: 'composition', message: '濁点・半濁点の合成を組めません。合成の指定と、面にある濁点・半濁点を見直してください', detail: reasonOf(cause) },
    ]);
  }
}

/**
 * 同じ出力が2か所以上にある旨。組み込みの配列も使う正しい定義（代わりの打ち方）なので誤りにしない。
 * 場所は面の並びとキーで示す。
 */
export function duplicateOutputNotices(body: Pick<UserFaceBody, 'faces'>): readonly FaceLayoutNotice[] {
  const places = new Map<string, string[]>();
  body.faces.forEach((face, index) => {
    for (const [key, output] of Object.entries(face.outputs)) {
      const list = places.get(output) ?? [];
      list.push(`${faceLabel(index)}の${physicalKeyDisplayLabel(key)}`);
      places.set(output, list);
    }
  });
  return [...places]
    .filter(([, list]) => list.length > 1)
    .map(([output, list]) => ({
      output,
      message: `「${output}」が${list.length}か所にあります（${list.join('・')}）。代わりの打ち方として扱います`,
    }));
}

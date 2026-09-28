import * as v from 'valibot';
import {
  decodeDroppingInvalid,
  defineAssetCodec,
  isRecord,
  UNSAFE_OBJECT_KEYS,
  type AssetCodec,
  type CodecDiagnostic,
} from '#input/codec/index.ts';
import { FINGERS, type FingerAssignment, type NonThumb } from './geometry.ts';

/**
 * 自作の指割り当て（#544 Phase 2「自作の指割当を資産として engine に入れる」）。
 *
 * `FingerAssignment` はカスケードの項目（`fingerAssignmentId`。`engine/finger-assignment.ts`）
 * が指す実体で、組み込み（`default` / `jis-default`）と自作の両方がここに集まる。
 * 自作分のidは組み込みと衝突しない名前空間にする（`user-geometries.ts` の `shape-{識別子}` と
 * 同じ考え方）。
 *
 * 形状（`PhysicalShape`）との整合はここでは見ない。`FingerAssignment` は仕様上
 * 形状から独立した条件なので、キーが形状に合わない自作割り当ても値としては妥当
 * （`buildGeometry` が組み合わせ時に例外を投げ、`resolveEngineInput` がそれを
 * `{ kind: 'geometry' }` の値へ変換する。既存fixtureのJISケースと同じ経路）。
 */
export const USER_FINGER_ASSIGNMENT_ID_PREFIX = 'finger-';

export const newId = (): string =>
  `${USER_FINGER_ASSIGNMENT_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const nonThumbFingerSchema = v.picklist(FINGERS);

/** 物理キーid → 指（親指を除く）。列単位の割り当てとキー単位の上書きの両方をこの1つのrecordで表す（既存`FingerAssignment.keyFinger`と同じ）。 */
const keyFingerSchema = v.record(v.string(), nonThumbFingerSchema);

const homeKeyFieldSchema = v.pipe(v.string(), v.minLength(1));

/** ホーム位置。8指ぶん全部揃っている必要がある（`assignmentWithHomeKeys`が部分上書きを別に扱うため、資産そのものは完全形で持つ）。 */
const homeKeySchema = v.strictObject(
  Object.fromEntries(FINGERS.map((finger) => [finger, homeKeyFieldSchema])) as Record<NonThumb, typeof homeKeyFieldSchema>,
);

const userFingerAssignmentSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.startsWith(USER_FINGER_ASSIGNMENT_ID_PREFIX)),
  name: v.pipe(v.string(), v.minLength(1)),
  keyFinger: keyFingerSchema,
  homeKey: homeKeySchema,
}) satisfies v.BaseSchema<unknown, FingerAssignment, v.BaseIssue<unknown>>;

/**
 * `raw`から自作の指割り当ての配列を読み取る。壊れた要素・id重複は捨てて診断を積む
 * （`input/setup/codec.ts`の`decodeSetups`と同じ「壊れた要素だけ捨てて残りを読む」方針）。
 */
function decodeUserFingerAssignments(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): FingerAssignment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const assignments: FingerAssignment[] = [];
  raw.forEach((candidate, index) => {
    // valibotの`record`は予約名のkeyを黙って落とす。落ちた事実を診断に残す
    // （`input/settings/codec.ts`の上書き読み取りと同じ扱い）。
    if (isRecord(candidate) && isRecord(candidate.keyFinger)) {
      for (const key of Object.keys(candidate.keyFinger)) {
        if (UNSAFE_OBJECT_KEYS.has(key)) {
          diagnostics.push({ path: `${path}[${index}].keyFinger.${key}`, message: `予約名のキー「${key}」を捨てた` });
        }
      }
    }
    const decoded = decodeDroppingInvalid(userFingerAssignmentSchema, candidate, `${path}[${index}]`, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${decoded.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(decoded.id);
    assignments.push(decoded);
  });
  return assignments;
}

/**
 * 自作の指割り当ての手持ちのcodec（版1）。`SetupLibrary`と違い、`SettingsValueMap`等の
 * engine固有の型を一切参照しない（内容は`FingerAssignment`だけの配列）ので、`platform`から
 * 直接importしてよい（`user-geometries-storage.ts`と同じ構図。`setup-library-storage.ts`の
 * ようにキー定数だけを別出しする必要が無い）。
 */
export const USER_FINGER_ASSIGNMENTS_CODEC: AssetCodec<readonly FingerAssignment[]> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    // `assignments`が配列でなくても資産全体は失敗にせず空扱いにする
    // （`input/setup/codec.ts`の`decodeSetups`と同じ寛容さ）。
    return decodeUserFingerAssignments(payload.assignments, 'assignments', diagnostics);
  },
  encodePayload: (value) => ({ assignments: value.map((assignment) => ({ ...assignment })) }),
});

/**
 * 自作の指割り当ての手持ちを操作する純関数（#544 Phase 2「コマンド」）。
 * `input/setup/collection.ts`（Setupの作成・複製・削除・改名）と同じ規約に揃える:
 * **変化が無ければ同一の配列参照を返す**。コマンド層（`engine/commands.ts`）はこの参照の
 * 一致でno-opを判定するため、`filter`/`map`が対象が無くても新しい配列を作ってしまう問題を
 * ここで吸収する。
 */

/** 新規作成。`base`（既定は`DEFAULT_FINGER_ASSIGNMENT`）の中身を引き継ぎ、idだけ発行し直す。 */
export function createUserFingerAssignment(
  assignments: readonly FingerAssignment[],
  generateId: () => string,
  base: FingerAssignment,
  name?: string,
): readonly FingerAssignment[] {
  const created: FingerAssignment = {
    ...structuredClone(base),
    id: generateId(),
    name: name ?? `${base.name}のコピー`,
  };
  return [...assignments, created];
}

/** 複製。複製元が存在しないidなら何もしない（`duplicateSetup`と同じ「値として無視する」方針）。 */
export function duplicateUserFingerAssignment(
  assignments: readonly FingerAssignment[],
  sourceId: string,
  generateId: () => string,
  name?: string,
): readonly FingerAssignment[] {
  const source = assignments.find((assignment) => assignment.id === sourceId);
  if (source === undefined) return assignments;
  const duplicated: FingerAssignment = {
    ...structuredClone(source),
    id: generateId(),
    name: name ?? `${source.name}のコピー`,
  };
  return [...assignments, duplicated];
}

/**
 * 削除。対象が存在しない場合は`assignments`をそのまま返す。
 *
 * **このidを指すカスケードの上書き（`fingerAssignmentId`）はここでは触らない。**
 * Setupの削除（`input/setup/collection.ts`の`deleteSetup`）がカスケードの`setup`レベルを
 * 一緒に消すのとは事情が違う: Setupのidはカスケードの**レベルそのもの**
 * （`overrides.setup[id]`）を指すため、Setup本体を消すと対応するレベルが永久に参照不能な
 * ゴミとして残る。一方、指割り当てのidはカスケードの**項目の値**（`global`/`shape`/…
 * どのレベルの`fingerAssignmentId`にも入りうる文字列）でしかなく、削除後にそれを指す上書きが
 * あっても`resolveFingerAssignment`が解決のたびに検査し、見つからなければ診断付きで
 * 既定へfallbackする（`engine/finger-assignment.ts`）。つまり「参照が壊れている」という
 * 状態自体が、解決の毎回で自己修復的に検出・表示される。ここで能動的にoverridesを
 * 走査して消す（Setupと同じ orphan-cleanup）と, 診断を出す経路をコマンド層にも複製する
 * ことになり、しかも「その項目がどの資産由来のidを持つか」をcommands.tsがcodec無しに
 * 知る必要が生じる（`fingerAssignmentId`は`romajiRuleId`と同じ「緩い文字列」schemaで、
 * 値だけからは資産由来か組み込みかコマンド層からは区別できない）。値を残し、解決側の
 * fallbackに一本化する方が経路が1つで済む。
 */
export function deleteUserFingerAssignment(
  assignments: readonly FingerAssignment[],
  id: string,
): readonly FingerAssignment[] {
  if (!assignments.some((assignment) => assignment.id === id)) return assignments;
  return assignments.filter((assignment) => assignment.id !== id);
}

/** 改名。対象が存在しない、または既に同じ名前なら`assignments`をそのまま返す。 */
export function renameUserFingerAssignment(
  assignments: readonly FingerAssignment[],
  id: string,
  name: string,
): readonly FingerAssignment[] {
  const target = assignments.find((assignment) => assignment.id === id);
  if (target === undefined || target.name === name) return assignments;
  return assignments.map((assignment) => assignment.id === id ? { ...assignment, name } : assignment);
}

export type { FingerAssignment } from './geometry.ts';

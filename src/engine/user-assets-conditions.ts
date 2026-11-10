import type { CodecDiagnostic } from '#input/codec/index.ts';
import {
  decodeCascadeOverrides,
  encodeCascadeOverrides,
  levelOverrides,
  withLevelOverrides,
  type CascadeLevel,
  type CascadeOverrides,
  type InputMethod,
  type LevelOverrides,
} from '#input/settings/index.ts';
import { stableStringify } from './cache-key.ts';
import type { ImportPolicy } from './import-policy.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { remapOverrideReferences, type SetupIdMaps } from './user-assets-setups.ts';

/**
 * 書き出しファイルが運ぶ、Setup以外のレベルの条件（全体・物理配列・打ち方・配列）。
 * Setupのレベルの条件は各Setupが運び、Workspaceのレベルの条件は各Workspaceが運ぶ。
 */
export type ConditionLevels = Pick<CascadeOverrides<SettingsValueMap>, 'global' | 'shape' | 'inputMethod' | 'layout'>;

/** 読み込みの内訳と書き出しの文に出す、この項目の名前。 */
export const CONDITIONS_LABEL = '全体・配列などの条件';

export const EMPTY_CONDITION_LEVELS: ConditionLevels = {};

export function isEmptyConditionLevels(conditions: ConditionLevels): boolean {
  return flatten(conditions).length === 0;
}

interface ConditionEntry {
  readonly level: CascadeLevel;
  readonly overrides: LevelOverrides<SettingsValueMap>;
}

function flatten(conditions: ConditionLevels): readonly ConditionEntry[] {
  const entries: ConditionEntry[] = [];
  const add = (level: CascadeLevel, overrides: LevelOverrides<SettingsValueMap> | undefined): void => {
    if (overrides !== undefined && Object.keys(overrides).length > 0) entries.push({ level, overrides });
  };
  add({ kind: 'global' }, conditions.global);
  for (const [shapeId, overrides] of Object.entries(conditions.shape ?? {})) add({ kind: 'shape', shapeId }, overrides);
  for (const [inputMethod, overrides] of Object.entries(conditions.inputMethod ?? {})) {
    add({ kind: 'inputMethod', inputMethod: inputMethod as InputMethod }, overrides);
  }
  for (const [layoutId, overrides] of Object.entries(conditions.layout ?? {})) add({ kind: 'layout', layoutId }, overrides);
  return entries;
}

function pick(overrides: CascadeOverrides<SettingsValueMap>): ConditionLevels {
  const { global, shape, inputMethod, layout } = overrides;
  return {
    ...(global === undefined ? {} : { global }),
    ...(shape === undefined ? {} : { shape }),
    ...(inputMethod === undefined ? {} : { inputMethod }),
    ...(layout === undefined ? {} : { layout }),
  };
}

function fromEntries(entries: readonly ConditionEntry[]): ConditionLevels {
  let overrides: CascadeOverrides<SettingsValueMap> = {};
  for (const entry of entries) overrides = withLevelOverrides(overrides, entry.level, entry.overrides);
  return pick(overrides);
}

export function decodeConditionLevels(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): ConditionLevels {
  return pick(decodeCascadeOverrides(SETTINGS_ITEM_SCHEMAS, raw, path, diagnostics));
}

export function encodeConditionLevels(conditions: ConditionLevels): Record<string, unknown> {
  return encodeCascadeOverrides(fromEntries(flatten(conditions)));
}

/** 各レベルの条件の指の割り当て・ローマ字規則への参照を付け替え、解決できないものを外す。空になったレベルは落とす。 */
function mapEntries(entries: readonly ConditionEntry[], maps: Pick<SetupIdMaps, 'rules' | 'fingers'>): readonly ConditionEntry[] {
  const mapped: ConditionEntry[] = [];
  for (const entry of entries) {
    const overrides = remapOverrideReferences(entry.overrides, maps);
    if (overrides !== undefined && Object.keys(overrides).length > 0) mapped.push({ level: entry.level, overrides });
  }
  return mapped;
}

/**
 * 手元の条件から、ファイルに入れる分を取り出す。ファイルに入れない自作の指の割り当て・ローマ字規則への参照は外す
 * （読む側で手元の同じidの別の資産に結び付かないようにするため。Setupのレベルの条件と同じ扱い）。
 */
export function conditionLevelsOf(
  overrides: CascadeOverrides<SettingsValueMap>,
  known: { readonly ruleIds: ReadonlySet<string>; readonly fingerAssignmentIds: ReadonlySet<string> },
): ConditionLevels {
  const identity = (ids: ReadonlySet<string>): ReadonlyMap<string, string> => new Map([...ids].map((id) => [id, id] as const));
  return fromEntries(mapEntries(flatten(pick(overrides)), { rules: identity(known.ruleIds), fingers: identity(known.fingerAssignmentIds) }));
}

export interface ConditionsMerge {
  readonly value: CascadeOverrides<SettingsValueMap>;
  /** 手元に無く足した件数。 */
  readonly added: number;
  /** 手元と同じ中身で足さなかった件数。 */
  readonly same: number;
  /** 手元と違う中身で重なった件数。 */
  readonly conflicted: number;
}

/**
 * ファイルの条件を手元へ足す。配列のレベルの条件は、読み込みで別のidになった配列へ付け替え、指の割り当て・ローマ字規則への参照も付け替える。
 * 配列のレベルの条件は、その配列の読み込みの扱いに従う。`droppedLayoutIds`は読み込まずに手元の配列を残したファイルの配列のid（条件は運ばない）、
 * `overwrittenLayoutIds`は手元の配列を上書きしたid（手元の配列のレベルの条件を、ファイルの値で置き換える。ファイルに無ければ消す）。
 * この2つの配列の条件は、条件の種類の扱い（`policy`）に関わらず上の通りにする。
 * 手元に無いレベルは足し、同じ中身は足さず、違う中身は`policy`が`overwrite`なら置き換え、そうでなければ手元を残す。
 */
export function mergeConditionLevels(
  current: CascadeOverrides<SettingsValueMap>,
  incoming: ConditionLevels,
  maps: SetupIdMaps,
  policy: ImportPolicy,
  droppedLayoutIds: ReadonlySet<string> = new Set(),
  overwrittenLayoutIds: ReadonlySet<string> = new Set(),
): ConditionsMerge {
  const relayered = flatten(incoming)
    .filter((entry) => entry.level.kind !== 'layout' || !droppedLayoutIds.has(entry.level.layoutId))
    .map(
      (entry): ConditionEntry =>
        entry.level.kind === 'layout'
          ? { ...entry, level: { kind: 'layout', layoutId: maps.layouts.get(entry.level.layoutId) ?? entry.level.layoutId } }
          : entry,
    );
  let value = current;
  for (const layoutId of overwrittenLayoutIds) value = withLevelOverrides(value, { kind: 'layout', layoutId }, undefined);
  let added = 0;
  let same = 0;
  let conflicted = 0;
  const forced = (entry: ConditionEntry): boolean => entry.level.kind === 'layout' && overwrittenLayoutIds.has(entry.level.layoutId);
  const mapped = mapEntries(relayered, maps);
  // 上書きした配列の条件は、条件の種類の扱いに関わらず先に書く。種類を読み込まない時に戻る先（base）にも含めるため
  for (const entry of mapped.filter(forced)) {
    value = withLevelOverrides(value, entry.level, entry.overrides);
    added += 1;
  }
  const base = value;
  for (const entry of mapped.filter((candidate) => !forced(candidate))) {
    const own = levelOverrides(value, entry.level);
    if (own === undefined || Object.keys(own).length === 0) {
      value = withLevelOverrides(value, entry.level, entry.overrides);
      added += 1;
    } else if (stableStringify(own) === stableStringify(entry.overrides)) {
      same += 1;
    } else {
      conflicted += 1;
      if (policy === 'overwrite') value = withLevelOverrides(value, entry.level, entry.overrides);
    }
  }
  // 手元と違う中身で重なった時に上書きを選ばなければ、この種類は丸ごと読み込まない（足せるものだけ足す、とはしない）
  if (conflicted > 0 && policy !== 'overwrite') return { value: base, added: 0, same, conflicted };
  return { value, added, same, conflicted };
}

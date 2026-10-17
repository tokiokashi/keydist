import { isRecord, type CodecDiagnostic, droppedDuplicateId, droppedNotArray } from '#input/codec/index.ts';
import {
  decodeLevelOverrides,
  levelOverrides,
  withLevelOverrides,
  type LevelOverrides,
} from '#input/settings/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { isBuiltin } from '#input/romaji/rules.ts';
import { effectiveLabel, nextSetupNumber, type Setup, type SetupLibrary } from '#input/setup/index.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from './finger-assignment.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import { SETTINGS_ITEMS, type SettingsValueMap } from './settings-items.ts';
import { MISSING_LAYOUT_NAME, MISSING_SHAPE_NAME } from '#input/setup/index.ts';

/**
 * 資産のファイルに入れるSetupと、読み込み時の突き合わせ。ファイルが運ぶのは、Setupの配列・物理配列・ラベルと、
 * そのSetupのレベルの条件だけ。番号は持たない（読み込んだ側が手持ちの最大＋1から振る）。
 * 全体・配列などのレベルの条件は資産のファイルに入れない（Setupだけが運ぶ）。
 */

export type SetupLibraryOfSettings = SetupLibrary<SettingsValueMap>;

export interface UserAssetSetup {
  readonly id: string;
  readonly layoutId: string;
  readonly shapeId: string;
  readonly label?: string;
  /** Setupのレベルの条件。空なら無い。 */
  readonly overrides?: LevelOverrides<SettingsValueMap>;
}

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** ファイルの`setups`を読む。読めない要素は捨てて診断を積む（残りは読む）。 */
export function decodeUserAssetSetups(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): readonly UserAssetSetup[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: droppedNotArray('Setup') });
    return [];
  }
  const seen = new Set<string>();
  const setups: UserAssetSetup[] = [];
  raw.forEach((candidate: unknown, index) => {
    const where = `${path}[${index}]`;
    if (!isRecord(candidate) || !nonEmptyString(candidate.id) || !nonEmptyString(candidate.layoutId) || !nonEmptyString(candidate.shapeId)) {
      diagnostics.push({ path: where, message: 'id・配列・物理配列が読めないため、Setupを捨てました' });
      return;
    }
    if (seen.has(candidate.id)) {
      diagnostics.push({ path: where, message: droppedDuplicateId(candidate.id) });
      return;
    }
    seen.add(candidate.id);
    const label = effectiveLabel(typeof candidate.label === 'string' ? candidate.label : undefined);
    const decoded = decodeLevelOverrides(SETTINGS_ITEM_SCHEMAS, candidate.overrides, `${where}.overrides`, diagnostics);
    // Setupのレベルに置けない項目は読み込まない（置けても解決の時に無視されるだけで、見えない値が残るため）
    const allowed: Record<string, unknown> = {};
    for (const [itemId, value] of Object.entries(decoded ?? {})) {
      if (SETTINGS_ITEMS[itemId as keyof typeof SETTINGS_ITEMS].allowedLevels.has('setup')) allowed[itemId] = value;
      else diagnostics.push({ path: `${where}.overrides.${itemId}`, message: 'Setupのレベルに置けない項目のため捨てました' });
    }
    setups.push({
      id: candidate.id,
      layoutId: candidate.layoutId,
      shapeId: candidate.shapeId,
      ...(label === undefined ? {} : { label }),
      ...(Object.keys(allowed).length === 0 ? {} : { overrides: allowed as LevelOverrides<SettingsValueMap> }),
    });
  });
  return setups;
}

export function encodeUserAssetSetups(setups: readonly UserAssetSetup[]): readonly Record<string, unknown>[] {
  return setups.map((setup) => ({
    id: setup.id,
    layoutId: setup.layoutId,
    shapeId: setup.shapeId,
    ...(setup.label === undefined ? {} : { label: setup.label }),
    ...(setup.overrides === undefined ? {} : { overrides: structuredClone(setup.overrides) }),
  }));
}

/** 手持ちのSetupを、ファイルに入れる形にする。 */
export function userAssetSetupsOf(library: SetupLibraryOfSettings): readonly UserAssetSetup[] {
  return library.setups.map((setup) => {
    const overrides = levelOverrides(library.overrides, { kind: 'setup', setupId: setup.id });
    return {
      id: setup.id,
      layoutId: setup.layoutId,
      shapeId: setup.shapeId,
      ...(setup.label === undefined ? {} : { label: setup.label }),
      ...(overrides === undefined || Object.keys(overrides).length === 0 ? {} : { overrides }),
    };
  });
}

/**
 * Setupのレベルの条件のうち、解決できない自作の資産への参照を外す。書き出したファイルを読む側で、手元の
 * 同じidの別の資産に結び付かないようにするため（組み込みと、ファイルに入れる資産への参照は残す）。
 */
export function withResolvableReferences(
  setup: UserAssetSetup,
  known: { readonly ruleIds: ReadonlySet<string>; readonly fingerAssignmentIds: ReadonlySet<string> },
): UserAssetSetup {
  if (setup.overrides === undefined) return setup;
  const { romajiRuleId, fingerAssignmentId, ...rest } = setup.overrides;
  const kept: Record<string, unknown> = { ...rest };
  if (romajiRuleId !== undefined && (isBuiltin(romajiRuleId) || known.ruleIds.has(romajiRuleId))) kept.romajiRuleId = romajiRuleId;
  if (
    fingerAssignmentId !== undefined
    && (Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, fingerAssignmentId) || known.fingerAssignmentIds.has(fingerAssignmentId))
  ) {
    kept.fingerAssignmentId = fingerAssignmentId;
  }
  const { overrides: _dropped, ...without } = setup;
  return Object.keys(kept).length === 0 ? without : { ...without, overrides: kept as LevelOverrides<SettingsValueMap> };
}

/** 突き合わせの結果の1件（`user-assets-file.ts`の`UserAssetImportEntry`と同じ形）。 */
export interface SetupImportEntry {
  readonly name: string;
  readonly outcome:
    | { readonly kind: 'added' }
    | { readonly kind: 'added-renamed'; readonly addedName: string; readonly addedId: string; readonly overlap: { readonly with: 'own'; readonly name: string } }
    | { readonly kind: 'skipped-same'; readonly existingName: string };
}

/** 画面に出すSetupの名前。ラベルがあればそれ、無ければ配列と物理配列の名前。 */
function setupName(
  setup: { readonly layoutId: string; readonly shapeId: string; readonly label?: string | undefined },
  layoutNames: ReadonlyMap<string, string>,
): string {
  const label = effectiveLabel(setup.label);
  if (label !== undefined) return label;
  const layoutName = layoutNames.get(setup.layoutId) ?? LAYOUT_BY_ID.get(setup.layoutId)?.name ?? MISSING_LAYOUT_NAME;
  const shapeName = Object.hasOwn(PHYSICAL_SHAPES, setup.shapeId)
    ? PHYSICAL_SHAPES[setup.shapeId as keyof typeof PHYSICAL_SHAPES].name
    : MISSING_SHAPE_NAME;
  return `${layoutName}/${shapeName}`;
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort().filter((key) => value[key] !== undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** 「中身が同じ」の判定。ラベル・id・番号は比べない。条件が空のSetupと条件の無いSetupは同じ。 */
function setupContent(setup: { readonly layoutId: string; readonly shapeId: string }, overrides: object | undefined): string {
  return canonicalValue({
    layoutId: setup.layoutId,
    shapeId: setup.shapeId,
    overrides: overrides === undefined || Object.keys(overrides).length === 0 ? undefined : overrides,
  });
}

export interface SetupIdMaps {
  readonly layouts: ReadonlyMap<string, string>;
  readonly rules: ReadonlyMap<string, string>;
  readonly fingers: ReadonlyMap<string, string>;
}

/**
 * ファイルのSetupが指す自作の資産のidを、読み込み後のidへ付け替える。
 * ファイルの中に無く組み込みでもない指の割り当て・ローマ字規則を指す参照は外す
 * （手元の同じidの別の資産に結び付けず、継承する値で解決させるため）。
 * 中身の比較より前に行うので、外した参照の有無だけで別のSetupと判定されない。
 */
function remapSetup(setup: UserAssetSetup, maps: SetupIdMaps): UserAssetSetup {
  const overrides = setup.overrides;
  const mapped: Record<string, unknown> | undefined = overrides === undefined ? undefined : { ...overrides };
  if (mapped !== undefined) {
    if (typeof mapped.romajiRuleId === 'string') {
      const id = isBuiltin(mapped.romajiRuleId) ? mapped.romajiRuleId : maps.rules.get(mapped.romajiRuleId);
      if (id === undefined) delete mapped.romajiRuleId;
      else mapped.romajiRuleId = id;
    }
    if (typeof mapped.fingerAssignmentId === 'string') {
      const id = Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, mapped.fingerAssignmentId)
        ? mapped.fingerAssignmentId
        : maps.fingers.get(mapped.fingerAssignmentId);
      if (id === undefined) delete mapped.fingerAssignmentId;
      else mapped.fingerAssignmentId = id;
    }
  }
  return {
    ...setup,
    layoutId: maps.layouts.get(setup.layoutId) ?? setup.layoutId,
    ...(mapped === undefined ? {} : { overrides: mapped as LevelOverrides<SettingsValueMap> }),
  };
}

function freshSetupId(stamp: string, used: ReadonlySet<string>): string {
  for (let n = 1; ; n += 1) {
    const id = `setup-${stamp}-${n}`;
    if (!used.has(id)) return id;
  }
}

/**
 * 読み込んだSetupを手持ちへ突き合わせる。
 * - 中身（配列・物理配列・Setupのレベルの条件）が同じSetupは、idが同じでも違っても足さない。同じファイルを二度読んでも増えない
 * - 手持ちに無いidはそのまま足す。同じidで中身が違うSetupは、手持ちを残して新しいidで足す。ラベルはそのまま持ってくる
 * - 足したSetupには、手持ちの番号の最大＋1から順に番号を振る
 * 配列・指の割り当て・ローマ字規則が読み込みで別のidになったものは、`maps`で付け替えてから比べる。
 */
export function mergeUserAssetSetups(
  current: SetupLibraryOfSettings,
  incoming: readonly UserAssetSetup[],
  maps: SetupIdMaps,
  layoutNames: ReadonlyMap<string, string>,
  stamp: string,
): { readonly library: SetupLibraryOfSettings; readonly entries: readonly SetupImportEntry[] } {
  const setups: Setup[] = [...current.setups];
  let overrides = current.overrides;
  const contents = new Map(setups.map((setup) => [
    setup.id,
    setupContent(setup, levelOverrides(overrides, { kind: 'setup', setupId: setup.id })),
  ] as const));
  const entries: SetupImportEntry[] = [];
  for (const file of incoming) {
    const remapped = remapSetup(file, maps);
    const content = setupContent(remapped, remapped.overrides);
    const name = setupName(file, layoutNames);
    const same = setups.find((setup) => contents.get(setup.id) === content);
    if (same !== undefined) {
      entries.push({ name, outcome: { kind: 'skipped-same', existingName: setupName(same, layoutNames) } });
      continue;
    }
    const collision = setups.find((setup) => setup.id === file.id);
    const id = collision === undefined ? file.id : freshSetupId(stamp, new Set(setups.map((setup) => setup.id)));
    const added: Setup = {
      id,
      number: nextSetupNumber(setups),
      layoutId: remapped.layoutId,
      shapeId: remapped.shapeId,
      ...(remapped.label === undefined ? {} : { label: remapped.label }),
    };
    setups.push(added);
    contents.set(id, content);
    if (remapped.overrides !== undefined && Object.keys(remapped.overrides).length > 0) {
      overrides = withLevelOverrides(overrides, { kind: 'setup', setupId: id }, remapped.overrides);
    }
    entries.push({
      name,
      outcome: collision === undefined
        ? { kind: 'added' }
        : { kind: 'added-renamed', addedName: name, addedId: id, overlap: { with: 'own', name: setupName(collision, layoutNames) } },
    });
  }
  if (setups.length === current.setups.length) return { library: current, entries };
  return { library: { setups, overrides }, entries };
}

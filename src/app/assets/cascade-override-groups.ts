import type { CascadeLevel, InputMethod } from '#input/settings/index.ts';
import { MISSING_LAYOUT_NAME, MISSING_SETUP_NAME, MISSING_SHAPE_NAME } from '#input/setup/index.ts';
import { SETTINGS_ITEMS, type SettingsCascadeOverrides, type SettingsItemId } from '#engine/settings-items.ts';
import type { Workspace } from '#engine/workspace.ts';
import { conditionItemLabel, conditionLevelLabel, conditionOverrideValueText, type ConditionValueNames } from '#hosts/shared/condition-summary.ts';

/** 保存してある上書きの1項目。 */
export interface OverrideEntry {
  readonly itemId: SettingsItemId;
  /** 条件の要約と同じ項目の名前。 */
  readonly label: string;
  /** 条件の要約と同じ値の文言。 */
  readonly valueText: string;
  /** この適用範囲には項目が置けず、解決では使われない値。 */
  readonly unused: boolean;
}

/** 同じ適用範囲にある上書きのまとまり。 */
export interface OverrideGroup {
  /** 一覧の中で一意なキー。 */
  readonly key: string;
  /** 適用範囲の名前。手持ちに無いものは「（見つからない配列1）」の形。 */
  readonly title: string;
  readonly level: CascadeLevel;
  /** Workspaceのレベルの時だけ。消す操作に渡す。 */
  readonly workspaceId?: string;
  /** 適用範囲のSetupが手持ちに無い。元に戻す時にSetupの存在も照らすので、消すと戻せない。 */
  readonly missingSetup: boolean;
  readonly entries: readonly OverrideEntry[];
}

export interface OverrideGroupsInput {
  /** `setupLibrary`の上書き（Workspaceのレベルは含めない）。 */
  readonly overrides: SettingsCascadeOverrides;
  /** サイドバーと同じ順。 */
  readonly workspaces: readonly Workspace[];
  /** 手持ちのSetupと、一覧に並ぶ集合に対して付けた表示名。`/assets`のSetupの行と同じ順。 */
  readonly setups: readonly { readonly id: string; readonly displayName: string }[];
  /** 手持ちの配列（組み込みと自作）・物理配列の名前と、値を名前へ引く手持ち。 */
  readonly names: ConditionValueNames;
}

const INPUT_METHOD_ORDER: readonly InputMethod[] = ['kana-direct', 'romaji', 'direct'];

const SETTINGS_ITEM_IDS = Object.keys(SETTINGS_ITEMS) as SettingsItemId[];

function entriesOf(stored: Readonly<Record<string, unknown>> | undefined, level: CascadeLevel, names: ConditionValueNames): readonly OverrideEntry[] {
  if (stored === undefined) return [];
  const entries: OverrideEntry[] = [];
  for (const itemId of SETTINGS_ITEM_IDS) {
    if (!Object.hasOwn(stored, itemId) || stored[itemId] === undefined) continue;
    entries.push({
      itemId,
      label: conditionItemLabel(itemId) ?? itemId,
      valueText: conditionOverrideValueText(itemId, stored[itemId], names),
      unused: !SETTINGS_ITEMS[itemId].allowedLevels.has(level.kind),
    });
  }
  return entries;
}

/** Workspaceの適用範囲の名前。同じ名前が複数ある時だけ、並びの順に番号を付けて区別する。 */
export function workspaceTitles(workspaces: readonly Workspace[]): readonly string[] {
  const nameCounts = new Map<string, number>();
  for (const workspace of workspaces) nameCounts.set(workspace.name, (nameCounts.get(workspace.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return workspaces.map((workspace) => {
    const order = (seen.get(workspace.name) ?? 0) + 1;
    seen.set(workspace.name, order);
    return (nameCounts.get(workspace.name) ?? 0) > 1 ? `${workspace.name}（${order}）` : workspace.name;
  });
}

/** 手持ちに無い適用範囲の名前。同じ種類が複数ある時だけ、一覧の順に番号を付けて区別する。 */
function missingTitle(base: string, index: number, count: number): string {
  return count > 1 ? `（${base}${index + 1}）` : `（${base}）`;
}

/** バケツのキーを、手持ちの順、手持ちに無いもの（保存の順）の並びにする。 */
function orderedKeys(
  bucket: Readonly<Record<string, unknown>> | undefined,
  known: readonly string[],
): readonly { readonly key: string; readonly found: boolean }[] {
  if (bucket === undefined) return [];
  const found = known.filter((key) => Object.hasOwn(bucket, key));
  const foundSet = new Set(found);
  return [
    ...found.map((key) => ({ key, found: true })),
    ...Object.keys(bucket)
      .filter((key) => !foundSet.has(key))
      .map((key) => ({ key, found: false })),
  ];
}

/**
 * 保存してある上書きを、適用範囲ごとにカスケードの順（全体・Workspace・物理配列・打ち方・配列・Setup）にまとめる。
 * 上書きそのものを並べるので、継承する値と同じ値や、今の条件で使われない値も含む。
 */
export function cascadeOverrideGroups(input: OverrideGroupsInput): readonly OverrideGroup[] {
  const { overrides, workspaces, setups, names } = input;
  const groups: OverrideGroup[] = [];
  const push = (
    key: string,
    title: string,
    level: CascadeLevel,
    stored: Readonly<Record<string, unknown>> | undefined,
    extra: Partial<OverrideGroup> = {},
  ) => {
    const entries = entriesOf(stored, level, names);
    if (entries.length === 0) return;
    groups.push({ key, title, level, missingSetup: false, entries, ...extra });
  };

  push('global', conditionLevelLabel({ kind: 'global' }, names), { kind: 'global' }, overrides.global);

  const workspaceNames = workspaceTitles(workspaces);
  workspaces.forEach((workspace, index) => {
    push(`workspace:${workspace.id}`, workspaceNames[index]!, { kind: 'workspace' }, workspace.conditions, { workspaceId: workspace.id });
  });

  const shapeKeys = orderedKeys(overrides.shape, [...names.shapes.keys()]);
  const missingShapes = shapeKeys.filter((entry) => !entry.found).length;
  let missingShapeIndex = 0;
  for (const { key, found } of shapeKeys) {
    const level: CascadeLevel = { kind: 'shape', shapeId: key };
    const title = found ? conditionLevelLabel(level, names) : missingTitle(MISSING_SHAPE_NAME, missingShapeIndex++, missingShapes);
    push(`shape:${key}`, title, level, overrides.shape?.[key]);
  }

  for (const { key } of orderedKeys(overrides.inputMethod, INPUT_METHOD_ORDER)) {
    const level: CascadeLevel = { kind: 'inputMethod', inputMethod: key as InputMethod };
    push(`inputMethod:${key}`, conditionLevelLabel(level, names), level, overrides.inputMethod?.[key as InputMethod]);
  }

  const layoutKeys = orderedKeys(overrides.layout, [...(names.layouts?.keys() ?? [])]);
  const missingLayouts = layoutKeys.filter((entry) => !entry.found).length;
  let missingLayoutIndex = 0;
  for (const { key, found } of layoutKeys) {
    const level: CascadeLevel = { kind: 'layout', layoutId: key };
    const title = found ? conditionLevelLabel(level, names) : missingTitle(MISSING_LAYOUT_NAME, missingLayoutIndex++, missingLayouts);
    push(`layout:${key}`, title, level, overrides.layout?.[key]);
  }

  const setupKeys = orderedKeys(
    overrides.setup,
    setups.map((setup) => setup.id),
  );
  const setupNames = new Map(setups.map((setup) => [setup.id, setup.displayName] as const));
  const missingSetups = setupKeys.filter((entry) => !entry.found).length;
  let missingSetupIndex = 0;
  for (const { key, found } of setupKeys) {
    const title = found ? setupNames.get(key)! : missingTitle(MISSING_SETUP_NAME, missingSetupIndex++, missingSetups);
    push(`setup:${key}`, title, { kind: 'setup', setupId: key }, overrides.setup?.[key], { missingSetup: !found });
  }
  return groups;
}

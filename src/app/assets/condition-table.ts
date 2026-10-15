import { resolveTargetForText } from '#engine/target-resolution.ts';
import {
  resolveSettings,
  withWorkspaceConditions,
  type ResolvedSettingsCascade,
  type SettingsCascadeOverrides,
  type SettingsItemId,
} from '#engine/settings-items.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { Setup } from '#input/setup/index.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { Workspace } from '#engine/workspace.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { targetChoiceGroups } from '#hosts/shared/target-choices.ts';
import {
  conditionLevelLabel,
  traceConditionSummary,
  type ConditionSummaryRow,
  type ConditionValueNames,
} from '#hosts/shared/condition-summary.ts';
import { setupConditionRows } from '../setup/setup-view.ts';
import { workspaceTitles, type OverrideGroup } from './cascade-override-groups.ts';

/**
 * データの管理の条件の表の、純粋な部分。置き場所の一覧・置き場所ごとの行・他の置き場所の上書きの文。
 * 書き込みは`hosts/shared/condition-edit.ts`のコマンドが行い、解決は`resolveSettings`に任せる。
 */

export type ConditionPlacement =
  | { readonly kind: 'global'; readonly key: 'global'; readonly title: string }
  | { readonly kind: 'workspace'; readonly key: string; readonly title: string; readonly workspaceId: string }
  | {
    readonly kind: 'layout';
    readonly key: string;
    readonly title: string;
    readonly layoutId: string;
    /** 計算に使えない自作の配列の、使えない理由。使える配列は持たない。 */
    readonly unusableReason?: string;
  }
  | { readonly kind: 'setup'; readonly key: string; readonly title: string; readonly setupId: string };

export interface ConditionPlacementGroup {
  readonly id: string;
  readonly label: string;
  readonly placements: readonly ConditionPlacement[];
}

interface UnusableUserLayout {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

/** 計算に使えず、解決の手持ちに入らない自作の配列。同じidは先のものだけ数える。 */
function unusableUserLayouts(
  catalog: PaneCatalog,
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
): readonly UnusableUserLayout[] {
  const { unusableLayouts } = buildUserCatalog(userLayouts, userRomajiRules);
  const found: UnusableUserLayout[] = [];
  userLayouts.forEach((layout, index) => {
    const reason = unusableLayouts.get(index);
    if (reason === undefined) return;
    // 解決の手持ちにあるidは、その配列と同じ置き場所になる（組み込みと識別子が同じ配列など）
    if (catalog.setupCatalog.layouts.has(layout.id) || found.some((entry) => entry.id === layout.id)) return;
    found.push({ id: layout.id, name: layout.name, reason });
  });
  return found;
}

/**
 * 手持ちの配列・物理配列・規則・指の割当の名前。上書きの一覧と表で同じ名前を出すために1か所で作る。
 * 計算に使えない自作の配列も手持ちの配列なので、名前で出す。
 */
export function conditionValueNames(
  catalog: PaneCatalog,
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
  fingerAssignments: readonly FingerAssignment[],
): ConditionValueNames {
  const layouts = new Map<string, { readonly name: string }>(catalog.setupCatalog.layouts);
  for (const layout of unusableUserLayouts(catalog, userLayouts, userRomajiRules)) {
    layouts.set(layout.id, { name: layout.name });
  }
  return {
    shapes: catalog.setupCatalog.shapes,
    layouts,
    romajiRules: new Map(userRomajiRules.map((rule) => [rule.id, rule] as const)),
    fingerAssignments: new Map(fingerAssignments.map((assignment) => [assignment.id, assignment] as const)),
  };
}

export interface PlacementGroupsInput {
  readonly catalog: PaneCatalog;
  readonly userLayouts: readonly UserLayout[];
  readonly userRomajiRules: readonly UserRomajiRule[];
  readonly workspaces: readonly Workspace[];
  /** 一覧に並ぶ集合に対して付けた表示名（上書きの一覧のSetupと同じ名前）。 */
  readonly setups: readonly { readonly id: string; readonly displayName: string }[];
  readonly names: ConditionValueNames;
}

/** 表で選べる置き場所。区分は全体・Workspace・配列・Setupの順で、置き場所の名前は上書きの一覧と同じ。 */
export function conditionPlacementGroups(input: PlacementGroupsInput): readonly ConditionPlacementGroup[] {
  const { catalog, workspaces, setups, names } = input;
  const layoutPlacement = (layoutId: string, unusableReason?: string): ConditionPlacement => ({
    kind: 'layout',
    key: `layout:${layoutId}`,
    title: conditionLevelLabel({ kind: 'layout', layoutId }, names),
    layoutId,
    ...(unusableReason === undefined ? {} : { unusableReason }),
  });

  const groups: ConditionPlacementGroup[] = [
    { id: 'global', label: '全体', placements: [{ kind: 'global', key: 'global', title: conditionLevelLabel({ kind: 'global' }, names) }] },
  ];
  const workspaceNames = workspaceTitles(workspaces);
  if (workspaces.length > 0) {
    groups.push({
      id: 'workspace',
      label: 'Workspace',
      placements: workspaces.map((workspace, index) => ({
        kind: 'workspace',
        key: `workspace:${workspace.id}`,
        title: workspaceNames[index]!,
        workspaceId: workspace.id,
      })),
    });
  }

  const layoutGroups = targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups: [],
    selected: [],
  }).filter((group) => group.id !== 'setup' && group.id !== 'missing');
  const unusable = unusableUserLayouts(catalog, input.userLayouts, input.userRomajiRules)
    .map((layout) => layoutPlacement(layout.id, layout.reason));
  const userGroup = layoutGroups.find((group) => group.id === 'user');
  for (const group of layoutGroups) {
    const placements = group.choices.flatMap((choice) => (choice.target.kind === 'layout' ? [layoutPlacement(choice.target.layoutId)] : []));
    groups.push({ id: group.id, label: group.label, placements: group.id === 'user' ? [...placements, ...unusable] : placements });
  }
  if (userGroup === undefined && unusable.length > 0) {
    groups.push({ id: 'user', label: '自作の配列', placements: unusable });
  }

  if (setups.length > 0) {
    groups.push({
      id: 'setup',
      label: 'Setup',
      placements: setups.map((setup) => ({ kind: 'setup', key: `setup:${setup.id}`, title: setup.displayName, setupId: setup.id })),
    });
  }
  return groups;
}

export interface PlacementRowsInput {
  /** `setupLibrary`の上書き（Workspaceのレベルは含めない）。 */
  readonly overrides: SettingsCascadeOverrides;
  readonly workspaces: readonly Workspace[];
  readonly catalog: PaneCatalog;
  readonly setups: readonly Setup[];
}

export type PlacementRows =
  | {
    readonly ok: true;
    /** 行の継承する値・出どころ・対象に依る注記の元。 */
    readonly rows: readonly ConditionSummaryRow[];
    /** 行の入力が読む上書き。Workspaceの置き場所は、そのWorkspaceの条件を差し込んだもの。 */
    readonly overrides: SettingsCascadeOverrides;
  }
  | { readonly ok: false; readonly message: string; readonly detail?: string };

/** 全体とWorkspaceの置き場所の継承する値を求める時に、対象の代わりに使う配列。ローマ字入力で、推奨を持たない。 */
const REPRESENTATIVE_LAYOUT_ID = 'qwerty';

/** 解釈の2項目は、全体とWorkspaceの置き場所の行にだけ出る。 */
const INTERPRETATION_IDS: readonly SettingsItemId[] = ['chainInterpretation', 'arpeggioInterpretation'];

function unavailable(message: string, detail?: string): PlacementRows {
  return detail === undefined ? { ok: false, message } : { ok: false, message, detail };
}

/** 全体とWorkspaceの置き場所は対象を持たないので、対象に依る注記（効かない・診断）を行から外す。 */
function withoutTargetNotes(rows: readonly ConditionSummaryRow[]): readonly ConditionSummaryRow[] {
  return rows.map((row) => ({ ...row, applicable: true, diagnostics: [] }));
}

function resolveWithoutTarget(overrides: SettingsCascadeOverrides, catalog: PaneCatalog): ResolvedSettingsCascade | undefined {
  const resolution = resolveTargetForText(
    { kind: 'layout', layoutId: REPRESENTATIVE_LAYOUT_ID },
    new Map(),
    catalog.setupCatalog,
    catalog.userLayouts,
    overrides,
    'ja',
  );
  return resolution.ok ? resolveSettings(overrides, resolution.context) : undefined;
}

/**
 * 置き場所の行を求める。解決は`resolveSettings`に任せ、渡す入力だけを置き場所ごとに組む。
 * - 全体: 全体のレベルだけの上書きで解決する（指の割当の既定は全体の既定の物理配列から決まる）
 * - Workspace: 全体と、そのWorkspaceのレベルの上書きで解決する（指の割当の既定はWorkspaceの既定の物理配列から）
 * - 配列: Workspaceを含めず、全体と配列のレベルから決まる既定の物理配列と、Setupと同じ決め方の打ち方（日本語のテキスト）で解決する
 * - Setup: `/setup`と同じ
 */
export function placementRows(placement: ConditionPlacement, input: PlacementRowsInput): PlacementRows {
  const { overrides, catalog } = input;
  switch (placement.kind) {
    case 'global':
    case 'workspace': {
      const workspace = placement.kind === 'workspace'
        ? input.workspaces.find((candidate) => candidate.id === placement.workspaceId)
        : undefined;
      if (placement.kind === 'workspace' && workspace === undefined) return unavailable('このWorkspaceは見つかりません。');
      const editorOverrides = workspace === undefined ? overrides : withWorkspaceConditions(overrides, workspace.conditions);
      // 全体より強い物理配列・打ち方・配列・Setupのレベルを除き、置き場所のレベルまでの値だけで解決する
      const levels: SettingsCascadeOverrides = {
        ...(overrides.global === undefined ? {} : { global: overrides.global }),
        ...(workspace?.conditions === undefined ? {} : { workspace: workspace.conditions }),
      };
      const cascade = resolveWithoutTarget(levels, catalog);
      if (cascade === undefined) return unavailable('継承する値を求められないため、値を出せません。');
      const rows = withoutTargetNotes(traceConditionSummary(cascade, catalog.setupCatalog, { extraIds: INTERPRETATION_IDS }));
      return { ok: true, rows, overrides: editorOverrides };
    }
    case 'layout': {
      if (placement.unusableReason !== undefined) {
        return unavailable('この配列は計算に使えないため、値を出せません。', placement.unusableReason);
      }
      const resolution = resolveTargetForText(
        { kind: 'layout', layoutId: placement.layoutId },
        new Map(),
        catalog.setupCatalog,
        catalog.userLayouts,
        overrides,
        'ja',
      );
      if (!resolution.ok) return unavailable('この配列は計算に使えないため、値を出せません。');
      const rows = traceConditionSummary(resolveSettings(overrides, resolution.context), catalog.setupCatalog);
      return { ok: true, rows, overrides };
    }
    case 'setup': {
      const setup = input.setups.find((candidate) => candidate.id === placement.setupId);
      const rows = setup === undefined ? undefined : setupConditionRows(setup, catalog, overrides);
      if (rows === undefined) {
        return unavailable('このSetupは配列または物理配列が見つからないなど、計算に使えないため、値を出せません。');
      }
      return { ok: true, rows, overrides };
    }
  }
}

/** 行に名前を出す、他の置き場所の数の上限。残りは数で出す。 */
export const OTHER_PLACEMENT_NAME_LIMIT = 3;

/**
 * 同じ項目を他の置き場所でも上書きしている時の、行に添える文。数えるのは上書きの一覧に出るもの全部で、
 * 名前も一覧の置き場所の名前と同じ。他に無ければ`undefined`。
 */
export function otherPlacementNote(
  groups: readonly OverrideGroup[],
  placementKey: string,
  itemId: SettingsItemId,
): string | undefined {
  const titles = groups
    .filter((group) => group.key !== placementKey && group.entries.some((entry) => entry.itemId === itemId))
    .map((group) => group.title);
  if (titles.length === 0) return undefined;
  const shown = titles.slice(0, OTHER_PLACEMENT_NAME_LIMIT).join('、');
  const rest = titles.length - OTHER_PLACEMENT_NAME_LIMIT;
  return `ほかの置き場所でも上書きしています: ${shown}${rest > 0 ? `、ほか${rest}件` : ''}`;
}

/** 置き場所の全項目について`otherPlacementNote`を求める。 */
export function otherPlacementNotes(
  groups: readonly OverrideGroup[],
  placementKey: string,
  itemIds: readonly SettingsItemId[],
): ReadonlyMap<SettingsItemId, string> {
  const notes = new Map<SettingsItemId, string>();
  for (const id of itemIds) {
    const note = otherPlacementNote(groups, placementKey, id);
    if (note !== undefined) notes.set(id, note);
  }
  return notes;
}

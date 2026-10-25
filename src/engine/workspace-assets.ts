import { isBuiltin } from '#input/romaji/rules.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { levelOverrides, type LevelOverrides } from '#input/settings/index.ts';
import { dedupeTargets, type TargetSet } from './multi-target-selection.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { userAssetsBundleOf, type UserAssetIdMaps, type UserAssetsBundle, type UserAssetsHoldings } from './user-assets-file.ts';
import { workspaceTargets, type LinkGroup, type Workspace, type WorkspacePane, type WorkspacePaneTarget } from './workspace.ts';
import { withWorkspaceColors } from './workspace-colors.ts';

/**
 * Workspaceの書き出しに同梱する自作の資産と、読み込み時の参照の付け替え（DOMを使わない計算）。
 *
 * 同梱するのは、Workspaceから参照をたどって届く自作の資産だけ（組み込みの資産・物理配列・自作のテキストは入れない）:
 * - Workspaceが映す対象（`workspaceTargets`）の配列とSetup
 * - `Workspace.conditions`の指の割り当てとローマ字規則
 * - 同梱するSetupが指す配列と、Setupのレベルの条件の指の割り当て・ローマ字規則
 * - 同梱する配列が推奨するローマ字規則
 * 手元に無い資産を指す参照は同梱する物が無いので、そのまま残す。
 */

/** 条件が指す、指の割り当てとローマ字規則のid。 */
function conditionReferences(conditions: object | undefined): { readonly rule?: string; readonly finger?: string } {
  const record = (conditions ?? {}) as Record<string, unknown>;
  return {
    ...(typeof record.romajiRuleId === 'string' ? { rule: record.romajiRuleId } : {}),
    ...(typeof record.fingerAssignmentId === 'string' ? { finger: record.fingerAssignmentId } : {}),
  };
}

/** Workspaceから参照をたどって届く、手元の自作の資産。手元の並びのまま。 */
export function workspaceAssetsOf(workspaces: readonly Workspace[], holdings: UserAssetsHoldings): UserAssetsBundle {
  const layoutIds = new Set<string>();
  const setupIds = new Set<string>();
  const ruleIds = new Set<string>();
  const fingerIds = new Set<string>();
  const ownLayouts = new Map(holdings.userLayouts.map((layout) => [layout.id, layout] as const));
  const ownSetups = new Map(holdings.setupLibrary.setups.map((setup) => [setup.id, setup] as const));
  const ownRules = new Set(holdings.userRomajiRules.map((rule) => rule.id));
  const ownFingers = new Set(holdings.fingerAssignments.map((assignment) => assignment.id));
  const addRule = (id: string | undefined) => {
    if (id !== undefined && ownRules.has(id)) ruleIds.add(id);
  };
  const addFinger = (id: string | undefined) => {
    if (id !== undefined && ownFingers.has(id)) fingerIds.add(id);
  };
  for (const workspace of workspaces) {
    for (const target of workspaceTargets(workspace)) {
      if (target.kind === 'layout') {
        if (ownLayouts.has(target.layoutId)) layoutIds.add(target.layoutId);
      } else if (ownSetups.has(target.setupId)) {
        setupIds.add(target.setupId);
      }
    }
    const references = conditionReferences(workspace.conditions);
    addRule(references.rule);
    addFinger(references.finger);
  }
  // Setup → 配列・規則・指の割り当て、配列 → 規則の順にたどる（逆向きの参照は無いので1回で閉じる）
  for (const id of setupIds) {
    const setup = ownSetups.get(id)!;
    if (ownLayouts.has(setup.layoutId)) layoutIds.add(setup.layoutId);
    const references = conditionReferences(levelOverrides(holdings.setupLibrary.overrides, { kind: 'setup', setupId: id }));
    addRule(references.rule);
    addFinger(references.finger);
  }
  for (const id of layoutIds) {
    const layout = ownLayouts.get(id)!;
    if (layout.direct !== true) addRule(layout.romaji);
  }
  // 書き出しの突き合わせ（`userAssetsBundleOf`）に通して、同梱しない資産への参照を外す
  return userAssetsBundleOf({
    userLayouts: holdings.userLayouts.filter((layout) => layoutIds.has(layout.id)),
    userRomajiRules: holdings.userRomajiRules.filter((rule) => ruleIds.has(rule.id)),
    fingerAssignments: holdings.fingerAssignments.filter((assignment) => fingerIds.has(assignment.id)),
    setupLibrary: {
      setups: holdings.setupLibrary.setups.filter((setup) => setupIds.has(setup.id)),
      overrides: holdings.setupLibrary.overrides,
    },
  });
}

function remapTarget(target: AnalysisTarget, maps: UserAssetIdMaps): AnalysisTarget {
  if (target.kind === 'layout') {
    const layoutId = maps.layouts.get(target.layoutId);
    return layoutId === undefined || layoutId === target.layoutId ? target : { kind: 'layout', layoutId };
  }
  const setupId = maps.setups.get(target.setupId);
  return setupId === undefined || setupId === target.setupId ? target : { kind: 'setup', setupId };
}

function remapTargetSet(set: TargetSet, maps: UserAssetIdMaps): TargetSet {
  return {
    targets: dedupeTargets(set.targets.map((target) => remapTarget(target, maps))),
    baseline: set.baseline === undefined ? undefined : remapTarget(set.baseline, maps),
  };
}

function remapPaneTarget(target: WorkspacePaneTarget, maps: UserAssetIdMaps): WorkspacePaneTarget {
  return target.kind === 'single'
    ? { kind: 'single', target: remapTarget(target.target, maps) }
    : { kind: 'set', selection: remapTargetSet(target.selection, maps) };
}

function remapPane(pane: WorkspacePane, maps: UserAssetIdMaps): WorkspacePane {
  if (pane.binding.mode !== 'fixed') return pane;
  return { ...pane, binding: { mode: 'fixed', target: remapPaneTarget(pane.binding.target, maps) } };
}

function remapGroup(group: LinkGroup, maps: UserAssetIdMaps): LinkGroup {
  const { single, set } = group.target;
  return {
    ...group,
    target: {
      single: single.target === undefined ? single : { target: remapTarget(single.target, maps) },
      set: remapTargetSet(set, maps),
    },
  };
}

function remapConditions(conditions: LevelOverrides<SettingsValueMap> | undefined, maps: UserAssetIdMaps): LevelOverrides<SettingsValueMap> | undefined {
  if (conditions === undefined) return undefined;
  const next: Record<string, unknown> = { ...conditions };
  if (typeof next.romajiRuleId === 'string' && !isBuiltin(next.romajiRuleId)) next.romajiRuleId = maps.rules.get(next.romajiRuleId) ?? next.romajiRuleId;
  if (typeof next.fingerAssignmentId === 'string') next.fingerAssignmentId = maps.fingers.get(next.fingerAssignmentId) ?? next.fingerAssignmentId;
  return next as LevelOverrides<SettingsValueMap>;
}

/** 対象のkey（`analysisTargetKey`の形）の資産のidを付け替える。 */
function remapColorKey(key: string, maps: UserAssetIdMaps): string {
  if (key.startsWith('layout:')) return `layout:${maps.layouts.get(key.slice('layout:'.length)) ?? key.slice('layout:'.length)}`;
  if (key.startsWith('setup:')) return `setup:${maps.setups.get(key.slice('setup:'.length)) ?? key.slice('setup:'.length)}`;
  return key;
}

/**
 * ファイルのWorkspaceが指す資産のidを、読み込み後のidへ付け替える。付け替えるのは同梱した資産の対応表にあるidだけで、
 * 表に無いid（組み込みの資産や、同梱されなかった資産）は触らない。
 * 対象のkeyで引く色の番号も同じ対応で引き継ぎ、付け替えで重なった対象があれば配り直す。
 */
export function remapWorkspaceAssets(workspace: Workspace, maps: UserAssetIdMaps): Workspace {
  const conditions = remapConditions(workspace.conditions, maps);
  const colorSlots: Record<string, number> = {};
  for (const [key, slot] of Object.entries(workspace.colorSlots)) {
    const mapped = remapColorKey(key, maps);
    if (!(mapped in colorSlots)) colorSlots[mapped] = slot;
  }
  const { conditions: _conditions, ...rest } = workspace;
  return withWorkspaceColors({
    ...rest,
    groups: workspace.groups.map((group) => remapGroup(group, maps)),
    panes: workspace.panes.map((pane) => remapPane(pane, maps)),
    colorSlots,
    ...(conditions === undefined ? {} : { conditions }),
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { Setup } from '#input/setup/index.ts';
import { defaultFingerAssignmentId } from '#engine/finger-assignment.ts';
import type { SettingsCascadeOverrides, SettingsItemId } from '#engine/settings-items.ts';
import { createWorkspace, initialWorkspaceLibrary, type Workspace } from '#engine/workspace.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { cascadeOverrideGroups, type OverrideGroup } from './cascade-override-groups.ts';
import {
  conditionPlacementGroups,
  conditionValueNames,
  otherPlacementNote,
  placementRows,
  type ConditionPlacement,
} from './condition-table.ts';

const ANSI_SHAPE = PHYSICAL_SHAPES['row-staggered'];
const JIS_SHAPE = PHYSICAL_SHAPES['jis-row-staggered'];
const ANSI_FINGER = defaultFingerAssignmentId(ANSI_SHAPE);
const JIS_FINGER = defaultFingerAssignmentId(JIS_SHAPE);

const UNUSABLE_LAYOUT: UserLayout = { id: 'user-unusable', name: '使えない自作', rows: ['', '', '', ''] };

const catalog = paneCatalog({ userLayouts: [UNUSABLE_LAYOUT], userRomajiRules: [] });

function workspaceWith(conditions: Workspace['conditions']): Workspace {
  const created = createWorkspace(initialWorkspaceLibrary(), () => 'ws-1', 'ワークスペース').created;
  return conditions === undefined ? created : { ...created, conditions };
}

function rowsOf(placement: ConditionPlacement, overrides: SettingsCascadeOverrides, workspaces: readonly Workspace[] = [], setups: readonly Setup[] = []) {
  const result = placementRows(placement, { overrides, workspaces, catalog, setups });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('rows');
  return result;
}

const layoutPlacement = (layoutId: string): ConditionPlacement => ({ kind: 'layout', key: `layout:${layoutId}`, title: layoutId, layoutId });
const GLOBAL: ConditionPlacement = { kind: 'global', key: 'global', title: '全体' };

function rowOf(rows: ReturnType<typeof rowsOf>['rows'], id: SettingsItemId) {
  const row = rows.find((candidate) => candidate.id === id);
  assert.notEqual(row, undefined, id);
  return row!;
}

test('配列の置き場所で既定の物理配列の行を変えると、物理配列に依る行の継承する値も変わる', () => {
  const before = rowsOf(layoutPlacement('qwerty'), {});
  assert.equal(rowOf(before.rows, 'fingerAssignmentId').layoutBase, ANSI_FINGER);
  const afterLayout = rowsOf(layoutPlacement('qwerty'), { layout: { qwerty: { defaultShapeId: 'jis-row-staggered' } } });
  assert.equal(rowOf(afterLayout.rows, 'fingerAssignmentId').layoutBase, JIS_FINGER);
  // 全体の既定の物理配列を変えても、配列のレベルの手前の値が動く
  const afterGlobal = rowsOf(layoutPlacement('qwerty'), { global: { defaultShapeId: 'jis-row-staggered' } });
  assert.equal(rowOf(afterGlobal.rows, 'fingerAssignmentId').layoutBase, JIS_FINGER);
});

test('配列の置き場所の継承する値は、Workspaceに上書きがあっても変わらない', () => {
  const workspace = workspaceWith({ windowSize: 7, romajiRuleId: 'azik', defaultShapeId: 'jis-row-staggered' });
  const without = rowsOf(layoutPlacement('qwerty'), { global: { windowSize: 5 } });
  const withWorkspace = rowsOf(layoutPlacement('qwerty'), { global: { windowSize: 5 } }, [workspace]);
  assert.deepEqual(withWorkspace.rows, without.rows);
  assert.equal(rowOf(withWorkspace.rows, 'windowSize').layoutBase, 5);
  assert.equal(rowOf(withWorkspace.rows, 'fingerAssignmentId').layoutBase, ANSI_FINGER);
  // 行の入力が読む上書きにもWorkspaceのレベルは入らない
  assert.equal(withWorkspace.overrides.workspace, undefined);
});

test('配列の置き場所の継承する値は、配列の推奨と全体の値から決まる', () => {
  const result = rowsOf(layoutPlacement('oonishi'), { global: { romajiRuleId: 'azik' } });
  const romaji = rowOf(result.rows, 'romajiRuleId');
  assert.equal(romaji.hasLayoutRecommendation, true);
  assert.equal(romaji.layoutBase, 'oonishi');
});

test('全体の置き場所は全体のレベルだけで解決し、指の割当の既定は全体の既定の物理配列から決まる', () => {
  const overrides: SettingsCascadeOverrides = {
    global: { defaultShapeId: 'jis-row-staggered' },
    layout: { qwerty: { windowSize: 9, defaultShapeId: 'row-staggered' } },
    setup: { 'setup-a': { windowSize: 8 } },
  };
  const result = rowsOf(GLOBAL, overrides);
  const finger = rowOf(result.rows, 'fingerAssignmentId');
  assert.equal(finger.value, JIS_FINGER);
  assert.deepEqual(finger.origin, { kind: 'default' });
  const window = rowOf(result.rows, 'windowSize');
  assert.equal(window.value, 3);
  assert.deepEqual(window.origin, { kind: 'default' });
  assert.deepEqual(rowOf(result.rows, 'defaultShapeId').origin, { kind: 'global' });
});

test('Workspaceの置き場所は、そのWorkspaceの条件を差し込み、指の割当の既定はWorkspaceの既定の物理配列から決まる', () => {
  const workspace = workspaceWith({ defaultShapeId: 'jis-row-staggered', windowSize: 6 });
  const result = rowsOf(
    { kind: 'workspace', key: 'workspace:ws-1', title: 'ワークスペース', workspaceId: 'ws-1' },
    { global: { windowSize: 4 }, layout: { qwerty: { windowSize: 9 } } },
    [workspace],
  );
  assert.equal(result.overrides.workspace?.windowSize, 6);
  const window = rowOf(result.rows, 'windowSize');
  assert.equal(window.value, 6);
  assert.deepEqual(window.origin, { kind: 'workspace' });
  assert.equal(rowOf(result.rows, 'fingerAssignmentId').value, JIS_FINGER);
  // 解釈の行も出どころを持つ
  assert.equal(rowOf(result.rows, 'chainInterpretation').origin.kind, 'default');
});

test('全体とWorkspaceの置き場所の行は、対象に依る注記（効かない・診断）を持たない', () => {
  const result = rowsOf(GLOBAL, { global: { defaultShapeId: 'shape-gone', preferOppositeThumb: true } });
  for (const row of result.rows) {
    assert.equal(row.applicable, true, row.id);
    assert.deepEqual(row.diagnostics, [], row.id);
  }
});

test('配列とSetupの置き場所は、対象に依る注記を持つ', () => {
  const layout = rowsOf(layoutPlacement('qwerty'), {});
  assert.equal(rowOf(layout.rows, 'preferOppositeThumb').applicable, false);
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
  const setupResult = rowsOf({ kind: 'setup', key: 'setup:setup-a', title: 'Setup', setupId: 'setup-a' }, {}, [], [setup]);
  assert.equal(rowOf(setupResult.rows, 'preferOppositeThumb').applicable, false);
});

test('Setupの置き場所は、Setupのレベルの手前までの値を持つ', () => {
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'jis-row-staggered' };
  const result = rowsOf(
    { kind: 'setup', key: 'setup:setup-a', title: 'Setup', setupId: 'setup-a' },
    { layout: { qwerty: { windowSize: 6 } } },
    [],
    [setup],
  );
  assert.equal(rowOf(result.rows, 'windowSize').setupBase, 6);
  assert.equal(rowOf(result.rows, 'fingerAssignmentId').setupBase, JIS_FINGER);
});

test('計算に使えない配列・見つからないSetupは、行を出さず値を出せない旨を返す', () => {
  const names = conditionValueNames(catalog, [UNUSABLE_LAYOUT], [], []);
  const groups = conditionPlacementGroups({ catalog, userLayouts: [UNUSABLE_LAYOUT], userRomajiRules: [], workspaces: [], setups: [], names });
  const placement = groups.flatMap((group) => group.placements).find((candidate) => candidate.key === 'layout:user-unusable');
  assert.notEqual(placement, undefined);
  assert.equal(placement!.title, '配列「使えない自作」');
  const result = placementRows(placement!, { overrides: {}, workspaces: [], catalog, setups: [] });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /計算に使えない/);
    assert.match(result.detail ?? '', /英字の段が空/);
  }
  const missing = placementRows({ kind: 'setup', key: 'setup:x', title: 'x', setupId: 'x' }, { overrides: {}, workspaces: [], catalog, setups: [] });
  assert.equal(missing.ok, false);
  const brokenSetup: Setup = { id: 'setup-b', number: 2, layoutId: 'qwerty', shapeId: 'shape-gone' };
  const broken = placementRows({ kind: 'setup', key: 'setup:setup-b', title: 'b', setupId: 'setup-b' }, { overrides: {}, workspaces: [], catalog, setups: [brokenSetup] });
  assert.equal(broken.ok, false);
});

test('置き場所は全体・Workspace・配列・Setupの順に並び、名前は上書きの一覧と同じ', () => {
  const workspaces = [workspaceWith(undefined)];
  const setups = [{ id: 'setup-a', displayName: 'Setupの名前' }];
  const names = conditionValueNames(catalog, [], [], []);
  const groups = conditionPlacementGroups({ catalog, userLayouts: [], userRomajiRules: [], workspaces, setups, names });
  assert.deepEqual(groups.map((group) => group.id), ['global', 'workspace', 'builtin-alphabet', 'builtin-kana', 'setup']);
  const titles = new Map(groups.flatMap((group) => group.placements).map((placement) => [placement.key, placement.title] as const));
  const listed = cascadeOverrideGroups({
    overrides: { global: { windowSize: 4 }, layout: { qwerty: { windowSize: 4 } }, setup: { 'setup-a': { windowSize: 4 } } },
    workspaces: [{ ...workspaces[0]!, conditions: { windowSize: 4 } }],
    setups,
    names,
  });
  assert.deepEqual(listed.map((group) => group.key), ['global', 'workspace:ws-1', 'layout:qwerty', 'setup:setup-a']);
  for (const group of listed) assert.equal(titles.get(group.key), group.title, group.key);
});

function groupOf(key: string, title: string, itemIds: readonly SettingsItemId[]): OverrideGroup {
  return {
    key,
    title,
    level: { kind: 'global' },
    missingSetup: false,
    entries: itemIds.map((itemId) => ({ itemId, label: itemId, valueText: '', unused: false })),
  };
}

test('他の置き場所の上書きの名前は3つまで出し、残りは数で出す', () => {
  const groups = ['a', 'b', 'c', 'd', 'e'].map((name) => groupOf(`layout:${name}`, `配列「${name}」`, ['windowSize']));
  const note = otherPlacementNote(groups, 'global', 'windowSize');
  assert.equal(note, 'ほかの置き場所でも上書きしています: 配列「a」、配列「b」、配列「c」、ほか2件');
  assert.equal(
    otherPlacementNote(groups.slice(0, 3), 'global', 'windowSize'),
    'ほかの置き場所でも上書きしています: 配列「a」、配列「b」、配列「c」',
  );
});

test('他の置き場所の上書きは、選んだ置き場所と別の項目を数えず、物理配列などのレベルも数える', () => {
  const groups = [
    groupOf('global', '全体', ['windowSize']),
    groupOf('shape:row-staggered', '物理配列「x」', ['windowSize', 'sfbHomeCost']),
    groupOf('layout:gone', '（見つからない配列）', ['windowSize']),
    groupOf('setup:s', 'Setup', ['sfbHomeCost']),
  ];
  assert.equal(
    otherPlacementNote(groups, 'global', 'windowSize'),
    'ほかの置き場所でも上書きしています: 物理配列「x」、（見つからない配列）',
  );
  assert.equal(otherPlacementNote(groups, 'setup:s', 'sfbHomeCost'), 'ほかの置き場所でも上書きしています: 物理配列「x」');
  assert.equal(otherPlacementNote(groups, 'global', 'romajiRuleId'), undefined);
});

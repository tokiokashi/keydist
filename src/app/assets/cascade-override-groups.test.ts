import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import { resetCascadeItemCommand, type KeydistAssets } from '#engine/commands.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import { SETTINGS_ITEMS, type SettingsCascadeOverrides, type SettingsValueMap } from '#engine/settings-items.ts';
import { createWorkspace, initialWorkspaceLibrary, type Workspace } from '#engine/workspace.ts';
import { conditionItemLabel, conditionOverrideValueText, type ConditionValueNames } from '#hosts/shared/condition-summary.ts';
import { cascadeOverrideGroups } from './cascade-override-groups.ts';

const SHAPES = new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape]));
const CUSTOM_FINGER = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-a', name: '自作の運指' };

const NAMES: ConditionValueNames = {
  shapes: SHAPES,
  layouts: new Map<string, { readonly name: string }>([...LAYOUT_BY_ID, ['user-a', { name: '自作A' }]]),
  romajiRules: new Map([['rule-a', { name: '自作の規則' }]]),
  fingerAssignments: new Map([[CUSTOM_FINGER.id, CUSTOM_FINGER]]),
};

function groupsOf(overrides: SettingsCascadeOverrides, extra: { workspaces?: readonly Workspace[]; setups?: { id: string; displayName: string }[] } = {}) {
  return cascadeOverrideGroups({ overrides, workspaces: extra.workspaces ?? [], setups: extra.setups ?? [], names: NAMES });
}

test('条件の項目の定義にある全項目に、一覧に出す名前と値の文言がある', () => {
  for (const id of Object.keys(SETTINGS_ITEMS) as (keyof typeof SETTINGS_ITEMS)[]) {
    assert.notEqual(conditionItemLabel(id), undefined, `${id}の名前`);
    const defaultValue = typeof SETTINGS_ITEMS[id].defaultValue === 'function' ? undefined : SETTINGS_ITEMS[id].defaultValue;
    if (defaultValue === undefined) continue;
    const text = conditionOverrideValueText(id, defaultValue, NAMES);
    assert.ok(text.length > 0, `${id}の値`);
    assert.doesNotMatch(text, /\[object Object\]/, `${id}の値`);
  }
});

test('配列のレベルのローマ字規則は、配列の名前・項目の名前・規則の名前で出る', () => {
  const [group] = groupsOf({ layout: { 'user-a': { romajiRuleId: 'rule-a' } } });
  assert.equal(group!.title, '配列「自作A」');
  assert.deepEqual(group!.entries.map((entry) => [entry.label, entry.valueText]), [['ローマ字規則', '自作の規則']]);
});

test('指の割当は、自作でも名前で出し、手持ちに無ければ見つからない旨を出す。idは出ない', () => {
  const [group] = groupsOf({ global: { fingerAssignmentId: 'finger-a' }, layout: { qwerty: { fingerAssignmentId: 'finger-gone' } } });
  assert.match(group!.entries[0]!.valueText, /^自作の運指/);
  const missing = groupsOf({ layout: { qwerty: { fingerAssignmentId: 'finger-gone', romajiRuleId: 'rule-gone', defaultShapeId: 'shape-gone' } } })[0]!;
  assert.deepEqual(missing.entries.map((entry) => entry.valueText), ['（見つからないローマ字規則）', '（見つからない指の割当）', '（見つからない物理配列）']);
  assert.doesNotMatch(JSON.stringify(missing), /gone/);
});

test('適用範囲はカスケードの順に並び、継承する値と同じ値も出る', () => {
  const library = createWorkspace(initialWorkspaceLibrary(), () => 'ws-1', 'ワークスペース').library;
  const workspace: Workspace = { ...library[0]!, conditions: { windowSize: 4 } };
  const groups = groupsOf(
    {
      global: { windowSize: 3 },
      shape: { 'row-staggered': { windowSize: 5 } },
      inputMethod: { romaji: { windowSize: 6 } },
      layout: { qwerty: { windowSize: 7 } },
      setup: { 's-1': { windowSize: 8 } },
    },
    { workspaces: [workspace], setups: [{ id: 's-1', displayName: 'Setup A' }] },
  );
  assert.deepEqual(groups.map((group) => group.key), ['global', 'workspace:ws-1', 'shape:row-staggered', 'inputMethod:romaji', 'layout:qwerty', 'setup:s-1']);
  assert.deepEqual(groups.map((group) => group.title), ['全体', 'ワークスペース', `物理配列「${SHAPES.get('row-staggered')!.name}」`, 'ローマ字入力', `配列「${LAYOUT_BY_ID.get('qwerty')!.name}」`, 'Setup A']);
  assert.equal(groups[0]!.entries[0]!.valueText, '3');
  assert.deepEqual(groups.map((group) => group.entries[0]!.unused), [false, false, true, true, false, false]);
});

test('項目が置けないレベルの値は、使われない印を付けて出す', () => {
  const [group] = groupsOf({ shape: { 'row-staggered': { windowSize: 5, preferOppositeThumb: true } } });
  assert.deepEqual(group!.entries.map((entry) => [entry.itemId, entry.unused]), [['windowSize', true], ['preferOppositeThumb', false]]);
});

test('同名のWorkspaceは番号で区別する', () => {
  const base = createWorkspace(initialWorkspaceLibrary(), () => 'a', 'W').library[0]!;
  const workspaces = [
    { ...base, id: 'a', conditions: { windowSize: 4 } },
    { ...base, id: 'b', conditions: { windowSize: 5 } },
    { ...base, id: 'c', name: '別', conditions: { windowSize: 6 } },
  ];
  assert.deepEqual(groupsOf(emptyCascadeOverrides(), { workspaces }).map((group) => group.title), ['W（1）', 'W（2）', '別']);
});

test('手持ちに無い配列・物理配列・Setupは見つからない旨で出し、複数あれば番号で区別する。idは出ない', () => {
  const groups = groupsOf(
    {
      shape: { 'shape-x': { windowSize: 3 } },
      layout: { 'gone-1': { windowSize: 3 }, qwerty: { windowSize: 3 }, 'gone-2': { windowSize: 3 } },
      setup: { 'setup-gone': { windowSize: 3 } },
    },
    { setups: [] },
  );
  assert.deepEqual(groups.map((group) => group.title), ['（見つからない物理配列）', `配列「${LAYOUT_BY_ID.get('qwerty')!.name}」`, '（見つからない配列1）', '（見つからない配列2）', '（見つからないSetup）']);
  assert.deepEqual(groups.map((group) => group.missingSetup), [false, false, false, false, true]);
  assert.doesNotMatch(groups.map((group) => group.title).join(), /gone|shape-x/);
});

test('上書きが無ければ何も出ない', () => {
  assert.deepEqual(groupsOf(emptyCascadeOverrides()), []);
});

function assetsWith(overrides: SettingsCascadeOverrides, workspaces: readonly Workspace[]): KeydistAssets {
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides };
  return {
    setupLibrary,
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces,
    presetLibrary: { presets: [] },
    userLayouts: [],
    userRomajiRules: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

test('一覧の適用範囲の情報で上書きを消すと一覧から消え、元に戻すと戻る。Workspaceのレベルも同じ', () => {
  const workspace: Workspace = { ...createWorkspace(initialWorkspaceLibrary(), () => 'ws-1', 'W').library[0]!, conditions: { windowSize: 4 } };
  const assets = assetsWith({ layout: { 'user-a': { romajiRuleId: 'rule-a' } } }, [workspace]);
  const listOf = (current: KeydistAssets) => groupsOf(current.setupLibrary.overrides, { workspaces: current.workspaces });
  assert.deepEqual(listOf(assets).map((group) => group.key), ['workspace:ws-1', 'layout:user-a']);

  let history = emptyCommandHistory<KeydistAssets>();
  let current = assets;
  for (const group of listOf(assets)) {
    const step = applyCommand(current, history, resetCascadeItemCommand(group.level, group.entries[0]!.itemId, group.workspaceId));
    assert.equal(step.outcome.kind, 'applied');
    history = step.history;
    current = step.assets;
  }
  assert.deepEqual(listOf(current), []);
  for (let index = 0; index < 2; index += 1) {
    const step = undo(current, history);
    history = step.history;
    current = step.assets;
  }
  assert.deepEqual(listOf(current).map((group) => group.key), ['workspace:ws-1', 'layout:user-a']);
});

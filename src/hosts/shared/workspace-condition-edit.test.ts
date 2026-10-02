import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  withWorkspaceConditions,
  type SettingsCascadeOverrides,
  type SettingsValueMap,
} from '#engine/settings-items.ts';
import { createWorkspace, findWorkspace, initialWorkspaceLibrary } from '#engine/workspace.ts';
import {
  WORKSPACE_LEVEL,
  defaultShapeWorkspaceCommand,
  overrideWinsNotices,
  promoteWorkspaceToGlobalCommand,
  resetAllCommand,
  resettableGlobalIds,
  resettableWorkspaceIds,
  setWorkspaceCommand,
  workspaceOverrideOf,
} from './condition-edit.ts';
import {
  globalConditionLevels,
  globalConditionValues,
  multiTargetConditionSummary,
  traceConditionSummary,
  type TargetConditionInput,
} from './condition-summary.ts';

// Workspaceのレベルの編集（条件のモーダルをWorkspaceのペインから開いた時の書き込み・理由・共通の行）。

function assets(overrides: SettingsCascadeOverrides = emptyCascadeOverrides()): KeydistAssets {
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides };
  return {
    setupLibrary,
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: createWorkspace(initialWorkspaceLibrary(), () => 'w1', 'w').library,
    presetLibrary: { presets: [] },
  };
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function rowsOf(layoutId: string, overrides: SettingsCascadeOverrides) {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text: 'hello world',
    language: 'en',
  });
  assert.ok(result.ok);
  return traceConditionSummary(result.input.cascade);
}

test('setWorkspaceCommand: 全体の値と同じ値を書く時は、Workspaceの上書きを消す', () => {
  let state = assets({ global: { windowSize: 7 } });
  let history = emptyCommandHistory<KeydistAssets>();
  // 全体の値（7）と違う値はWorkspaceへ書く
  let step = applyCommand(state, history, setWorkspaceCommand('w1', 'windowSize', 5, 7));
  state = step.assets;
  history = step.history;
  assert.deepEqual(findWorkspace(state.workspaces, 'w1')?.conditions, { windowSize: 5 });
  // 全体の値と同じ値へ戻すと、Workspaceの上書きが消える（継承しているだけなのに「Workspaceで変更」と出さない）
  step = applyCommand(state, history, setWorkspaceCommand('w1', 'windowSize', 7, 7));
  assert.equal(findWorkspace(step.assets.workspaces, 'w1')?.conditions, undefined);
  assert.equal(step.assets.setupLibrary.overrides.global?.windowSize, 7);
});

test('「すべて戻す」（Workspace）: Workspaceの上書きだけを消し、今の配列の上書きと全体は残す', () => {
  let state = assets();
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [
    setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 7),
    setCascadeOverrideCommand(WORKSPACE_LEVEL, 'windowSize', 5, 'w1'),
    setCascadeOverrideCommand(WORKSPACE_LEVEL, 'sfbHomeCost', false, 'w1'),
    setCascadeOverrideCommand({ kind: 'layout', layoutId: 'qwerty' }, 'windowSize', 2),
  ]) {
    const step = applyCommand(state, history, command);
    state = step.assets;
    history = step.history;
  }
  const view = withWorkspaceConditions(state.setupLibrary.overrides, findWorkspace(state.workspaces, 'w1')?.conditions);
  assert.deepEqual(resettableWorkspaceIds(view), ['windowSize', 'sfbHomeCost']);
  // Workspaceのペインは全体の上書きを消す対象にしない（resettableGlobalIdsは単体ページが使う）
  assert.deepEqual(resettableGlobalIds(view), ['windowSize']);

  // 配列のレベルの値は単体ページや他のWorkspaceにも入るので、Workspaceのペインは消す対象に渡さない
  const reset = applyCommand(state, history, resetAllCommand(
    [],
    undefined,
    { workspaceId: 'w1', ids: resettableWorkspaceIds(view) },
  ));
  assert.equal(reset.outcome.kind, 'applied');
  assert.equal(findWorkspace(reset.assets.workspaces, 'w1')?.conditions, undefined);
  assert.equal(reset.assets.setupLibrary.overrides.layout?.qwerty?.windowSize, 2);
  assert.equal(reset.assets.setupLibrary.overrides.global?.windowSize, 7);
  const undone = undo(reset.assets, reset.history);
  assert.deepEqual(findWorkspace(undone.assets.workspaces, 'w1')?.conditions, { windowSize: 5, sfbHomeCost: false });
  assert.equal(undone.assets.setupLibrary.overrides.layout?.qwerty?.windowSize, 2);
});

test('Workspaceの値を全体へ移す: 全体へ書いてWorkspaceの値を消す。移しても、このWorkspaceの解決値は変わらない', () => {
  const start = applyCommand(assets(), emptyCommandHistory<KeydistAssets>(), setCascadeOverrideCommand(WORKSPACE_LEVEL, 'windowSize', 5, 'w1'));
  const before = rowsOf('qwerty', withWorkspaceConditions(start.assets.setupLibrary.overrides, findWorkspace(start.assets.workspaces, 'w1')?.conditions));
  const promoted = applyCommand(start.assets, start.history, promoteWorkspaceToGlobalCommand('w1', 'windowSize', 3));
  const after = rowsOf('qwerty', withWorkspaceConditions(promoted.assets.setupLibrary.overrides, findWorkspace(promoted.assets.workspaces, 'w1')?.conditions));
  assert.equal(before.find((row) => row.id === 'windowSize')!.value, 5);
  assert.equal(after.find((row) => row.id === 'windowSize')!.value, 5);
  assert.deepEqual(after.find((row) => row.id === 'windowSize')!.origin, { kind: 'global' });
});

test('既定の物理配列のチップ（Workspace）: Workspaceのレベルへ書き、全体と同じ物理配列を選ぶと上書きを消す', () => {
  const written = applyCommand(assets(), emptyCommandHistory<KeydistAssets>(), defaultShapeWorkspaceCommand('w1', 'ortholinear', 'row-staggered'));
  const conditions = findWorkspace(written.assets.workspaces, 'w1')?.conditions;
  assert.deepEqual(conditions, { defaultShapeId: 'ortholinear' });
  assert.equal(written.assets.setupLibrary.overrides.global, undefined);
  const view = withWorkspaceConditions(written.assets.setupLibrary.overrides, conditions);
  assert.equal(workspaceOverrideOf(view, 'defaultShapeId'), 'ortholinear');
  const reset = applyCommand(written.assets, written.history, defaultShapeWorkspaceCommand('w1', 'row-staggered', 'row-staggered'));
  assert.equal(findWorkspace(reset.assets.workspaces, 'w1')?.conditions, undefined);
});

test('出どころ: Workspaceの値は「Workspace」と出て、変えた項目に数える。全体を編集する行には勝つ理由が出る', () => {
  const view = withWorkspaceConditions({ global: { windowSize: 7 } }, { windowSize: 5, sfbHomeCost: false });
  const rows = rowsOf('qwerty', view);
  const n = rows.find((row) => row.id === 'windowSize')!;
  assert.equal(n.originLabel, '上書き: Workspace');
  assert.equal(n.displayValue, '5');
  // 全体を編集している行: Workspaceの値が勝つので、全体を変えても画面は変わらない
  const global = overrideWinsNotices(rows);
  assert.equal(global.get('windowSize'), 'Workspaceの値が優先されるため、全体を変えてもこの画面は変わらない');
  // Workspaceを編集している行: Workspaceの値自身には勝つ理由を出さない
  assert.equal(overrideWinsNotices(rows, undefined, 'Workspace').get('windowSize'), undefined);
});

test('出どころ: Workspaceより強いレベル・配列の推奨が勝つ行は、Workspaceを変えても変わらない理由が出る', () => {
  const view = withWorkspaceConditions({ layout: { qwerty: { windowSize: 2 } } }, { windowSize: 5 });
  const notices = overrideWinsNotices(rowsOf('qwerty', view), undefined, 'Workspace');
  assert.match(notices.get('windowSize') ?? '', /Workspaceを変えてもこの画面は変わらない/);
  // 大西配列の推奨（大西式）は、Workspaceのローマ字規則に勝つ。出どころは既定値のまま
  const romaji = withWorkspaceConditions(EMPTY_SETTINGS_OVERRIDES, { romajiRuleId: 'hepburn' });
  const rows = rowsOf('oonishi', romaji);
  assert.equal(rows.find((row) => row.id === 'romajiRuleId')!.recommendationWinsOverWorkspace, true);
  assert.match(overrideWinsNotices(rows, undefined, 'Workspace').get('romajiRuleId') ?? '', /この配列の推奨（.+）が優先されるため、Workspaceを変えてもこの画面は変わらない/);
  // 推奨の無い配列はWorkspaceの値に従う
  assert.equal(rowsOf('qwerty', romaji).find((row) => row.id === 'romajiRuleId')!.value, 'hepburn');
});

test('比較表・N感度の共通の行: Workspaceの値は全体の値に重なり、出どころも「Workspace」になる。差は共通の行との違いだけ', () => {
  const view = withWorkspaceConditions({ global: { windowSize: 7 } }, { windowSize: 5 });
  assert.equal(globalConditionValues(view).windowSize, 5);
  assert.equal(globalConditionLevels(view).windowSize, 'workspace');
  // Workspaceに値が無い項目は全体の値、どちらにも無ければ値なし
  const mixed = withWorkspaceConditions({ global: { windowSize: 7, sfbHomeCost: false } }, { windowSize: 5 });
  assert.equal(globalConditionValues(mixed).sfbHomeCost, false);
  assert.equal(globalConditionLevels(mixed).sfbHomeCost, 'global');
  assert.equal(globalConditionValues(mixed).preferOppositeThumb, undefined);
  // 単体ページは差し込まないので、全体の値だけ
  assert.equal(globalConditionValues({ global: { windowSize: 7 } }).windowSize, 7);

  const targets: TargetConditionInput[] = ['qwerty', 'dvorak'].map((layoutId) => ({
    key: layoutId,
    label: layoutId,
    rows: rowsOf(layoutId, view),
  }));
  const summary = multiTargetConditionSummary(targets, {
    globalValues: globalConditionValues(view),
    globalLevels: globalConditionLevels(view),
  });
  const n = summary.rows.find((row) => row.id === 'windowSize')!;
  assert.equal(n.displayValue, '5');
  assert.equal(n.originLabel, '上書き: Workspace');
  assert.deepEqual(summary.diffs, []);
});

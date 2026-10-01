import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { DEFAULT_ACTION_REALIZATION_POLICY } from '#input/semantics/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import type { SettingsValueMap } from '#engine/settings-items.ts';
import {
  actionCountModeOf,
  classGroupingOf,
  defaultShapeCommand,
  globalOverrideOf,
  overrideWinsNotices,
  resetAllGlobalCommand,
  resettableGlobalIds,
  setGlobalCommand,
  staticDefaultOf,
  withActionCountMode,
  withClassGrouping,
} from './condition-edit.ts';
import type { ConditionSummaryRow } from './condition-summary.ts';

function emptyAssets(): KeydistAssets {
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides: emptyCascadeOverrides() };
  return {
    setupLibrary,
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: initialWorkspaceLibrary(),
    presetLibrary: { presets: [] },
  };
}

test('setGlobalCommand: 既定と違う値は全体のレベルへ書き、undoで戻る', () => {
  const step = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setGlobalCommand('windowSize', 5, staticDefaultOf('windowSize')));
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(globalOverrideOf(step.assets.setupLibrary.overrides, 'windowSize'), 5);
  const undone = undo(step.assets, step.history);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'windowSize'), undefined);
});

test('setGlobalCommand: 既定値と同じ値を書くと上書きを消す（出どころが既定値へ戻る）', () => {
  const first = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setGlobalCommand('sfbHomeCost', false, true));
  assert.equal(globalOverrideOf(first.assets.setupLibrary.overrides, 'sfbHomeCost'), false);
  const back = applyCommand(first.assets, first.history, setGlobalCommand('sfbHomeCost', true, true));
  assert.equal(globalOverrideOf(back.assets.setupLibrary.overrides, 'sfbHomeCost'), undefined);
});

test('setGlobalCommand: オブジェクトの項目も、中身が既定と同じなら上書きを消す', () => {
  const chain = staticDefaultOf('chainInterpretation');
  const changed = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setGlobalCommand('chainInterpretation', { ...chain, breakOnTriggerOnly: true }, chain),
  );
  assert.equal(globalOverrideOf(changed.assets.setupLibrary.overrides, 'chainInterpretation')?.breakOnTriggerOnly, true);
  const back = applyCommand(changed.assets, changed.history, setGlobalCommand('chainInterpretation', { ...chain }, chain));
  assert.equal(globalOverrideOf(back.assets.setupLibrary.overrides, 'chainInterpretation'), undefined);
});

test('動作数の扱い: 2動作にして例外を足し、1動作へ戻すと例外ごと既定へ戻る', () => {
  const separate = withActionCountMode(DEFAULT_ACTION_REALIZATION_POLICY, 'separate');
  assert.equal(actionCountModeOf(separate), 'separate');
  // 既定は「先に押しておくキー」が別動作、「押す順を問わないキー」が1動作。
  assert.equal(classGroupingOf(separate, 'prepress-required'), 'separate');
  assert.equal(classGroupingOf(separate, 'order-free'), 'combined');

  const withException = withClassGrouping(separate, 'order-free', 'separate');
  assert.equal(classGroupingOf(withException, 'order-free'), 'separate');
  assert.deepEqual(withException.triggerActivationClassOverrides, { 'order-free': 'separate' });

  const back = withActionCountMode(withException, 'combined');
  assert.deepEqual(back, DEFAULT_ACTION_REALIZATION_POLICY);
});

test('動作数の扱い: 例外を既定と同じ値へ戻すと例外として持たない', () => {
  const separate = withActionCountMode(DEFAULT_ACTION_REALIZATION_POLICY, 'separate');
  const changed = withClassGrouping(separate, 'prepress-required', 'combined');
  assert.deepEqual(changed.triggerActivationClassOverrides, { 'prepress-required': 'combined' });
  const restored = withClassGrouping(changed, 'prepress-required', 'separate');
  assert.deepEqual(restored.triggerActivationClassOverrides, {});
});

function row(id: ConditionSummaryRow['id'], origin: ConditionSummaryRow['origin'], originLabel: string): ConditionSummaryRow {
  return {
    id,
    label: id,
    format: 'primitive',
    displayValue: '3',
    valueKey: '3',
    origin,
    originLabel,
    applicable: true,
    sameAsDefault: false,
    diagnostics: [],
    recommendationWinsOverGlobal: false,
  };
}

test('overrideWinsNotices: 下のレベルが勝つ行にだけ、配列を問わず理由を出す', () => {
  const rows = [
    row('windowSize', { kind: 'layout', layoutId: 'oonishi' }, '上書き: 配列「大西配列」'),
    row('sfbHomeCost', { kind: 'global' }, '上書き: 全体'),
    row('preferOppositeThumb', { kind: 'default' }, '既定値'),
  ];
  const names = { shapes: new Map(), layouts: new Map([['oonishi', { name: '大西配列' }]]) };
  const notices = overrideWinsNotices(rows, names);
  assert.deepEqual([...notices.keys()], ['windowSize']);
  assert.match(notices.get('windowSize')!, /^配列「大西配列」の値が優先されるため/);
});

test('overrideWinsNotices: QWERTYの配列の上書きでも理由を出す', () => {
  const rows = [row('windowSize', { kind: 'layout', layoutId: 'qwerty' }, '上書き: 配列')];
  const names = { shapes: new Map(), layouts: new Map([['qwerty', { name: 'QWERTY' }]]) };
  assert.match(overrideWinsNotices(rows, names).get('windowSize')!, /^配列「QWERTY」の値が優先されるため/);
});

test('overrideWinsNotices: 配列の推奨が全体に勝つ行は、既定値のままでも理由を出す', () => {
  const rows = [
    { ...row('romajiRuleId', { kind: 'default' }, '既定値'), displayValue: '大西式', recommendationWinsOverGlobal: true },
    row('windowSize', { kind: 'default' }, '既定値'),
  ];
  const notices = overrideWinsNotices(rows);
  assert.deepEqual([...notices.keys()], ['romajiRuleId']);
  assert.match(notices.get('romajiRuleId')!, /^この配列の推奨（大西式）が優先されるため/);
});

test('すべて既定値に戻す: 行のある項目の全体の上書きだけを1コマンドで消し、行の無い項目は残す。元に戻すの1回で全部戻る', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [
    setGlobalCommand('windowSize', 5, staticDefaultOf('windowSize')),
    setGlobalCommand('sfbHomeCost', false, true),
    setCascadeOverrideCommand({ kind: 'global' }, 'playbackRateWindow', 9),
  ]) {
    const step = applyCommand(assets, history, command);
    assets = step.assets;
    history = step.history;
  }
  const ids = resettableGlobalIds(assets.setupLibrary.overrides);
  assert.deepEqual(ids, ['windowSize', 'sfbHomeCost']);
  const before = history.undoStack.length;
  const reset = applyCommand(assets, history, resetAllGlobalCommand(ids));
  assert.equal(reset.history.undoStack.length, before + 1);
  assert.equal(globalOverrideOf(reset.assets.setupLibrary.overrides, 'windowSize'), undefined);
  assert.equal(globalOverrideOf(reset.assets.setupLibrary.overrides, 'sfbHomeCost'), undefined);
  assert.equal(reset.assets.setupLibrary.overrides.global?.playbackRateWindow, 9);
  const undone = undo(reset.assets, reset.history);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'windowSize'), 5);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'sfbHomeCost'), false);
});

test('既定の物理配列: 全体のレベルへ書き、既定の物理配列と同じ値を書くと上書きを消す。元に戻すが効く', () => {
  const defaultShape = staticDefaultOf('defaultShapeId');
  const first = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setGlobalCommand('defaultShapeId', 'ortholinear', defaultShape));
  assert.equal(first.outcome.kind, 'applied');
  assert.equal(globalOverrideOf(first.assets.setupLibrary.overrides, 'defaultShapeId'), 'ortholinear');

  const back = applyCommand(first.assets, first.history, setGlobalCommand('defaultShapeId', defaultShape, defaultShape));
  assert.equal(globalOverrideOf(back.assets.setupLibrary.overrides, 'defaultShapeId'), undefined);
  const undone = undo(back.assets, back.history);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'defaultShapeId'), 'ortholinear');
});

test('文脈バーのチップの命令: 既定と同じ物理配列を選び直すと全体の上書きが消える', () => {
  const set = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), defaultShapeCommand('ortholinear'));
  assert.equal(globalOverrideOf(set.assets.setupLibrary.overrides, 'defaultShapeId'), 'ortholinear');
  const back = applyCommand(set.assets, set.history, defaultShapeCommand(staticDefaultOf('defaultShapeId')));
  assert.equal(globalOverrideOf(back.assets.setupLibrary.overrides, 'defaultShapeId'), undefined);
});

test('すべて既定値に戻す: 既定の物理配列の全体の上書きも消す', () => {
  const step = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setGlobalCommand('defaultShapeId', 'ortholinear', staticDefaultOf('defaultShapeId')),
  );
  const ids = resettableGlobalIds(step.assets.setupLibrary.overrides);
  assert.deepEqual(ids, ['defaultShapeId']);
  const reset = applyCommand(step.assets, step.history, resetAllGlobalCommand(ids));
  assert.equal(globalOverrideOf(reset.assets.setupLibrary.overrides, 'defaultShapeId'), undefined);
});

test('resettableGlobalIds: このペインが行を出さない項目は数えない', () => {
  const step = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setGlobalCommand('windowSize', 5, staticDefaultOf('windowSize')));
  assert.deepEqual(resettableGlobalIds(step.assets.setupLibrary.overrides, ['windowSize']), []);
});

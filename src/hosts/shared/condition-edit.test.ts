import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides, type CascadeContext } from '#input/settings/index.ts';
import { LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { DEFAULT_ACTION_REALIZATION_POLICY } from '#input/semantics/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import { EMPTY_SETTINGS_OVERRIDES, resolveSettings, setSettingsOverride, type SettingsValueMap } from '#engine/settings-items.ts';
import {
  actionCountModeOf,
  canEditAtLayout,
  defaultShapeChipNotice,
  classGroupingOf,
  defaultShapeCommand,
  globalOverrideOf,
  layoutOverrideOf,
  overrideWinsNotices,
  promoteToGlobalCommand,
  resetAllCommand,
  resettableLayoutIds,
  resettableGlobalIds,
  setGlobalCommand,
  setLayoutCommand,
  staticDefaultOf,
  withActionCountMode,
  withClassGrouping,
} from './condition-edit.ts';
import { traceConditionSummary, type ConditionSummaryRow } from './condition-summary.ts';

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
    value: 3,
    layoutBase: 3,
    hasLayoutRecommendation: false,
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
  const reset = applyCommand(assets, history, resetAllCommand(ids));
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
  const reset = applyCommand(step.assets, step.history, resetAllCommand(ids));
  assert.equal(globalOverrideOf(reset.assets.setupLibrary.overrides, 'defaultShapeId'), undefined);
});

test('resettableGlobalIds: このペインが行を出さない項目は数えない', () => {
  const step = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setGlobalCommand('windowSize', 5, staticDefaultOf('windowSize')));
  assert.deepEqual(resettableGlobalIds(step.assets.setupLibrary.overrides, ['windowSize']), []);
});

test('overrideWinsNotices: 下のレベルの値が既定と同じ効き方（動作数の扱いの1動作）でも、全体に勝つ理由を出す', () => {
  const rows = [
    { ...row('actionRealizationPolicy', { kind: 'setup', setupId: 's' }, '上書き: このSetup'), sameAsDefault: true },
    // 効かない行は、下のレベルの値があっても出さない
    { ...row('windowSize', { kind: 'layout', layoutId: 'qwerty' }, '上書き: 配列'), applicable: false },
  ];
  const notices = overrideWinsNotices(rows);
  assert.deepEqual([...notices.keys()], ['actionRealizationPolicy']);
  assert.match(notices.get('actionRealizationPolicy')!, /^このSetupの値が優先されるため/);
});

test('setLayoutCommand: 配列のレベルへ書き、継承する値と同じ値へ戻すと上書きを消す。undoで戻る', () => {
  const written = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setLayoutCommand('qwerty', 'windowSize', 5, 3));
  assert.equal(layoutOverrideOf(written.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), 5);
  assert.equal(globalOverrideOf(written.assets.setupLibrary.overrides, 'windowSize'), undefined);
  assert.equal(layoutOverrideOf(written.assets.setupLibrary.overrides, 'dvorak', 'windowSize'), undefined);
  const back = applyCommand(written.assets, written.history, setLayoutCommand('qwerty', 'windowSize', 3, 3));
  assert.equal(layoutOverrideOf(back.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), undefined);
  const undone = undo(written.assets, written.history);
  assert.equal(layoutOverrideOf(undone.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), undefined);
});

test('setLayoutCommand: 継承する値が推奨の時は、推奨と違う値を書き、推奨と同じ値へ戻すと消す', () => {
  const written = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setLayoutCommand('oonishi', 'romajiRuleId', 'kunrei', 'oonishi'));
  assert.equal(layoutOverrideOf(written.assets.setupLibrary.overrides, 'oonishi', 'romajiRuleId'), 'kunrei');
  const back = applyCommand(written.assets, written.history, setLayoutCommand('oonishi', 'romajiRuleId', 'oonishi', 'oonishi'));
  assert.equal(layoutOverrideOf(back.assets.setupLibrary.overrides, 'oonishi', 'romajiRuleId'), undefined);
});

test('promoteToGlobalCommand: 配列の値を全体へ移し、配列の上書きは消す。元に戻す1回で両方戻る', () => {
  const written = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setLayoutCommand('qwerty', 'windowSize', 5, 3));
  const promoted = applyCommand(written.assets, written.history, promoteToGlobalCommand('qwerty', 'windowSize', 3));
  assert.equal(promoted.outcome.kind, 'applied');
  assert.equal(globalOverrideOf(promoted.assets.setupLibrary.overrides, 'windowSize'), 5);
  assert.equal(layoutOverrideOf(promoted.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), undefined);
  const undone = undo(promoted.assets, promoted.history);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'windowSize'), undefined);
  assert.equal(layoutOverrideOf(undone.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), 5);
});

test('promoteToGlobalCommand: 全体の既定と同じ値なら全体の上書きは持たない。配列の上書きが無ければ何もしない', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [setGlobalCommand('windowSize', 5, 3), setLayoutCommand('qwerty', 'windowSize', 3, 5)]) {
    const step = applyCommand(assets, history, command);
    assets = step.assets;
    history = step.history;
  }
  const promoted = applyCommand(assets, history, promoteToGlobalCommand('qwerty', 'windowSize', 3));
  assert.equal(globalOverrideOf(promoted.assets.setupLibrary.overrides, 'windowSize'), undefined);
  assert.equal(layoutOverrideOf(promoted.assets.setupLibrary.overrides, 'qwerty', 'windowSize'), undefined);
  const nothing = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), promoteToGlobalCommand('qwerty', 'windowSize', 3));
  assert.equal(nothing.outcome.kind, 'no-op');
});

test('すべて既定値に戻す: 全体と今の配列の上書きを1コマンドで消し、他の配列の上書きは残す。元に戻す1回で全部戻る', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [
    setGlobalCommand('windowSize', 5, 3),
    setLayoutCommand('qwerty', 'sfbHomeCost', false, true),
    setLayoutCommand('dvorak', 'sfbHomeCost', false, true),
  ]) {
    const step = applyCommand(assets, history, command);
    assets = step.assets;
    history = step.history;
  }
  const overrides = assets.setupLibrary.overrides;
  const globalIds = resettableGlobalIds(overrides);
  const layoutIds = resettableLayoutIds(overrides, 'qwerty');
  assert.deepEqual(globalIds, ['windowSize']);
  assert.deepEqual(layoutIds, ['sfbHomeCost']);
  const before = history.undoStack.length;
  const reset = applyCommand(assets, history, resetAllCommand(globalIds, { layoutId: 'qwerty', ids: layoutIds }));
  assert.equal(reset.history.undoStack.length, before + 1);
  assert.equal(globalOverrideOf(reset.assets.setupLibrary.overrides, 'windowSize'), undefined);
  assert.equal(layoutOverrideOf(reset.assets.setupLibrary.overrides, 'qwerty', 'sfbHomeCost'), undefined);
  assert.equal(layoutOverrideOf(reset.assets.setupLibrary.overrides, 'dvorak', 'sfbHomeCost'), false);
  const undone = undo(reset.assets, reset.history);
  assert.equal(globalOverrideOf(undone.assets.setupLibrary.overrides, 'windowSize'), 5);
  assert.equal(layoutOverrideOf(undone.assets.setupLibrary.overrides, 'qwerty', 'sfbHomeCost'), false);
});

test('resettableLayoutIds: 配列の上書きだけがある時も戻せる項目に数える。行を出さない項目は数えない', () => {
  const step = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setLayoutCommand('qwerty', 'windowSize', 5, 3));
  assert.deepEqual(resettableLayoutIds(step.assets.setupLibrary.overrides, 'qwerty'), ['windowSize']);
  assert.deepEqual(resettableLayoutIds(step.assets.setupLibrary.overrides, 'qwerty', ['windowSize']), []);
  assert.deepEqual(resettableLayoutIds(step.assets.setupLibrary.overrides, 'dvorak'), []);
});

// ---------------------------------------------------------------------------
// 既定の物理配列を配列のレベルで上書きする（#655 Phase 2b）
// ---------------------------------------------------------------------------

const SHAPE_NAMES = {
  shapes: new Map([
    ['row-staggered', { name: 'ロウスタッガード' }],
    ['ortholinear', { name: 'オーソリニア' }],
  ]),
  layouts: new Map([
    ['naginata-v18', { name: '薙刀式' }],
    ['oonishi', { name: '大西配列' }],
  ]),
};

test('既定の物理配列: 配列のレベルへ書け、全体と同じ値へ戻すと上書きを消す。undoで戻る', () => {
  assert.equal(canEditAtLayout('defaultShapeId'), true);
  const step = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'ortholinear', 'row-staggered'),
  );
  assert.equal(layoutOverrideOf(step.assets.setupLibrary.overrides, 'naginata-v18', 'defaultShapeId'), 'ortholinear');
  assert.equal(globalOverrideOf(step.assets.setupLibrary.overrides, 'defaultShapeId'), undefined, '全体へは書かない');
  const back = applyCommand(
    step.assets,
    step.history,
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'row-staggered', 'row-staggered'),
  );
  assert.equal(layoutOverrideOf(back.assets.setupLibrary.overrides, 'naginata-v18', 'defaultShapeId'), undefined);
  const undone = undo(step.assets, step.history);
  assert.equal(layoutOverrideOf(undone.assets.setupLibrary.overrides, 'naginata-v18', 'defaultShapeId'), undefined);
});

test('文脈バーのチップの命令: 配列のレベルの値があっても、全体のレベルへ書く（配列の値は変えない）', () => {
  const own = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'ortholinear', 'row-staggered'),
  );
  const chip = applyCommand(own.assets, own.history, defaultShapeCommand('column-staggered'));
  assert.equal(globalOverrideOf(chip.assets.setupLibrary.overrides, 'defaultShapeId'), 'column-staggered');
  assert.equal(layoutOverrideOf(chip.assets.setupLibrary.overrides, 'naginata-v18', 'defaultShapeId'), 'ortholinear');
});

test('すべて既定値に戻す: 今の配列の既定の物理配列の上書きも消す', () => {
  const own = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'ortholinear', 'row-staggered'),
  );
  const overrides = own.assets.setupLibrary.overrides;
  assert.deepEqual(resettableLayoutIds(overrides, 'naginata-v18'), ['defaultShapeId']);
  const reset = applyCommand(own.assets, own.history, resetAllCommand([], { layoutId: 'naginata-v18', ids: ['defaultShapeId'] }));
  assert.equal(layoutOverrideOf(reset.assets.setupLibrary.overrides, 'naginata-v18', 'defaultShapeId'), undefined);
});

test('既定の物理配列: 配列の上書きがある行は、全体を変えても変わらない理由をモーダルの行に出す', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'naginata-v18' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const layout = LAYOUTS_JA.find((candidate) => candidate.id === 'naginata-v18')!;
  const context: CascadeContext = {
    targetKind: 'layout',
    shapeId: 'ortholinear',
    shape: PHYSICAL_SHAPES.ortholinear,
    inputMethod: 'kana-direct',
    layoutId: layout.id,
    layout,
  };
  const rows = traceConditionSummary(resolveSettings(written.overrides, context), SHAPE_NAMES);
  const notices = overrideWinsNotices(rows, SHAPE_NAMES);
  assert.match(notices.get('defaultShapeId')!, /^配列「薙刀式」の値が優先されるため/);
});

test('defaultShapeChipNotice: 配列の上書きがある配列を、全体を変えても変わらないと伝える', () => {
  const own = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'ortholinear', 'row-staggered'),
  );
  const overrides = own.assets.setupLibrary.overrides;
  assert.equal(
    defaultShapeChipNotice(overrides, ['naginata-v18'], SHAPE_NAMES),
    '配列「薙刀式」は物理配列を別に決めているため、ここで変えても変わらない',
  );
  assert.equal(defaultShapeChipNotice(overrides, ['oonishi'], SHAPE_NAMES), undefined, '別の配列だけを出している画面では出さない');
  assert.equal(defaultShapeChipNotice(overrides, [], SHAPE_NAMES), undefined);
  assert.equal(
    defaultShapeChipNotice(overrides, ['naginata-v18', 'oonishi', 'naginata-v18'], SHAPE_NAMES),
    '配列「薙刀式」は物理配列を別に決めているため、ここで変えても変わらない',
    '同じ配列は1度だけ',
  );
});

test('defaultShapeChipNotice: 配列の推奨があれば推奨の物理配列を伝える。配列の上書きは推奨に勝つので上書きの文だけを出す', () => {
  const recommend = (layoutId: string) => (layoutId === 'naginata-v18' || layoutId === 'oonishi' ? 'ortholinear' : undefined);
  const empty = emptyAssets().setupLibrary.overrides;
  assert.equal(
    defaultShapeChipNotice(empty, ['naginata-v18'], SHAPE_NAMES, recommend),
    '配列「薙刀式」は推奨の物理配列（オーソリニア）を使うため、ここで変えても変わらない',
  );
  const own = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    setLayoutCommand('naginata-v18', 'defaultShapeId', 'row-staggered', 'ortholinear'),
  );
  assert.equal(
    defaultShapeChipNotice(own.assets.setupLibrary.overrides, ['naginata-v18', 'oonishi'], SHAPE_NAMES, recommend),
    '配列「薙刀式」は物理配列を別に決めているため、ここで変えても変わらない。配列「大西配列」は推奨の物理配列（オーソリニア）を使うため、ここで変えても変わらない',
  );
});

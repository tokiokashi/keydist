import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, emptyCommandHistory, redo, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides, levelOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import {
  promoteCascadeOverrideCommand,
  resetCascadeItemCommand,
  resetCascadeItemsAtLevelsCommand,
  setCascadeOverrideCommand,
  type KeydistAssets,
} from './commands.ts';
import { applyPresetCommand, savePresetCommand } from './preset-commands.ts';
import { resolveEngineInput } from './resolved-input.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  SETTINGS_ITEMS,
  resolveDefaultShapeId,
  resolveGlobalDefaultShapeId,
  resolveWorkspaceDefaultShapeId,
  withWorkspaceConditions,
  type SettingsValueMap,
} from './settings-items.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import {
  createWorkspace,
  duplicateWorkspace,
  findWorkspace,
  initialWorkspaceLibrary,
  withWorkspaceConditionOverrides,
} from './workspace.ts';

const WORKSPACE = { kind: 'workspace' } as const;
const GLOBAL = { kind: 'global' } as const;

function assetsWithWorkspaces(...ids: string[]): KeydistAssets {
  let library = initialWorkspaceLibrary();
  for (const id of ids) library = createWorkspace(library, () => id, id).library;
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides: emptyCascadeOverrides() };
  return {
    setupLibrary,
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: library,
    presetLibrary: { presets: [] },
  };
}

test('各項目の置けるレベル: 全体に置ける項目は基本的にWorkspaceにも置ける。再生の表示条件だけは全体だけ', () => {
  const global = Object.entries(SETTINGS_ITEMS).filter(([, item]) => item.allowedLevels.has('global')).map(([id]) => id);
  const workspace = Object.entries(SETTINGS_ITEMS).filter(([, item]) => item.allowedLevels.has('workspace')).map(([id]) => id);
  assert.deepEqual(
    global.filter((id) => !workspace.includes(id)).sort(),
    ['playbackRateAverage', 'playbackRateHalfLifeSeconds', 'playbackRateWindow'],
  );
  // 解釈（chain・arpeggio）はWorkspaceのレベルまで広げる。配列・Setupには置かない
  for (const id of ['chainInterpretation', 'arpeggioInterpretation'] as const) {
    assert.deepEqual([...SETTINGS_ITEMS[id].allowedLevels].sort(), ['global', 'workspace']);
  }
});

test('Workspaceのレベルへの書き込み: Workspaceの資産に入り、全体の保存先（setupLibrary）には入らない。undo/redoで往復する', () => {
  const start = assetsWithWorkspaces('w1');
  const step = applyCommand(start, emptyCommandHistory<KeydistAssets>(), setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(findWorkspace(step.assets.workspaces, 'w1')?.conditions, { windowSize: 5 });
  // 全体の保存先は触らない（同じ参照のまま）
  assert.equal(step.assets.setupLibrary, start.setupLibrary);
  assert.deepEqual(step.assets.setupLibrary.overrides, {});

  const undone = undo(step.assets, step.history);
  assert.equal(findWorkspace(undone.assets.workspaces, 'w1')?.conditions, undefined);
  const redone = redo(undone.assets, undone.history);
  assert.deepEqual(findWorkspace(redone.assets.workspaces, 'w1')?.conditions, { windowSize: 5 });
});

test('Workspaceのレベルへの書き込みは、他のWorkspaceに入らない。同じ値の書き込みと、書く物の無い消去はno-op', () => {
  const start = assetsWithWorkspaces('w1', 'w2');
  const step = applyCommand(start, emptyCommandHistory<KeydistAssets>(), setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'));
  assert.equal(findWorkspace(step.assets.workspaces, 'w2')?.conditions, undefined);
  const same = applyCommand(step.assets, step.history, setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'));
  assert.equal(same.outcome.kind, 'no-op');
  assert.equal(same.history.undoStack.length, 1);
  const nothing = applyCommand(start, emptyCommandHistory<KeydistAssets>(), resetCascadeItemCommand(WORKSPACE, 'windowSize', 'w1'));
  assert.equal(nothing.outcome.kind, 'no-op');
});

test('Workspaceのレベルを消すと、Workspaceの条件のキーごと無くなる（空の条件を残さない）', () => {
  const written = applyCommand(assetsWithWorkspaces('w1'), emptyCommandHistory<KeydistAssets>(), setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'));
  const reset = applyCommand(written.assets, written.history, resetCascadeItemCommand(WORKSPACE, 'windowSize', 'w1'));
  assert.equal(reset.outcome.kind, 'applied');
  const workspace = findWorkspace(reset.assets.workspaces, 'w1')!;
  assert.equal('conditions' in workspace, false);
});

test('単体ページはWorkspaceのレベルを持たない: Workspaceを指さない書き込み・無いWorkspaceへの書き込みは書かずに拒否する', () => {
  const start = assetsWithWorkspaces('w1');
  const history = emptyCommandHistory<KeydistAssets>();
  const standalone = applyCommand(start, history, setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5));
  assert.equal(standalone.outcome.kind, 'rejected');
  assert.equal(standalone.assets, start);
  const missing = applyCommand(start, history, setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'nope'));
  assert.equal(missing.outcome.kind, 'rejected');
  assert.equal(missing.assets, start);
  // Workspaceに置けない項目（再生の表示条件）は拒否する
  const disallowed = applyCommand(start, history, setCascadeOverrideCommand(WORKSPACE, 'playbackRateWindow', 5, 'w1'));
  assert.equal(disallowed.outcome.kind, 'rejected');
});

test('Workspaceのレベルを全体へ移す（昇格）: 全体へ書いてWorkspaceの値を消す。1コマンドで、undo1回で両方戻る', () => {
  const written = applyCommand(assetsWithWorkspaces('w1'), emptyCommandHistory<KeydistAssets>(), setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'));
  const promoted = applyCommand(written.assets, written.history, promoteCascadeOverrideCommand(WORKSPACE, GLOBAL, 'windowSize', 3, 'w1'));
  assert.equal(promoted.outcome.kind, 'applied');
  assert.equal(promoted.assets.setupLibrary.overrides.global?.windowSize, 5);
  assert.equal(findWorkspace(promoted.assets.workspaces, 'w1')?.conditions, undefined);
  assert.equal(promoted.history.undoStack.length, 2);

  const undone = undo(promoted.assets, promoted.history);
  assert.equal(undone.assets.setupLibrary.overrides.global, undefined);
  assert.deepEqual(findWorkspace(undone.assets.workspaces, 'w1')?.conditions, { windowSize: 5 });

  // 全体の既定値と同じ値を移す時は、全体には書かない
  const same = applyCommand(written.assets, written.history, promoteCascadeOverrideCommand(WORKSPACE, GLOBAL, 'windowSize', 5, 'w1'));
  assert.equal(same.assets.setupLibrary.overrides.global, undefined);
  assert.equal(findWorkspace(same.assets.workspaces, 'w1')?.conditions, undefined);
});

test('複数のレベルをまとめて消す: Workspaceと配列の上書きを1コマンドで消し、全体は残す', () => {
  let assets = assetsWithWorkspaces('w1');
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [
    setCascadeOverrideCommand(GLOBAL, 'windowSize', 7),
    setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'),
    setCascadeOverrideCommand({ kind: 'layout', layoutId: 'qwerty' }, 'windowSize', 2),
  ]) {
    const step = applyCommand(assets, history, command);
    assets = step.assets;
    history = step.history;
  }
  const reset = applyCommand(assets, history, resetCascadeItemsAtLevelsCommand([
    { level: WORKSPACE, itemIds: ['windowSize'] },
    { level: { kind: 'layout', layoutId: 'qwerty' }, itemIds: ['windowSize'] },
  ], 'w1'));
  assert.equal(reset.outcome.kind, 'applied');
  assert.equal(reset.assets.setupLibrary.overrides.global?.windowSize, 7);
  assert.equal(reset.assets.setupLibrary.overrides.layout, undefined);
  assert.equal(findWorkspace(reset.assets.workspaces, 'w1')?.conditions, undefined);
  const undone = undo(reset.assets, reset.history);
  assert.deepEqual(findWorkspace(undone.assets.workspaces, 'w1')?.conditions, { windowSize: 5 });
  assert.equal(undone.assets.setupLibrary.overrides.layout?.qwerty?.windowSize, 2);
});

test('プリセット: Workspaceのレベルへ保存・流し込みでき、全体の値には触らない', () => {
  let assets = assetsWithWorkspaces('w1');
  let history = emptyCommandHistory<KeydistAssets>();
  for (const command of [
    setCascadeOverrideCommand(GLOBAL, 'sfbHomeCost', false),
    setCascadeOverrideCommand(WORKSPACE, 'windowSize', 5, 'w1'),
    savePresetCommand('Workspace用', WORKSPACE, () => 'p1', 'w1'),
  ]) {
    const step = applyCommand(assets, history, command);
    assert.notEqual(step.outcome.kind, 'rejected');
    assets = step.assets;
    history = step.history;
  }
  // 保存するのは画面で見ている値（全体にWorkspaceを重ねた値）
  assert.deepEqual(assets.presetLibrary.presets[0]?.values, { sfbHomeCost: false, windowSize: 5 });
  // 別のWorkspaceへ流し込むと、そのWorkspaceにだけ入る
  const withSecond = { ...assets, workspaces: createWorkspace(assets.workspaces, () => 'w2', 'w2').library };
  const applied = applyCommand(withSecond, history, applyPresetCommand('p1', WORKSPACE, 'w2'));
  assert.deepEqual(findWorkspace(applied.assets.workspaces, 'w2')?.conditions, { windowSize: 5 });
  assert.equal(applied.assets.setupLibrary.overrides.global?.windowSize, undefined);
  assert.equal(applied.assets.setupLibrary.overrides.global?.sfbHomeCost, false);
});

test('プリセット: 全体N=7でWorkspaceに値が無い画面の保存は、全体の値を保存する', () => {
  let assets = assetsWithWorkspaces('w1');
  const history = emptyCommandHistory<KeydistAssets>();
  const withGlobal = applyCommand(assets, history, setCascadeOverrideCommand(GLOBAL, 'windowSize', 7));
  assets = withGlobal.assets;
  const saved = applyCommand(assets, withGlobal.history, savePresetCommand('全体7', WORKSPACE, () => 'p1', 'w1'));
  assert.deepEqual(saved.assets.presetLibrary.presets[0]?.values, { windowSize: 7 });
});

test('プリセット: 全体の既定で保存した値を、全体N=7のWorkspaceへ流し込むと、既定値をWorkspaceへ明示的に書く', () => {
  let assets = assetsWithWorkspaces('w1');
  const history = emptyCommandHistory<KeydistAssets>();
  const withGlobal = applyCommand(assets, history, setCascadeOverrideCommand(GLOBAL, 'windowSize', 7));
  assets = {
    ...withGlobal.assets,
    presetLibrary: { presets: [
      { id: 'def', name: '既定', values: {} },
      { id: 'n3', name: 'N=3', values: { windowSize: 3 } },
      { id: 'n7', name: 'N=7', values: { windowSize: 7 } },
    ] },
  };
  for (const id of ['def', 'n3']) {
    const applied = applyCommand(assets, withGlobal.history, applyPresetCommand(id, WORKSPACE, 'w1'));
    assert.equal(applied.outcome.kind, 'applied', id);
    assert.deepEqual(findWorkspace(applied.assets.workspaces, 'w1')?.conditions, { windowSize: 3 }, id);
    assert.equal(applied.assets.setupLibrary.overrides.global?.windowSize, 7, id);
  }
  // 全体と同じ値は上書きを残さない
  const same = applyCommand(assets, withGlobal.history, applyPresetCommand('n7', WORKSPACE, 'w1'));
  assert.equal(same.outcome.kind, 'no-op');
});

test('Workspaceの資産: 条件は複製で写り、空は消え、codecで往復する。壊れた項目は捨てて全体のままにする', () => {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1', 'a').library;
  library = withWorkspaceConditionOverrides(library, 'w1', { windowSize: 5, defaultShapeId: 'ortholinear' });
  assert.equal(withWorkspaceConditionOverrides(library, 'w1', library[0]!.conditions), library);
  const copied = duplicateWorkspace(library, 'w1', 'w2');
  assert.deepEqual(copied[1]?.conditions, { windowSize: 5, defaultShapeId: 'ortholinear' });
  assert.equal('conditions' in withWorkspaceConditionOverrides(library, 'w1', {})[0]!, false);

  const encoded: unknown = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(copied)));
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(encoded);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.diagnostics, []);
  assert.deepEqual(decoded.value, copied);

  const broken = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [{ id: 'w', name: 'x', groups: [{ id: 'link-1', target: {} }], conditions: { windowSize: 'many', sfbHomeCost: false, unknownItem: 1 } }],
  });
  assert.ok(broken.ok);
  assert.deepEqual(broken.value[0]?.conditions, { sfbHomeCost: false });
  assert.equal(broken.diagnostics.length, 2);
  const none = WORKSPACE_LIBRARY_CODEC.decode({ version: 3, workspaces: [{ id: 'w', name: 'x', groups: [{ id: 'link-1', target: {} }], conditions: {} }] });
  assert.ok(none.ok);
  assert.equal('conditions' in none.value[0]!, false);
});

test('Workspaceの条件の差し込み: 条件が無ければ同じ参照。全体の上書きは変えない', () => {
  const overrides = { global: { windowSize: 7 } };
  assert.equal(withWorkspaceConditions(overrides, undefined), overrides);
  const view = withWorkspaceConditions(overrides, { windowSize: 5 });
  assert.deepEqual(levelOverrides(view, WORKSPACE), { windowSize: 5 });
  assert.deepEqual(levelOverrides(view, GLOBAL), { windowSize: 7 });
  assert.equal(overrides.global.windowSize, 7);
});

test('既定の物理配列: 配列の上書き ＞ Workspaceの値 ＞ 全体の値 ＞ 既定の順。単体ページ（差し込まない）は全体の値だけ', () => {
  const global = { global: { defaultShapeId: 'column-staggered' } };
  assert.equal(resolveDefaultShapeId(global, 'qwerty'), 'column-staggered');
  const view = withWorkspaceConditions(global, { defaultShapeId: 'ortholinear' });
  assert.equal(resolveDefaultShapeId(view, 'qwerty'), 'ortholinear');
  assert.equal(resolveWorkspaceDefaultShapeId(view), 'ortholinear');
  assert.equal(resolveGlobalDefaultShapeId(view), 'column-staggered');
  const layout = withLevelOverridesForTest(view, 'qwerty', 'row-staggered');
  assert.equal(resolveDefaultShapeId(layout, 'qwerty'), 'row-staggered');
  assert.equal(resolveDefaultShapeId(layout, 'dvorak'), 'ortholinear');
  assert.equal(resolveDefaultShapeId(EMPTY_SETTINGS_OVERRIDES, 'qwerty'), 'row-staggered');
});

function withLevelOverridesForTest(overrides: ReturnType<typeof withWorkspaceConditions>, layoutId: string, shapeId: string) {
  return { ...overrides, layout: { [layoutId]: { defaultShapeId: shapeId } } };
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolveTotalInput(layoutId: string, overrides: ReturnType<typeof withWorkspaceConditions>) {
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
  return result.input;
}

test('解決: Workspaceのレベルが対象の解決・Trace生成の入力（N・物理配列・解釈）に同じ順で入る。値が無ければ全体だけの時と同じ', () => {
  const plain = resolveTotalInput('qwerty', EMPTY_SETTINGS_OVERRIDES);
  const noValue = resolveTotalInput('qwerty', withWorkspaceConditions(EMPTY_SETTINGS_OVERRIDES, undefined));
  assert.deepEqual(noValue.tracePolicy, plain.tracePolicy);
  assert.equal(noValue.geometry.name, plain.geometry.name);

  const view = withWorkspaceConditions({ global: { windowSize: 7 } }, {
    windowSize: 5,
    defaultShapeId: 'ortholinear',
    chainInterpretation: { breakOnSameFinger: false, breakOnTriggerOnly: true, breakOnThumbOnly: true, breakOnOppositeHandSimultaneous: true },
  });
  const input = resolveTotalInput('qwerty', view);
  assert.equal(input.tracePolicy.windowSize, 5);
  assert.equal(input.geometry.name, PHYSICAL_SHAPES.ortholinear.name);
  assert.equal(input.chainInterpretation.breakOnSameFinger, false);
  assert.deepEqual(input.cascade.windowSize.origin, { kind: 'workspace' });
  // 配列のレベルの値はWorkspaceの値に勝つ
  const layout = resolveTotalInput('qwerty', { ...view, layout: { qwerty: { windowSize: 2 } } });
  assert.equal(layout.tracePolicy.windowSize, 2);
  // 同じ全体の値でも、Workspaceの値を差し込まない解決（単体ページ）は全体の値のまま
  const standalone = resolveTotalInput('qwerty', { global: { windowSize: 7 } });
  assert.equal(standalone.tracePolicy.windowSize, 7);
  assert.equal(standalone.geometry.name, plain.geometry.name);
});

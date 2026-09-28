import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, emptyCommandHistory, redo, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import {
  createFingerAssignmentCommand,
  createSetupCommand,
  deleteFingerAssignmentCommand,
  deleteSetupCommand,
  duplicateFingerAssignmentCommand,
  duplicateSetupCommand,
  relabelSetupCommand,
  renameFingerAssignmentCommand,
  resetCascadeItemCommand,
  resetCascadeLevelCommand,
  setCascadeOverrideCommand,
  type KeydistAssets,
} from './commands.ts';
import type { SettingsValueMap } from './settings-items.ts';

let nextId = 0;
const generateId = () => `setup-${++nextId}`;
let nextFingerAssignmentId = 0;
const generateFingerAssignmentId = () => `finger-${++nextFingerAssignmentId}`;

function emptyAssets(): KeydistAssets {
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides: emptyCascadeOverrides() };
  return { setupLibrary, fingerAssignments: [] };
}

test('setCascadeOverrideCommand: globalレベルへ書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 5));
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(step.assets.setupLibrary.overrides.global?.windowSize, 5);
  assert.equal(step.history.undoStack.length, 1);

  const undone = undo(step.assets, step.history);
  assert.deepEqual(undone.assets.setupLibrary.overrides, {});

  const redone = redo(undone.assets, undone.history);
  assert.equal(redone.assets.setupLibrary.overrides.global?.windowSize, 5);
});

test('setCascadeOverrideCommand: 既に同じ値が入っているレベルへ同じ値を書いてもno-op（履歴が伸びない）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const first = applyCommand(assets, history, setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 5));
  assert.equal(first.outcome.kind, 'applied');
  assert.equal(first.history.undoStack.length, 1);

  const second = applyCommand(
    first.assets,
    first.history,
    setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 5),
  );
  assert.equal(second.outcome.kind, 'no-op');
  assert.equal(second.history.undoStack.length, 1, '2回目の同じ値の書き込みは履歴に積まれない');
  assert.equal(second.assets, first.assets);
});

test('setCascadeOverrideCommand: 許可されていないレベルへの書き込みはrejectedになり、履歴に積まない', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  // chainInterpretationはglobalのみ許可（settings-items.ts）。layoutへの書き込みは拒否される。
  const step = applyCommand(
    assets,
    history,
    setCascadeOverrideCommand({ kind: 'layout', layoutId: 'qwerty' }, 'chainInterpretation', {
      breakOnSameFinger: true,
      breakOnTriggerOnly: true,
      breakOnThumbOnly: true,
      breakOnOppositeHandSimultaneous: true,
    }),
  );

  assert.equal(step.outcome.kind, 'rejected');
  if (step.outcome.kind === 'rejected') {
    assert.equal((step.outcome.reason as { kind: string }).kind, 'disallowed-level');
  }
  assert.equal(step.assets, assets, '資産は変わらない');
  assert.equal(step.history.undoStack.length, 0);
});

test('resetCascadeItemCommand: 上書きが無い項目のリセットはno-op（履歴に積まない）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, resetCascadeItemCommand({ kind: 'global' }, 'windowSize'));
  assert.equal(step.outcome.kind, 'no-op');
  assert.equal(step.assets, assets);
  assert.equal(step.history, history);
});

test('resetCascadeItemCommand / resetCascadeLevelCommand: 実際に上書きがある場合は消える', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();

  const step1 = applyCommand(assets, history, setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 5));
  assets = step1.assets;
  history = step1.history;
  const step2 = applyCommand(
    assets,
    history,
    setCascadeOverrideCommand({ kind: 'global' }, 'sfbHomeCost', false),
  );
  assets = step2.assets;
  history = step2.history;

  const step3 = applyCommand(assets, history, resetCascadeItemCommand({ kind: 'global' }, 'windowSize'));
  assert.equal(step3.outcome.kind, 'applied');
  assert.equal(step3.assets.setupLibrary.overrides.global?.windowSize, undefined);
  assert.equal(step3.assets.setupLibrary.overrides.global?.sfbHomeCost, false);

  const step4 = applyCommand(step3.assets, step3.history, resetCascadeLevelCommand({ kind: 'global' }));
  assert.equal(step4.outcome.kind, 'applied');
  assert.deepEqual(step4.assets.setupLibrary.overrides, {});
});

test('createSetupCommand: Setupを1件作成する。undoで手持ちが空に戻る', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, createSetupCommand('qwerty', 'row-staggered', generateId, 'メイン'));
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(step.assets.setupLibrary.setups.length, 1);
  assert.equal(step.assets.setupLibrary.setups[0]!.label, 'メイン');

  const undone = undo(step.assets, step.history);
  assert.equal(undone.assets.setupLibrary.setups.length, 0);
});

test('duplicateSetupCommand: 存在しないSetupの複製はno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, duplicateSetupCommand('no-such-id', generateId));
  assert.equal(step.outcome.kind, 'no-op');
  assert.equal(step.assets, assets);
});

test('deleteSetupCommand: Setup削除はSetup本体とそのSetup固有の上書きを同時に消す（原子的な1項目）', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(assets, history, createSetupCommand('qwerty', 'row-staggered', generateId));
  assets = created.assets;
  history = created.history;
  const setupId = assets.setupLibrary.setups[0]!.id;

  const overridden = applyCommand(
    assets,
    history,
    setCascadeOverrideCommand({ kind: 'setup', setupId }, 'windowSize', 4),
  );
  assets = overridden.assets;
  history = overridden.history;
  assert.equal(assets.setupLibrary.overrides.setup?.[setupId]?.windowSize, 4);

  const deleted = applyCommand(assets, history, deleteSetupCommand(setupId));
  assert.equal(deleted.outcome.kind, 'applied');
  assert.equal(deleted.assets.setupLibrary.setups.length, 0);
  assert.equal(deleted.assets.setupLibrary.overrides.setup?.[setupId], undefined);

  // undoで両方（Setup本体とsetupレベルの上書き）が同時に戻る。1つの履歴項目で戻せることを確認する。
  assert.equal(deleted.history.undoStack.length, 3, '作成・上書き・削除の3項目');
  const undone = undo(deleted.assets, deleted.history);
  assert.equal(undone.assets.setupLibrary.setups.length, 1);
  assert.equal(undone.assets.setupLibrary.overrides.setup?.[setupId]?.windowSize, 4);
});

test('deleteSetupCommand: 存在しないidの削除はno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, deleteSetupCommand('no-such-id'));
  assert.equal(step.outcome.kind, 'no-op');
  assert.equal(step.assets, assets);
  assert.equal(step.history, history);
});

test('relabelSetupCommand: 同じラベルへの付け直しはno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(assets, history, createSetupCommand('qwerty', 'row-staggered', generateId, 'メイン'));
  const setupId = created.assets.setupLibrary.setups[0]!.id;

  const relabeledSame = applyCommand(created.assets, created.history, relabelSetupCommand(setupId, 'メイン'));
  assert.equal(relabeledSame.outcome.kind, 'no-op');

  const relabeledDifferent = applyCommand(
    created.assets,
    created.history,
    relabelSetupCommand(setupId, '別名'),
  );
  assert.equal(relabeledDifferent.outcome.kind, 'applied');
  assert.equal(relabeledDifferent.assets.setupLibrary.setups[0]!.label, '別名');
});

test('createFingerAssignmentCommand: 指割り当てを1件作成する。undoで手持ちが空に戻る', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(
    assets,
    history,
    createFingerAssignmentCommand(generateFingerAssignmentId, DEFAULT_FINGER_ASSIGNMENT, 'マイ運指'),
  );
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(step.assets.fingerAssignments.length, 1);
  assert.equal(step.assets.fingerAssignments[0]!.name, 'マイ運指');
  assert.deepEqual(step.assets.fingerAssignments[0]!.keyFinger, DEFAULT_FINGER_ASSIGNMENT.keyFinger);

  const undone = undo(step.assets, step.history);
  assert.equal(undone.assets.fingerAssignments.length, 0);
});

test('duplicateFingerAssignmentCommand: 存在しない指割り当ての複製はno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, duplicateFingerAssignmentCommand('no-such-id', generateFingerAssignmentId));
  assert.equal(step.outcome.kind, 'no-op');
  assert.equal(step.assets, assets);
});

test('duplicateFingerAssignmentCommand: 実在する指割り当てを複製する', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(
    assets,
    history,
    createFingerAssignmentCommand(generateFingerAssignmentId, DEFAULT_FINGER_ASSIGNMENT, '元'),
  );
  const sourceId = created.assets.fingerAssignments[0]!.id;

  const duplicated = applyCommand(
    created.assets,
    created.history,
    duplicateFingerAssignmentCommand(sourceId, generateFingerAssignmentId),
  );
  assert.equal(duplicated.outcome.kind, 'applied');
  assert.equal(duplicated.assets.fingerAssignments.length, 2);
  assert.equal(duplicated.assets.fingerAssignments[1]!.name, '元のコピー');
  assert.notEqual(duplicated.assets.fingerAssignments[1]!.id, sourceId);
});

test('deleteFingerAssignmentCommand: 存在しないidの削除はno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, deleteFingerAssignmentCommand('no-such-id'));
  assert.equal(step.outcome.kind, 'no-op');
  assert.equal(step.assets, assets);
  assert.equal(step.history, history);
});

test('deleteFingerAssignmentCommand: 削除後もそれを参照するカスケードの上書きはそのまま残る（解決側でfallbackする設計）', () => {
  let assets = emptyAssets();
  let history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(
    assets,
    history,
    createFingerAssignmentCommand(generateFingerAssignmentId, DEFAULT_FINGER_ASSIGNMENT),
  );
  assets = created.assets;
  history = created.history;
  const assignmentId = assets.fingerAssignments[0]!.id;

  const overridden = applyCommand(
    assets,
    history,
    setCascadeOverrideCommand({ kind: 'global' }, 'fingerAssignmentId', assignmentId),
  );
  assets = overridden.assets;
  history = overridden.history;

  const deleted = applyCommand(assets, history, deleteFingerAssignmentCommand(assignmentId));
  assert.equal(deleted.outcome.kind, 'applied');
  assert.equal(deleted.assets.fingerAssignments.length, 0);
  // Setupの上書きと違い、削除してもoverrides側の値はそのまま残る（orphan-cleanupしない）。
  assert.equal(deleted.assets.setupLibrary.overrides.global?.fingerAssignmentId, assignmentId);
});

test('renameFingerAssignmentCommand: 同じ名前への変更はno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(
    assets,
    history,
    createFingerAssignmentCommand(generateFingerAssignmentId, DEFAULT_FINGER_ASSIGNMENT, 'マイ運指'),
  );
  const assignmentId = created.assets.fingerAssignments[0]!.id;

  const renamedSame = applyCommand(
    created.assets,
    created.history,
    renameFingerAssignmentCommand(assignmentId, 'マイ運指'),
  );
  assert.equal(renamedSame.outcome.kind, 'no-op');

  const renamedDifferent = applyCommand(
    created.assets,
    created.history,
    renameFingerAssignmentCommand(assignmentId, '別名'),
  );
  assert.equal(renamedDifferent.outcome.kind, 'applied');
  assert.equal(renamedDifferent.assets.fingerAssignments[0]!.name, '別名');
});

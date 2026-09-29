import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, emptyCommandHistory, redo, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { AnalysisTarget, SetupLibrary } from '#input/setup/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { DEFAULT_TEXT_REF, type TextRef } from '#input/text/selection.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import {
  createFingerAssignmentCommand,
  createSetupCommand,
  createTextCommand,
  deleteFingerAssignmentCommand,
  deleteSetupCommand,
  deleteTextCommand,
  duplicateFingerAssignmentCommand,
  duplicateSetupCommand,
  duplicateTextCommand,
  relabelSetupCommand,
  renameFingerAssignmentCommand,
  resetCascadeItemCommand,
  resetCascadeLevelCommand,
  selectTextCommand,
  setCascadeOverrideCommand,
  setMultiBaselineCommand,
  setMultiTargetsCommand,
  setSingleTargetCommand,
  setTargetForSingleAndMultiCommand,
  setStandaloneAnalyzerOptionsCommand,
  setTextContentCommand,
  markTextsSeenCommand,
  setTextLanguageOverrideCommand,
  type KeydistAssets,
} from './commands.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { effectiveMultiBaseline, initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';

let nextId = 0;
const generateId = () => `setup-${++nextId}`;
let nextFingerAssignmentId = 0;
const generateFingerAssignmentId = () => `finger-${++nextFingerAssignmentId}`;

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
    workspaces: [],
  };
}

const TARGET_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };
const TARGET_B: AnalysisTarget = { kind: 'setup', setupId: 'b' };
const TARGET_NOT_SELECTED: AnalysisTarget = { kind: 'setup', setupId: 'not-selected' };

let nextTextId = 0;
const generateTextId = () => `text-${++nextTextId}`;

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

test('createTextCommand: 空のユーザーテキストを作り、そのまま選択する', () => {
  nextTextId = 0;
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const step = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  assert.equal(step.assets.textLibrary.texts.length, 1);
  assert.deepEqual(step.assets.textLibrary.texts[0], { id: 'text-1', name: '新しいテキスト', text: '' });
  assert.deepEqual(step.assets.standaloneTextSelection.ref, { kind: 'user', id: 'text-1' });
});

test('createTextCommand: 自動生成名が重複していれば連番を振る', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const first = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  const second = applyCommand(first.assets, first.history, createTextCommand('standalone', generateTextId));
  assert.equal(second.assets.textLibrary.texts[1]!.name, '新しいテキスト 2');
});

test('duplicateTextCommand: 今の選択（組み込み）を複製し、複製先を選択する', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const step = applyCommand(assets, history, duplicateTextCommand('standalone', generateTextId));
  assert.equal(step.assets.textLibrary.texts.length, 1);
  assert.match(step.assets.textLibrary.texts[0]!.name, /のコピー$/);
  assert.equal(step.assets.standaloneTextSelection.ref.kind, 'user');
});

test('selectTextCommand: ユーザーテキストへ選択を切り替える。存在しないidは何もしない', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const created = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  const targetRef: TextRef = created.assets.standaloneTextSelection.ref;

  const step = applyCommand(created.assets, created.history, selectTextCommand('standalone', targetRef));
  assert.equal(step.outcome.kind, 'no-op', '既に選択中なのでno-op');

  const back = applyCommand(created.assets, created.history, selectTextCommand('standalone', DEFAULT_TEXT_REF));
  assert.equal(back.outcome.kind, 'applied');
  assert.deepEqual(back.assets.standaloneTextSelection.ref, DEFAULT_TEXT_REF);

  const missing = applyCommand(back.assets, back.history, selectTextCommand('standalone', { kind: 'user', id: 'no-such-id' }));
  assert.equal(missing.outcome.kind, 'no-op');
});

test('deleteTextCommand: 選択中のテキストを削除すると既定の組み込みへフォールバックする', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const created = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  assert.equal(created.assets.standaloneTextSelection.ref.kind, 'user');
  const createdId = created.assets.textLibrary.texts[0]!.id;

  const deleted = applyCommand(created.assets, created.history, deleteTextCommand('standalone', createdId));
  assert.equal(deleted.assets.textLibrary.texts.length, 0);
  assert.deepEqual(deleted.assets.standaloneTextSelection.ref, DEFAULT_TEXT_REF);
});

test('setTextContentCommand: 組み込みを書き換えると新しいユーザーテキストになり(copy-on-write)、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, 'hello world', generateTextId));
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(step.assets.textLibrary.texts.length, 1);
  assert.equal(step.assets.textLibrary.texts[0]!.text, 'hello world');
  assert.equal(step.assets.standaloneTextSelection.ref.kind, 'user');
  assert.equal(step.assets.standaloneTextSelection.ref.id, step.assets.textLibrary.texts[0]!.id);

  const back = undo(step.assets, step.history);
  assert.deepEqual(back.assets.textLibrary, assets.textLibrary);
  assert.deepEqual(back.assets.standaloneTextSelection, assets.standaloneTextSelection);

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.textLibrary, step.assets.textLibrary);
});

test('setTextContentCommand: copy-on-write後、新しいユーザーテキストのrefを渡した再編集は同じテキストをその場で編集する（コピーが増えない）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const first = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '1手目', generateTextId));
  const createdRef = first.assets.standaloneTextSelection.ref;
  const second = applyCommand(first.assets, first.history, setTextContentCommand('standalone', createdRef, '2手目', generateTextId));

  assert.equal(second.assets.textLibrary.texts.length, 1, 'コピーは1つのまま');
  assert.equal(second.assets.textLibrary.texts[0]!.text, '2手目');
  assert.equal(second.assets.textLibrary.texts[0]!.id, first.assets.textLibrary.texts[0]!.id);
});

test('setTextContentCommand: 同じテキストならno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const initial = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, 'hello world', generateTextId));
  const createdRef = initial.assets.standaloneTextSelection.ref;
  const step = applyCommand(
    initial.assets,
    initial.history,
    setTextContentCommand('standalone', createdRef, 'hello world', generateTextId),
  );
  assert.equal(step.outcome.kind, 'no-op');
});

test('setTextContentCommand: 選択が既にその組み込みから離れていれば、選択は動かさず内容だけ自作テキストとして残す', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  // 打った時点ではDEFAULT_TEXT_REF（組み込み）が選択されていたが、コマンドが適用される
  // 前に選択が別のユーザーテキストへ切り替わった、という状況を再現する。
  const created = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  const staleWrite = applyCommand(
    created.assets,
    created.history,
    setTextContentCommand('standalone', DEFAULT_TEXT_REF, '宛先を失ったdraft', generateTextId),
  );
  assert.equal(staleWrite.outcome.kind, 'applied');
  assert.deepEqual(staleWrite.assets.textLibrary.texts.map((entry) => entry.text).slice(1), ['宛先を失ったdraft']);
  assert.equal(staleWrite.assets.standaloneTextSelection, created.assets.standaloneTextSelection, '選択は動かさない');
});

/**
 * #544レビューで見つかったクロスタブの競合の再現（unit test版）。タブA・タブBが同じ
 * ユーザーテキスト（u1）を選択中、タブBがu1へ入力した内容のdebounce書き込みが適用される
 * 前に、タブAがu2へ選択を切り替えた変更が（タブ間同期経由で）タブBの資産にも先に届く、
 * という順序を模す。修正前は`setCurrentTextContentCommand`が適用時点の「今の選択」を
 * 読み直していたため、この時点で選択はu2になっており、u1向けのdraftがu2へ書き込まれて
 * いた。`setTextContentCommand`は打鍵時点のref（u1）を明示的に運ぶので、選択が
 * どこにあってもu1だけを書き換える。
 */
test('setTextContentCommand: ユーザーテキストへの書き込みは、適用時点で選択が別のテキストへ移っていても対象のidへ届く（クロスタブ競合の修正）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withU1 = applyCommand(assets, history, createTextCommand('standalone', generateTextId, 'u1'));
  const u1Ref: TextRef = withU1.assets.standaloneTextSelection.ref;
  const withU2 = applyCommand(withU1.assets, withU1.history, createTextCommand('standalone', generateTextId, 'u2'));
  const u2Ref: TextRef = withU2.assets.standaloneTextSelection.ref;
  // タブBはu1を選んで入力を始める（打鍵時点でref=u1をキャプチャする想定）。
  // その後、タブAがu2へ選択を切り替えた変更がタブBの資産へ先に届く（＝ここでは
  // `selectTextCommand`で選択をu2へ進めることで、その順序を模している）。
  const selectedU2 = applyCommand(withU2.assets, withU2.history, selectTextCommand('standalone', u2Ref));
  assert.deepEqual(selectedU2.assets.standaloneTextSelection.ref, u2Ref);

  // タブBのdebounce書き込みが今ここで適用される。選択は既にu2だが、渡すrefはu1のまま。
  const step = applyCommand(
    selectedU2.assets,
    selectedU2.history,
    setTextContentCommand('standalone', u1Ref, 'typed-in-B-for-u1', generateTextId),
  );

  const u1 = step.assets.textLibrary.texts.find((text) => text.id === u1Ref.id)!;
  const u2 = step.assets.textLibrary.texts.find((text) => text.id === u2Ref.id)!;
  assert.equal(u1.text, 'typed-in-B-for-u1', 'u1が書き換わる');
  assert.equal(u2.text, '', 'u2は無関係のまま（バグ修正前はここへB由来の内容が漏れていた）');
  assert.deepEqual(step.assets.standaloneTextSelection.ref, u2Ref, '選択自体はA側の切り替え(u2)のまま変わらない');
});

test('setTextContentCommand: 削除済みのユーザーテキストidへの書き込みは何もしない', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const created = applyCommand(assets, history, createTextCommand('standalone', generateTextId));
  const ref: TextRef = created.assets.standaloneTextSelection.ref;
  const deleted = applyCommand(created.assets, created.history, deleteTextCommand('standalone', ref.id));

  const step = applyCommand(deleted.assets, deleted.history, setTextContentCommand('standalone', ref, '遅れて届いた編集', generateTextId));
  assert.equal(step.outcome.kind, 'no-op');
});

test('setTextContentCommand: 選択が存在しない自作テキストを指して既定の組み込みへ戻っている間の編集は、その組み込みの複製になる', () => {
  const assets: KeydistAssets = {
    ...emptyAssets(),
    standaloneTextSelection: { ref: { kind: 'user', id: 'ghost' } },
  };
  const history = emptyCommandHistory<KeydistAssets>();

  // 画面は解決後の参照（既定の組み込み）を渡してくる
  const step = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '書き換えた本文', generateTextId));
  assert.equal(step.outcome.kind, 'applied');
  assert.equal(step.assets.textLibrary.texts.length, 1);
  assert.equal(step.assets.textLibrary.texts[0]?.text, '書き換えた本文');
  assert.deepEqual(step.assets.standaloneTextSelection.ref, { kind: 'user', id: step.assets.textLibrary.texts[0]?.id });
});

test('setTextLanguageOverrideCommand: 組み込み選択中は言語固定なのでno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const step = applyCommand(assets, history, setTextLanguageOverrideCommand('standalone', 'en'));
  assert.equal(step.outcome.kind, 'no-op');
});

test('setTextLanguageOverrideCommand: ユーザーテキストへ手動上書きを設定でき、本文を変えても上書きは引き継がれる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const created = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, 'hello world', generateTextId));
  const createdRef = created.assets.standaloneTextSelection.ref;
  const overridden = applyCommand(created.assets, created.history, setTextLanguageOverrideCommand('standalone', 'ja'));
  assert.equal(overridden.outcome.kind, 'applied');
  assert.equal(overridden.assets.textLibrary.texts[0]!.languageOverride, 'ja');

  const retyped = applyCommand(
    overridden.assets,
    overridden.history,
    setTextContentCommand('standalone', createdRef, '新しいテキスト', generateTextId),
  );
  // ユーザーテキストの本文をその場で編集する場合、手動上書きはテキストに紐づいたまま残る
  // （組み込みからのcopy-on-writeとは違い、同じユーザーテキストを編集し続けているため）。
  assert.equal(retyped.assets.textLibrary.texts[0]!.languageOverride, 'ja');
});

test('setStandaloneAnalyzerOptionsCommand: 1 Analyzerぶんの設定を書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setStandaloneAnalyzerOptionsCommand('bigram-flow', { source: 'actual' }));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.standaloneAnalyzerOptions, { 'bigram-flow': { source: 'actual' } });
  assert.equal(step.history.undoStack.length, 1);

  const back = undo(step.assets, step.history);
  assert.deepEqual(back.assets.standaloneAnalyzerOptions, {});

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.standaloneAnalyzerOptions, step.assets.standaloneAnalyzerOptions);
});

test('setStandaloneAnalyzerOptionsCommand: 構造的に同じ値の書き込みはno-op（Undo履歴を積まない）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setStandaloneAnalyzerOptionsCommand('bigram-flow', { source: 'actual' }));
  const again = applyCommand(
    step.assets,
    step.history,
    setStandaloneAnalyzerOptionsCommand('bigram-flow', { source: 'actual' }),
  );
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.history.undoStack.length, 1);
  assert.equal(again.assets, step.assets);
});

test('setStandaloneAnalyzerOptionsCommand: 別のAnalyzer idの設定は道連れにしない', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withHeatmap = applyCommand(
    assets,
    history,
    setStandaloneAnalyzerOptionsCommand('heatmap', { colorScale: 'linear' }),
  );
  const withBoth = applyCommand(
    withHeatmap.assets,
    withHeatmap.history,
    setStandaloneAnalyzerOptionsCommand('bigram-flow', { source: 'actual' }),
  );
  assert.deepEqual(withBoth.assets.standaloneAnalyzerOptions, {
    heatmap: { colorScale: 'linear' },
    'bigram-flow': { source: 'actual' },
  });
});

test('setMultiTargetsCommand: 対象の集合・並び順を書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);

  const back = undo(step.assets, step.history);
  assert.deepEqual(back.assets.multiTargetSelection.targets, []);

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);
});

test('setMultiTargetsCommand: 同じ並びの書き込みはno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const again = applyCommand(step.assets, step.history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
});

test('setMultiTargetsCommand: 重複したSetup idは1つに畳む', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B, TARGET_A]));
  assert.deepEqual(step.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);
});

test('setMultiBaselineCommand: 基準の設定・解除を書き込める（選択に含まれるSetupだけ）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const withBaseline = applyCommand(
    withSelection.assets,
    withSelection.history,
    setMultiBaselineCommand(TARGET_A),
  );
  assert.equal(withBaseline.assets.multiTargetSelection.baseline, TARGET_A);

  const cleared = applyCommand(
    withBaseline.assets,
    withBaseline.history,
    setMultiBaselineCommand(undefined),
  );
  assert.equal(cleared.assets.multiTargetSelection.baseline, undefined);
});

test('setMultiBaselineCommand: 選択に含まれないSetupを基準にしようとするとno-op（不変条件）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const attempt = applyCommand(
    withSelection.assets,
    withSelection.history,
    setMultiBaselineCommand(TARGET_NOT_SELECTED),
  );
  assert.equal(attempt.outcome.kind, 'no-op');
});

test('setMultiTargetsCommand: 基準に選んでいたSetupが選択から外れたら、効く基準はなしになる（記録は残る）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const withBaseline = applyCommand(
    withSelection.assets,
    withSelection.history,
    setMultiBaselineCommand(TARGET_A),
  );
  const removed = applyCommand(
    withBaseline.assets,
    withBaseline.history,
    setMultiTargetsCommand([TARGET_B]),
  );
  assert.deepEqual(removed.assets.multiTargetSelection.targets, [TARGET_B]);
  assert.equal(effectiveMultiBaseline(removed.assets.multiTargetSelection), undefined);
  assert.equal(removed.assets.multiTargetSelection.baseline, TARGET_A);
});

test('setSingleTargetCommand: 対象を書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

  const step = applyCommand(assets, history, setSingleTargetCommand(target));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.singleTargetSelection.target, target);

  const back = undo(step.assets, step.history);
  assert.equal(back.assets.singleTargetSelection.target, undefined);

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.singleTargetSelection.target, target);
});

test('setSingleTargetCommand: 同じ対象の書き込みはno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

  const step = applyCommand(assets, history, setSingleTargetCommand(target));
  const again = applyCommand(
    step.assets,
    step.history,
    setSingleTargetCommand({ kind: 'layout', layoutId: 'colemak-dh' }),
  );
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
});

test('setMultiBaselineCommand: Singleが未選択なら同じコマンドでSingleにも基準を書き、Undoで一緒に戻る（#663）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const withBaseline = applyCommand(withSelection.assets, withSelection.history, setMultiBaselineCommand(TARGET_B));
  assert.equal(withBaseline.assets.multiTargetSelection.baseline, TARGET_B);
  assert.equal(withBaseline.assets.singleTargetSelection.target, TARGET_B);

  const back = undo(withBaseline.assets, withBaseline.history);
  assert.equal(back.assets.multiTargetSelection.baseline, undefined);
  assert.equal(back.assets.singleTargetSelection.target, undefined);
});

test('setMultiBaselineCommand: Singleに値が入った後は、基準を変えてもSingleは変わらない（連動させない）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const filled = applyCommand(withSelection.assets, withSelection.history, setMultiBaselineCommand(TARGET_A));
  const changed = applyCommand(filled.assets, filled.history, setMultiBaselineCommand(TARGET_B));
  assert.equal(changed.assets.multiTargetSelection.baseline, TARGET_B);
  assert.equal(changed.assets.singleTargetSelection.target, TARGET_A);

  const chosen = applyCommand(withSelection.assets, withSelection.history, setSingleTargetCommand(TARGET_NOT_SELECTED));
  const afterChosen = applyCommand(chosen.assets, chosen.history, setMultiBaselineCommand(TARGET_A));
  assert.equal(afterChosen.assets.singleTargetSelection.target, TARGET_NOT_SELECTED);
});

test('setMultiBaselineCommand: 基準を外してもSingleには書かない', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const withSelection = applyCommand(assets, history, setMultiTargetsCommand([TARGET_A]));
  const withBaseline = applyCommand(withSelection.assets, withSelection.history, setMultiBaselineCommand(TARGET_A));
  const back = undo(withBaseline.assets, withBaseline.history);
  const cleared = applyCommand(back.assets, back.history, setMultiBaselineCommand(undefined));
  assert.equal(cleared.outcome.kind, 'no-op');
  assert.equal(cleared.assets.singleTargetSelection.target, undefined);
});

test('setTextContentCommand: 選ばれないコピーには「新しい」印が付き、選ばれるコピーには付かない（#611）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const selected = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '選ばれる', generateTextId));
  assert.equal(selected.assets.textLibrary.texts[0]!.unseen, undefined);

  // 選択が既に移った後に届いた同じ組み込みへの書き込みは、選ばれないコピーになる
  const stale = applyCommand(selected.assets, selected.history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '遅れて届く', generateTextId));
  const copy = stale.assets.textLibrary.texts[1]!;
  assert.equal(copy.text, '遅れて届く');
  assert.equal(copy.unseen, true);

  // 一覧で見た印の外しと、コピーを選んだ時の外し
  const seen = applyCommand(stale.assets, stale.history, markTextsSeenCommand([copy.id]));
  assert.equal(seen.assets.textLibrary.texts[1]!.unseen, undefined);
  assert.equal(applyCommand(seen.assets, seen.history, markTextsSeenCommand([copy.id])).outcome.kind, 'no-op');
  const opened = applyCommand(stale.assets, stale.history, selectTextCommand('standalone', { kind: 'user', id: copy.id }));
  assert.equal(opened.assets.textLibrary.texts[1]!.unseen, undefined);
  assert.equal(opened.assets.standaloneTextSelection.ref.id, copy.id);
});

test('markTextsSeenCommand: 履歴に積まず、Undoは直前の編集を戻して印は戻さない（#611）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const first = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '選ばれる', generateTextId));
  const stale = applyCommand(first.assets, first.history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '遅れて届く', generateTextId));
  const copy = stale.assets.textLibrary.texts[1]!;
  const firstRef = { kind: 'user', id: first.assets.textLibrary.texts[0]!.id } as const;
  const edited = applyCommand(stale.assets, stale.history, setTextContentCommand('standalone', firstRef, '編集した', generateTextId));
  assert.equal(edited.assets.textLibrary.texts[1]!.unseen, true);

  const seen = applyCommand(edited.assets, edited.history, markTextsSeenCommand([copy.id]));
  assert.equal(seen.outcome.kind, 'applied');
  assert.equal(seen.assets.textLibrary.texts[1]!.unseen, undefined);
  assert.equal(seen.history.undoStack.length, edited.history.undoStack.length, '履歴を増やさない');

  const back = undo(seen.assets, seen.history);
  assert.equal(back.assets.textLibrary.texts[0]!.text, '選ばれる', '直前の編集が戻る');
  assert.equal(back.assets.textLibrary.texts[1]!.unseen, undefined, '印は戻らない');
  assert.equal(back.history.redoStack.length, 1, 'redoを消さない');
  assert.equal(applyCommand(back.assets, back.history, markTextsSeenCommand([copy.id])).history.redoStack.length, 1);
});

test('markTextsSeenCommand: 編集をUndoした後に印を外しても、Redoで印が戻らない（redo側の写しも変換する）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const first = applyCommand(assets, history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '選ばれる', generateTextId));
  const stale = applyCommand(first.assets, first.history, setTextContentCommand('standalone', DEFAULT_TEXT_REF, '遅れて届く', generateTextId));
  const copy = stale.assets.textLibrary.texts[1]!;
  const firstRef = { kind: 'user', id: first.assets.textLibrary.texts[0]!.id } as const;
  const edited = applyCommand(stale.assets, stale.history, setTextContentCommand('standalone', firstRef, '編集した', generateTextId));
  const undone = undo(edited.assets, edited.history);
  assert.equal(undone.assets.textLibrary.texts[1]!.unseen, true);

  const seen = applyCommand(undone.assets, undone.history, markTextsSeenCommand([copy.id]));
  assert.equal(seen.history.redoStack.length, 1, 'redoは残る');
  const redone = redo(seen.assets, seen.history);
  assert.equal(redone.assets.textLibrary.texts[0]!.text, '編集した', '編集がやり直される');
  assert.equal(redone.assets.textLibrary.texts[1]!.unseen, undefined, '印は戻らない');
});

test('setTargetForSingleAndMultiCommand: Singleの対象にし、Multiの組にも加える', () => {
  const start = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setMultiTargetsCommand([TARGET_A]));
  const step = applyCommand(start.assets, start.history, setTargetForSingleAndMultiCommand(TARGET_B));
  assert.equal(step.assets.singleTargetSelection.target, TARGET_B);
  assert.deepEqual(step.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);
});

test('setTargetForSingleAndMultiCommand: Multiにすでにあれば重複させず、並びも動かさない', () => {
  const start = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setMultiTargetsCommand([TARGET_A, TARGET_B]));
  const step = applyCommand(start.assets, start.history, setTargetForSingleAndMultiCommand(TARGET_A));
  assert.equal(step.assets.singleTargetSelection.target, TARGET_A);
  assert.deepEqual(step.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);
});

test('setTargetForSingleAndMultiCommand: Undo 1回でSingleとMultiが一緒に戻り、Redoで再び入る', () => {
  const start = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setMultiTargetsCommand([TARGET_A]));
  const step = applyCommand(start.assets, start.history, setTargetForSingleAndMultiCommand(TARGET_B));
  const back = undo(step.assets, step.history);
  assert.equal(back.assets.singleTargetSelection.target, undefined);
  assert.deepEqual(back.assets.multiTargetSelection.targets, [TARGET_A]);
  const redone = redo(back.assets, back.history);
  assert.equal(redone.assets.singleTargetSelection.target, TARGET_B);
  assert.deepEqual(redone.assets.multiTargetSelection.targets, [TARGET_A, TARGET_B]);
});

test('setTargetForSingleAndMultiCommand: どちらかが揃っていても、足りない方は書く。両方揃っていればno-op', () => {
  const onlyMulti = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), setMultiTargetsCommand([TARGET_A]));
  const filled = applyCommand(onlyMulti.assets, onlyMulti.history, setTargetForSingleAndMultiCommand(TARGET_A));
  assert.equal(filled.assets.singleTargetSelection.target, TARGET_A);
  assert.deepEqual(filled.assets.multiTargetSelection.targets, [TARGET_A]);

  const again = applyCommand(filled.assets, filled.history, setTargetForSingleAndMultiCommand(TARGET_A));
  assert.equal(again.outcome.kind, 'no-op');
});

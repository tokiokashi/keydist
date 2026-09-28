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
  setAnalyzerSetSelectionBaselineCommand,
  setAnalyzerSetSelectionTargetsCommand,
  setAnalyzerTargetSelectionCommand,
  setCascadeOverrideCommand,
  setStandaloneAnalyzerOptionsCommand,
  setTextContentCommand,
  setTextLanguageOverrideCommand,
  type KeydistAssets,
} from './commands.ts';
import type { SettingsValueMap } from './settings-items.ts';

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
    analyzerSetSelections: {},
    analyzerTargetSelections: {},
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

test('setTextContentCommand: 選択が既にその組み込みから離れていれば、遅れて届いた書き込みは何もしない（無意味な2つ目のコピーを作らない）', () => {
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
  assert.equal(staleWrite.outcome.kind, 'no-op');
  assert.equal(created.assets.textLibrary.texts.length, 1, '2つ目のコピーが作られていない');
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

test('setAnalyzerSetSelectionTargetsCommand: 対象の集合・並び順を書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.analyzerSetSelections.comparison?.targets, [TARGET_A, TARGET_B]);

  const back = undo(step.assets, step.history);
  assert.equal(back.assets.analyzerSetSelections.comparison, undefined);

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.analyzerSetSelections.comparison?.targets, [TARGET_A, TARGET_B]);
});

test('setAnalyzerSetSelectionTargetsCommand: 同じ並びの書き込みはno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  const again = applyCommand(step.assets, step.history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
});

test('setAnalyzerSetSelectionTargetsCommand: 重複したSetup idは1つに畳む', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const step = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B, TARGET_A]));
  assert.deepEqual(step.assets.analyzerSetSelections.comparison?.targets, [TARGET_A, TARGET_B]);
});

test('setAnalyzerSetSelectionBaselineCommand: 基準の設定・解除を書き込める（選択に含まれるSetupだけ）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  const withBaseline = applyCommand(
    withSelection.assets,
    withSelection.history,
    setAnalyzerSetSelectionBaselineCommand('comparison', TARGET_A),
  );
  assert.equal(withBaseline.assets.analyzerSetSelections.comparison?.baseline, TARGET_A);

  const cleared = applyCommand(
    withBaseline.assets,
    withBaseline.history,
    setAnalyzerSetSelectionBaselineCommand('comparison', undefined),
  );
  assert.equal(cleared.assets.analyzerSetSelections.comparison?.baseline, undefined);
});

test('setAnalyzerSetSelectionBaselineCommand: 選択に含まれないSetupを基準にしようとするとno-op（不変条件）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  const attempt = applyCommand(
    withSelection.assets,
    withSelection.history,
    setAnalyzerSetSelectionBaselineCommand('comparison', TARGET_NOT_SELECTED),
  );
  assert.equal(attempt.outcome.kind, 'no-op');
});

test('setAnalyzerSetSelectionTargetsCommand: 基準に選んでいたSetupが選択から外れたら、基準も一緒に外れる（不変条件）', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withSelection = applyCommand(assets, history, setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_A, TARGET_B]));
  const withBaseline = applyCommand(
    withSelection.assets,
    withSelection.history,
    setAnalyzerSetSelectionBaselineCommand('comparison', TARGET_A),
  );
  const removed = applyCommand(
    withBaseline.assets,
    withBaseline.history,
    setAnalyzerSetSelectionTargetsCommand('comparison', [TARGET_B]),
  );
  assert.deepEqual(removed.assets.analyzerSetSelections.comparison?.targets, [TARGET_B]);
  assert.equal(removed.assets.analyzerSetSelections.comparison?.baseline, undefined);
});

test('setAnalyzerTargetSelectionCommand: 対象を書き込み、undo/redoで往復できる', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

  const step = applyCommand(assets, history, setAnalyzerTargetSelectionCommand('bigram-flow', target));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.analyzerTargetSelections['bigram-flow'], target);

  const back = undo(step.assets, step.history);
  assert.equal(back.assets.analyzerTargetSelections['bigram-flow'], undefined);

  const redone = redo(back.assets, back.history);
  assert.deepEqual(redone.assets.analyzerTargetSelections['bigram-flow'], target);
});

test('setAnalyzerTargetSelectionCommand: 同じ対象の書き込みはno-op', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

  const step = applyCommand(assets, history, setAnalyzerTargetSelectionCommand('bigram-flow', target));
  const again = applyCommand(
    step.assets,
    step.history,
    setAnalyzerTargetSelectionCommand('bigram-flow', { kind: 'layout', layoutId: 'colemak-dh' }),
  );
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
});

test('setAnalyzerTargetSelectionCommand: Analyzer idごとに独立して書き込める', () => {
  const assets = emptyAssets();
  const history = emptyCommandHistory<KeydistAssets>();

  const withBigramFlow = applyCommand(
    assets,
    history,
    setAnalyzerTargetSelectionCommand('bigram-flow', { kind: 'layout', layoutId: 'colemak-dh' }),
  );
  const withBoth = applyCommand(
    withBigramFlow.assets,
    withBigramFlow.history,
    setAnalyzerTargetSelectionCommand('other-analyzer', TARGET_A),
  );
  assert.deepEqual(withBoth.assets.analyzerTargetSelections['bigram-flow'], { kind: 'layout', layoutId: 'colemak-dh' });
  assert.deepEqual(withBoth.assets.analyzerTargetSelections['other-analyzer'], TARGET_A);
});

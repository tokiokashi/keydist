import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCommand,
  applyExternalChange,
  DEFAULT_MAX_HISTORY_ENTRIES,
  emptyCommandHistory,
  redo,
  undo,
  type Command,
  type CommandHistory,
} from './index.ts';

/** テスト専用の小さな資産の集合。実際の資産型（`SetupLibrary`等）を知らずに仕組みだけを検証する。 */
interface Assets {
  readonly counter: number;
  readonly label: string;
}

const INITIAL: Assets = { counter: 0, label: '初期' };

function increment(by: number): Command<Assets> {
  return (current) => ({ kind: 'applied', label: `${by}増やす`, changes: { counter: current.counter + by } });
}

function noopCommand(): Command<Assets> {
  return () => ({ kind: 'no-op' });
}

function rejectedCommand(reason: unknown): Command<Assets> {
  return () => ({ kind: 'rejected', reason });
}

/** 現在値と同じ値を返す（=参照は違うが内容として変化なし）コマンド。diffChangesの粒度を検証する。 */
function setSameCounter(): Command<Assets> {
  return (current) => ({ kind: 'applied', label: '据え置き', changes: { counter: current.counter } });
}

/** 複数資産に同時に触れるコマンド。1項目として原子的に積まれることを検証する。 */
function renameAndBump(nextLabel: string): Command<Assets> {
  return (current) => ({
    kind: 'applied',
    label: 'ラベルとカウンタを同時に変更',
    changes: { label: nextLabel, counter: current.counter + 1 },
  });
}

test('applyCommand: 通常のコマンドは資産を更新し、履歴に1項目積む', () => {
  const history = emptyCommandHistory<Assets>();
  const result = applyCommand(INITIAL, history, increment(3));

  assert.equal(result.assets.counter, 3);
  assert.equal(result.history.undoStack.length, 1);
  assert.equal(result.history.undoStack[0]!.label, '3増やす');
  assert.deepEqual(result.history.undoStack[0]!.before, { counter: 0 });
  assert.deepEqual(result.history.undoStack[0]!.after, { counter: 3 });
  assert.equal(result.history.redoStack.length, 0);
});

test('applyCommand: 複数資産に触れるコマンドは1項目として原子的に積まれる', () => {
  const history = emptyCommandHistory<Assets>();
  const result = applyCommand(INITIAL, history, renameAndBump('新しいラベル'));

  assert.equal(result.history.undoStack.length, 1);
  const entry = result.history.undoStack[0]!;
  assert.deepEqual(entry.before, { label: '初期', counter: 0 });
  assert.deepEqual(entry.after, { label: '新しいラベル', counter: 1 });

  // undoは2つの資産を同時に、1操作で戻す。
  const undone = undo(result.assets, result.history);
  assert.deepEqual(undone.assets, INITIAL);
  assert.equal(undone.history.undoStack.length, 0);
});

test('undo/redoの往復: 適用→undo→redoで元の値に戻る', () => {
  const history = emptyCommandHistory<Assets>();
  const applied = applyCommand(INITIAL, history, increment(5));

  const undone = undo(applied.assets, applied.history);
  assert.equal(undone.assets.counter, 0);
  assert.equal(undone.history.undoStack.length, 0);
  assert.equal(undone.history.redoStack.length, 1);

  const redone = redo(undone.assets, undone.history);
  assert.equal(redone.assets.counter, 5);
  assert.equal(redone.history.undoStack.length, 1);
  assert.equal(redone.history.redoStack.length, 0);
});

test('新しいコマンドを積むとredo側は捨てられる', () => {
  const history = emptyCommandHistory<Assets>();
  const step1 = applyCommand(INITIAL, history, increment(1));
  const undone = undo(step1.assets, step1.history);
  assert.equal(undone.history.redoStack.length, 1);

  const step2 = applyCommand(undone.assets, undone.history, increment(10));
  assert.equal(step2.assets.counter, 10);
  assert.equal(step2.history.redoStack.length, 0, 'redoは捨てられている');

  const redoAfterNewCommand = redo(step2.assets, step2.history);
  assert.equal(redoAfterNewCommand.outcome.kind, 'no-op');
  assert.equal(redoAfterNewCommand.assets.counter, 10, 'redoできることは何も残っていない');
});

test('履歴の上限: 超えた分は古い方から捨てる', () => {
  let assets = INITIAL;
  let history = emptyCommandHistory<Assets>();
  const maxEntries = 3;

  for (let i = 1; i <= 5; i++) {
    const step = applyCommand(assets, history, increment(1), maxEntries);
    assets = step.assets;
    history = step.history;
  }

  assert.equal(assets.counter, 5);
  assert.equal(history.undoStack.length, maxEntries);
  // 直近3件（3,4,5回目の+1）だけが残る。1,2回目分の記録は消えている。
  assert.equal(history.undoStack[0]!.before.counter, 2);
  assert.equal(history.undoStack[2]!.after.counter, 5);
});

test('DEFAULT_MAX_HISTORY_ENTRIES: 既定の上限は100', () => {
  assert.equal(DEFAULT_MAX_HISTORY_ENTRIES, 100);
});

test('no-opのコマンドは履歴に積まない', () => {
  const history = emptyCommandHistory<Assets>();
  const result = applyCommand(INITIAL, history, noopCommand());

  assert.equal(result.outcome.kind, 'no-op');
  assert.equal(result.assets, INITIAL, '資産の参照も変わらない');
  assert.equal(result.history, history, '履歴の参照も変わらない');
});

test('rejectedのコマンドは履歴に積まず、拒否理由をそのまま返す', () => {
  const history = emptyCommandHistory<Assets>();
  const reason = { kind: 'disallowed-level', message: 'テスト用の拒否理由' };
  const result = applyCommand(INITIAL, history, rejectedCommand(reason));

  assert.equal(result.outcome.kind, 'rejected');
  assert.equal(result.outcome.kind === 'rejected' && result.outcome.reason, reason);
  assert.equal(result.assets, INITIAL);
  assert.equal(result.history, history);
});

test('appliedでも実際には値が変わっていなければ履歴に積まない（同じ値を書き込むコマンド）', () => {
  const history = emptyCommandHistory<Assets>();
  const result = applyCommand(INITIAL, history, setSameCounter());

  assert.equal(result.outcome.kind, 'no-op');
  assert.equal(result.history.undoStack.length, 0);
});

test('applyExternalChange: 該当する資産に触れる履歴項目だけを undo・redo 両側から捨てる', () => {
  let assets = INITIAL;
  let history = emptyCommandHistory<Assets>();

  // counterを2回変更、labelを1回変更。
  const step1 = applyCommand(assets, history, increment(1));
  assets = step1.assets;
  history = step1.history;
  const step2 = applyCommand(assets, history, renameAndBump('ラベルA'));
  assets = step2.assets;
  history = step2.history;

  // 1つundoしてredo側にも項目を作っておく（labelとcounter両方に触れる項目がredo側にある状態）。
  const undone = undo(assets, history);
  assets = undone.assets;
  history = undone.history;
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 1);

  // 他のタブがcounterだけを書き換えたと仮定する。
  const external = applyExternalChange(assets, history, 'counter', 999);

  assert.equal(external.assets.counter, 999);
  assert.equal(external.assets.label, assets.label, '触れていない資産はそのまま');
  // undo側の「1増やす」（counterに触れる）は消える。
  assert.equal(external.history.undoStack.length, 0);
  // redo側の「ラベルとカウンタを同時に変更」（counterにもlabelにも触れる）も消える。
  assert.equal(external.history.redoStack.length, 0);
});

test('applyExternalChange: 触れない資産の履歴項目は残る', () => {
  interface TwoAssets {
    readonly a: number;
    readonly b: number;
  }
  const initial: TwoAssets = { a: 0, b: 0 };
  const bumpA: Command<TwoAssets> = (current) => ({ kind: 'applied', label: 'a', changes: { a: current.a + 1 } });
  const bumpB: Command<TwoAssets> = (current) => ({ kind: 'applied', label: 'b', changes: { b: current.b + 1 } });

  let assets = initial;
  let history: CommandHistory<TwoAssets> = emptyCommandHistory();
  const step1 = applyCommand(assets, history, bumpA);
  assets = step1.assets;
  history = step1.history;
  const step2 = applyCommand(assets, history, bumpB);
  assets = step2.assets;
  history = step2.history;
  assert.equal(history.undoStack.length, 2);

  const external = applyExternalChange(assets, history, 'a', 100);
  assert.equal(external.history.undoStack.length, 1, 'bに触れる項目は残る');
  assert.equal(external.history.undoStack[0]!.label, 'b');
});

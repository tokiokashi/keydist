import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, composeCommands, emptyCommandHistory, undo, type Command } from './index.ts';

interface Assets {
  readonly a: number;
  readonly b: number;
}

const setA = (value: number): Command<Assets> => () => ({ kind: 'applied', label: 'a', changes: { a: value } });
const setB = (value: number): Command<Assets> => () => ({ kind: 'applied', label: 'b', changes: { b: value } });
const addToA = (delta: number): Command<Assets> => (current) => ({ kind: 'applied', label: 'a+', changes: { a: current.a + delta } });

test('composeCommands: 履歴は1項目で、Undo 1回で全部戻る', () => {
  const step = applyCommand({ a: 1, b: 2 }, emptyCommandHistory<Assets>(), composeCommands('まとめ', [setA(10), setB(20)]));
  assert.deepEqual(step.assets, { a: 10, b: 20 });
  assert.equal(step.history.undoStack.length, 1);
  assert.equal(step.history.undoStack[0]!.label, 'まとめ');
  assert.deepEqual(undo(step.assets, step.history).assets, { a: 1, b: 2 });
});

test('composeCommands: 後のコマンドは前の変更を反映した資産を読み、同じキーは後の値が勝つ', () => {
  const step = applyCommand({ a: 1, b: 2 }, emptyCommandHistory<Assets>(), composeCommands('まとめ', [setA(10), addToA(5)]));
  assert.equal(step.assets.a, 15);
  assert.deepEqual(undo(step.assets, step.history).assets, { a: 1, b: 2 });
});

test('composeCommands: no-opとrejectedは飛ばし、appliedが無ければno-op', () => {
  const noop: Command<Assets> = () => ({ kind: 'no-op' });
  const rejected: Command<Assets> = () => ({ kind: 'rejected', reason: 'x' });
  const step = applyCommand({ a: 1, b: 2 }, emptyCommandHistory<Assets>(), composeCommands('まとめ', [noop, setB(3), rejected]));
  assert.deepEqual(step.assets, { a: 1, b: 3 });
  assert.equal(step.history.undoStack.length, 1);
  assert.equal(applyCommand({ a: 1, b: 2 }, emptyCommandHistory<Assets>(), composeCommands('まとめ', [noop, rejected])).outcome.kind, 'no-op');
});

test('composeCommands: quietなコマンドは例外にする', () => {
  const quiet: Command<Assets> = () => ({ kind: 'quiet', label: 'q', transforms: { a: (v) => v + 1 } });
  assert.throws(() => composeCommands('まとめ', [quiet])({ a: 1, b: 2 }));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pressSentenceKey,
  remainingSentenceKeys,
  sentenceRunFinished,
  sentenceUnits,
  sentenceUnmeasurable,
  startSentenceRun,
  type SentenceRun,
  type SentenceStep,
} from './sentence-session.ts';

const step = (keys: string[], inputIndex: number, inputChar = String(inputIndex)): SentenceStep => ({ keys, inputIndex, inputChar });
const keyEvent = (key: string) => ({ key, code: `Key${key.toUpperCase()}` });
const label = (id: string) => id.toUpperCase();

function press(run: SentenceRun, key: string, atMs: number) {
  return pressSentenceKey(run, keyEvent(key), atMs, label);
}

test('正しいキーを順に押すと、ストロークごとの時刻が記録される', () => {
  let run = startSentenceRun([step(['a'], 0), step(['s'], 1), step(['d'], 2)]);
  for (const [key, atMs, kind] of [['a', 100, 'step-finished'], ['s', 250, 'step-finished'], ['d', 400, 'run-finished']] as const) {
    const pressed = press(run, key, atMs);
    assert.equal(pressed.outcome.kind, kind);
    run = pressed.run;
  }
  assert.ok(sentenceRunFinished(run));
  assert.deepEqual(run.taps, [{ atMs: 100, clean: true }, { atMs: 250, clean: true }, { atMs: 400, clean: true }]);
});

test('違うキーを押すと知らされ、そのストロークの間隔は数えない。次のストロークは数える', () => {
  let run = startSentenceRun([step(['a'], 0), step(['s'], 1), step(['d'], 2)]);
  run = press(run, 'a', 100).run;
  const wrong = press(run, 'x', 150);
  assert.deepEqual(wrong.outcome, { kind: 'wrong-key', expectedKey: 's' });
  assert.equal(wrong.run.index, 1);
  run = press(wrong.run, 's', 300).run;
  run = press(run, 'd', 450).run;
  assert.deepEqual(run.taps.map((tap) => tap.clean), [true, false, true]);
  assert.deepEqual(run.taps.map((tap) => tap.atMs), [100, 300, 450]);
});

test('同時に押すキーは順不同で、ストロークの時刻は最初の押下の時刻になる', () => {
  let run = startSentenceRun([step(['a'], 0), step(['s', 'd'], 1)]);
  run = press(run, 'a', 100).run;
  const first = press(run, 'd', 220);
  assert.equal(first.outcome.kind, 'partial');
  assert.deepEqual(remainingSentenceKeys(first.run), ['s']);
  const second = press(first.run, 's', 260);
  assert.equal(second.outcome.kind, 'run-finished');
  assert.deepEqual(second.run.taps[1], { atMs: 220, clean: true });
});

test('同時に押すキーのうち、すでに押したキーをもう一度押すと違うキーとして扱う', () => {
  let run = startSentenceRun([step(['s', 'd'], 0)]);
  run = press(run, 's', 100).run;
  const again = press(run, 's', 120);
  assert.equal(again.outcome.kind, 'wrong-key');
  assert.equal(again.run.clean, false);
});

test('前のストロークの時刻より後でない押下は無視する', () => {
  let run = startSentenceRun([step(['a'], 0), step(['s'], 1)]);
  run = press(run, 'a', 100).run;
  const ignored = press(run, 's', 100);
  assert.equal(ignored.outcome.kind, 'ignored');
  assert.equal(ignored.run, run);
});

test('Space・修飾キー・親指キーなど、取れないキーが要る列は測れない', () => {
  assert.equal(sentenceUnmeasurable([]), 'empty');
  assert.equal(sentenceUnmeasurable([step(['a'], 0), step(['thumb-r'], 1)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['shift-l', 'a'], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['r0c13'], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step([], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['a'], 0), step([';'], 1)]), undefined);
});

test('同じ入力単位を打つステップをまとめて、かな1文字ずつにする', () => {
  const units = sentenceUnits([step(['s'], 0, 'し'), step(['i'], 0, 'し'), step(['a'], 1, 'あ')]);
  assert.deepEqual(units, [{ text: 'し', start: 0, end: 2 }, { text: 'あ', start: 2, end: 3 }]);
});

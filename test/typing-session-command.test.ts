import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '#tester/engine/index.ts';
import {
  applyRecognizedTypingInputs,
  applyTypingTextEdit,
  executeTypingEditCommand,
} from '#tester/typing-session-command.ts';
import { TSUKI_2_263 } from '#input/layouts/tsuki-2-263.ts';

const prefixD = (engine: TypingInputEngine) => {
  engine.handle({ type: 'down', key: 'd' });
  engine.handle({ type: 'up', key: 'd' });
};

test('Backspaceはprefix recognition windowをcancelしてから文字を削除する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);
  prefixD(engine);

  const command = executeTypingEditCommand(engine, 'backspace');
  assert.equal(applyTypingTextEdit('あい', command.textEdit), 'あ');

  const result = engine.handle({ type: 'down', key: 'h' });
  assert.deepEqual(result.recognized.map((entry) => entry.output), ['く']);
});

test('Enterはpendingをflushした後にrecognitionをresetして改行する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);
  prefixD(engine);

  const command = executeTypingEditCommand(engine, 'enter');
  assert.equal(
    applyTypingTextEdit(
      applyRecognizedTypingInputs('あ', command.recognized),
      command.textEdit,
    ),
    'あ\n',
  );

  const result = engine.handle({ type: 'down', key: 'h' });
  assert.deepEqual(result.recognized.map((entry) => entry.output), ['く']);
});


test('recognized composed outputは直前component textを置換する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  const source = engine.handle({ type: 'down', key: 's' }).recognized;
  let text = applyRecognizedTypingInputs('', source);
  assert.equal(text, 'か');
  engine.handle({ type: 'up', key: 's' });

  const composed = engine.handle({ type: 'down', key: 'l' }).recognized;
  text = applyRecognizedTypingInputs(text, composed);
  assert.equal(text, 'が');
});

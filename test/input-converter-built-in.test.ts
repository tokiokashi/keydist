import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { browserKeyboardEventToPhysicalKeyEvent } from '../src/features/input-converter/browser-keyboard-adapter.ts';
import { SHIN_JIS_SIMULTANEOUS } from '../src/layouts/shin-jis.ts';
import { TSUKI_2_263 } from '../src/layouts/tsuki-2-263.ts';

const physical = (
  type: 'keydown' | 'keyup',
  code: string,
) => {
  const event = browserKeyboardEventToPhysicalKeyEvent({ type, code });
  assert.ok(event !== undefined);
  return event;
};

test('built-in月配列をbrowser adapter経由で単打入力できる', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  assert.deepEqual(
    engine.handle(physical('keydown', 'KeyH')).recognized.map((entry) => entry.output),
    ['く'],
  );
  assert.deepEqual(engine.handle(physical('keyup', 'KeyH')).recognized, []);
});

test('built-in月配列をbrowser adapter経由でprefix入力できる', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  assert.deepEqual(engine.handle(physical('keydown', 'KeyD')).recognized, []);
  assert.deepEqual(engine.handle(physical('keyup', 'KeyD')).recognized, []);
  assert.deepEqual(
    engine.handle(physical('keydown', 'KeyH')).recognized.map((entry) => entry.output),
    ['ま'],
  );
});


test('built-in新JIS通常シフトをbrowser adapter経由でhold入力できる', () => {
  const engine = new TypingInputEngine(SHIN_JIS_SIMULTANEOUS.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });

  assert.deepEqual(engine.handle(physical('keydown', 'Space')).recognized, []);
  assert.deepEqual(
    engine.handle(physical('keydown', 'KeyH')).recognized.map((entry) => entry.output),
    ['ま'],
  );
  engine.handle(physical('keyup', 'KeyH'));

  const continued = engine.handle(physical('keydown', 'KeyJ')).recognized;
  assert.deepEqual(continued.map((entry) => entry.output), ['お']);
  assert.deepEqual(
    continued[0].actions.map((action) => action.heldKeys),
    [['thumb-r']],
  );
});


test('shortcut modifier中のkeyupでもpressed stateを解放する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  const down = browserKeyboardEventToPhysicalKeyEvent({ type: 'keydown', code: 'KeyH' });
  assert.ok(down !== undefined);
  const pressed = engine.handle(down);
  assert.deepEqual(pressed.pressedKeys, ['h']);

  const up = browserKeyboardEventToPhysicalKeyEvent({
    type: 'keyup',
    code: 'KeyH',
    ctrlKey: true,
  });
  assert.ok(up !== undefined);
  assert.deepEqual(engine.handle(up).pressedKeys, []);
});

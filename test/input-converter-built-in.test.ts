import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { browserKeyboardEventToPhysicalKeyEvent } from '../src/features/input-converter/browser-keyboard-adapter.ts';
import { KAWASEMI_PLUS } from '../src/layouts/kawasemi-plus.ts';
import { NAGINATA_V18 } from '../src/layouts/naginata.ts';
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


test('薙刀式の未定義roll overlapは左右どちらも単打を落とさない', () => {
  const cases = [
    { keys: ['d', 'f'] as const, outputs: ['と', 'か'] },
    // h+j自体は未定義だが、h+j+w等の3-key候補があるためlongest-match待ちになる。
    { keys: ['h', 'j'] as const, outputs: ['く', 'あ'] },
  ];

  for (const { keys, outputs: expected } of cases) {
    const engine = new TypingInputEngine(NAGINATA_V18.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    });
    const outputs: string[] = [];
    for (const event of [
      { type: 'down', key: keys[0] },
      { type: 'down', key: keys[1] },
      { type: 'up', key: keys[0] },
      { type: 'up', key: keys[1] },
    ] as const) {
      outputs.push(...engine.handle(event).recognized.map((entry) => entry.output));
    }
    assert.deepEqual(outputs, expected, keys.join(' -> '));
  }
});


test('かわせみ配列+の同時押し拡張を実canonical inputで認識する', () => {
  const cases = [
    {
      events: [
        { type: 'down', key: 'd' },
        { type: 'down', key: 's' },
      ] as const,
      output: 'こと',
    },
    {
      events: [
        { type: 'down', key: 'thumb-l' },
        { type: 'down', key: 'v' },
      ] as const,
      output: 'てつ',
    },
    {
      events: [
        { type: 'down', key: 'thumb-r' },
        { type: 'down', key: 'd' },
        { type: 'down', key: 'j' },
      ] as const,
      output: 'そく',
    },
  ];

  for (const testCase of cases) {
    const engine = new TypingInputEngine(KAWASEMI_PLUS.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    });
    const outputs: string[] = [];
    for (const event of testCase.events) {
      outputs.push(...engine.handle(event).recognized.map((entry) => entry.output));
    }
    assert.deepEqual(outputs, [testCase.output], testCase.output);
  }
});


test('月配列のprefix triggerは非対象側の通常1打で消費され後続へ残らない', () => {
  const cases = [
    { trigger: 'k', sameHand: 'h', sameOutput: 'く', opposite: 'f', oppositeBaseOutput: 'と' },
    { trigger: 'd', sameHand: 'f', sameOutput: 'と', opposite: 'h', oppositeBaseOutput: 'く' },
  ] as const;

  for (const testCase of cases) {
    const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);
    engine.handle({ type: 'down', key: testCase.trigger });
    engine.handle({ type: 'up', key: testCase.trigger });
    assert.deepEqual(
      engine.handle({ type: 'down', key: testCase.sameHand }).recognized.map((entry) => entry.output),
      [testCase.sameOutput],
    );
    engine.handle({ type: 'up', key: testCase.sameHand });
    assert.deepEqual(
      engine.handle({ type: 'down', key: testCase.opposite }).recognized.map((entry) => entry.output),
      [testCase.oppositeBaseOutput],
    );
  }
});


test('未定義physical keyは出力せずprefix one-shotを消費する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);
  engine.handle({ type: 'down', key: 'k' });
  engine.handle({ type: 'up', key: 'k' });
  assert.deepEqual(engine.handle({ type: 'down', key: '1' }).recognized, []);
  engine.handle({ type: 'up', key: '1' });
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'f' }).recognized.map((entry) => entry.output),
    ['と'],
  );
});

test('未定義physical keyの境界でも物理保持中のhold triggerは維持する', () => {
  const engine = new TypingInputEngine(SHIN_JIS_SIMULTANEOUS.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });
  engine.handle({ type: 'down', key: 'thumb-r' });
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'h' }).recognized.map((entry) => entry.output),
    ['ま'],
  );
  engine.handle({ type: 'up', key: 'h' });
  assert.deepEqual(engine.handle({ type: 'down', key: 'escape' }).recognized, []);
  engine.handle({ type: 'up', key: 'escape' });
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'j' }).recognized.map((entry) => entry.output),
    ['お'],
  );
});

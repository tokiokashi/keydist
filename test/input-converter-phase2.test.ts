import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { browserKeyboardEventToPhysicalKeyEvent } from '../src/features/input-converter/browser-keyboard-adapter.ts';
import { NAGINATA_V18 } from '../src/layouts/naginata.ts';
import { SHINGETA } from '../src/layouts/shingeta.ts';
import { faceFromEntries, fromFaces, type Face } from '../src/layouts/index.ts';

const browserPhysical = (
  type: 'keydown' | 'keyup',
  code: string,
) => {
  const event = browserKeyboardEventToPhysicalKeyEvent({ type, code });
  assert.ok(event !== undefined);
  return event;
};

const orderedFace = (
  trigger: string[],
  mode: 'prefix' | 'suffix',
  entries: Record<string, string>,
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: 'modifier',
  triggerPersistence: 'single',
});

test('built-in新下駄の2-key chordをbrowser adapter経由で認識する', () => {
  const engine = new TypingInputEngine(SHINGETA.canonicalInputs);

  assert.deepEqual(engine.handle(browserPhysical('keydown', 'KeyK')).recognized, []);
  const result = engine.handle(browserPhysical('keydown', 'KeyW'));

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['ご']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['k', 'w']]);
});

test('built-in薙刀式の3-key chordは単打候補よりlongest matchを優先する', () => {
  const engine = new TypingInputEngine(NAGINATA_V18.canonicalInputs);

  assert.deepEqual(engine.handle(browserPhysical('keydown', 'KeyH')).recognized, []);
  assert.deepEqual(engine.handle(browserPhysical('keydown', 'KeyJ')).recognized, []);
  const result = engine.handle(browserPhysical('keydown', 'KeyW'));

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['ぎゃ']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['h', 'j', 'w']]);
});

test('built-in薙刀式はmulti-key trigger groupを保持して次のtargetへ継続できる', () => {
  const engine = new TypingInputEngine(NAGINATA_V18.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });

  engine.handle(browserPhysical('keydown', 'KeyH'));
  engine.handle(browserPhysical('keydown', 'KeyJ'));
  const first = engine.handle(browserPhysical('keydown', 'KeyW')).recognized[0];

  assert.equal(first.output, 'ぎゃ');
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [
    {
      keys: ['h', 'j', 'w'],
      heldKeys: ['h', 'j'],
      holdPhase: 'start',
    },
  ]);

  engine.handle(browserPhysical('keyup', 'KeyW'));
  const continued = engine.handle(browserPhysical('keydown', 'KeyR')).recognized[0];

  assert.equal(continued.output, 'じゃ');
  assert.deepEqual(continued.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [
    {
      keys: ['r'],
      heldKeys: ['h', 'j'],
      holdPhase: 'continue',
    },
  ]);
});

test('built-in薙刀式のthumb shift alternativeは左右どちらのphysical keyでも成立する', () => {
  for (const thumbCode of ['Space', 'NonConvert']) {
    const engine = new TypingInputEngine(NAGINATA_V18.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    });

    engine.handle(browserPhysical('keydown', thumbCode));
    const result = engine.handle(browserPhysical('keydown', 'KeyF'));

    assert.deepEqual(
      result.recognized.map((entry) => entry.output),
      ['ま'],
      thumbCode,
    );
  }
});

test('suffix orderはtarget release後のtriggerでも成立する', () => {
  const layout = fromFaces('converter-suffix', 'converter-suffix', [
    {
      ...faceFromEntries([], 'simultaneous', { h: 'H' }),
      inputRole: 'layer',
    },
    orderedFace(['d'], 'suffix', { h: 'X' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'h' }).recognized, []);
  assert.deepEqual(engine.handle({ type: 'up', key: 'h' }).recognized, []);
  const result = engine.handle({ type: 'down', key: 'd' });

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['X']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['h'], ['d']]);
});

test('同じphysical pairのprefix / suffix alternativeを押下順で選択できる', () => {
  const layout = fromFaces('converter-order-alternatives', 'converter-order-alternatives', [
    orderedFace(['d'], 'prefix', { h: 'X' }),
    orderedFace(['d'], 'suffix', { h: 'X' }),
  ]);

  const prefix = new TypingInputEngine(layout.canonicalInputs);
  prefix.handle({ type: 'down', key: 'd' });
  prefix.handle({ type: 'up', key: 'd' });
  assert.deepEqual(
    prefix.handle({ type: 'down', key: 'h' }).recognized.map((entry) => entry.output),
    ['X'],
  );

  const suffix = new TypingInputEngine(layout.canonicalInputs);
  suffix.handle({ type: 'down', key: 'h' });
  suffix.handle({ type: 'up', key: 'h' });
  assert.deepEqual(
    suffix.handle({ type: 'down', key: 'd' }).recognized.map((entry) => entry.output),
    ['X'],
  );
});

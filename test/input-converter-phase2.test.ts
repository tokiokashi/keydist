import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { browserKeyboardEventToPhysicalKeyEvent } from '../src/features/input-converter/browser-keyboard-adapter.ts';
import { NAGINATA_V18 } from '../src/layouts/naginata.ts';
import { SHINGETA } from '../src/layouts/shingeta.ts';
import { faceFromEntries, fromFaces, fromKana, type Face } from '../src/layouts/index.ts';
import { TSUKI_2_263 } from '../src/layouts/tsuki-2-263.ts';

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

test('built-in薙刀式のthumb shift alternativeは左右physical identityを保持する', () => {
  for (const { thumbCode, thumbKey } of [
    { thumbCode: 'Space', thumbKey: 'thumb-r' },
    { thumbCode: 'NonConvert', thumbKey: 'thumb-l' },
  ]) {
    const engine = new TypingInputEngine(NAGINATA_V18.canonicalInputs, {
      triggerRealizationPolicy: { useHold: true },
    });

    engine.handle(browserPhysical('keydown', thumbCode));
    const recognized = engine.handle(browserPhysical('keydown', 'KeyF')).recognized[0];

    assert.equal(recognized.output, 'ま', thumbCode);
    assert.deepEqual(recognized.actions.map((action) => ({
      keys: action.keys,
      triggerKeys: action.triggerKeys,
      heldKeys: action.heldKeys,
      holdPhase: action.holdPhase,
    })), [
      {
        keys: [thumbKey, 'f'],
        triggerKeys: [thumbKey],
        heldKeys: [thumbKey],
        holdPhase: 'start',
      },
    ], thumbCode);
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
  const prefixResult = prefix.handle({ type: 'down', key: 'h' }).recognized[0];
  assert.equal(prefixResult.output, 'X');
  assert.deepEqual(
    prefixResult.actions.map((action) => action.keys),
    [['d'], ['h']],
  );

  const suffix = new TypingInputEngine(layout.canonicalInputs);
  suffix.handle({ type: 'down', key: 'h' });
  suffix.handle({ type: 'up', key: 'h' });
  const suffixResult = suffix.handle({ type: 'down', key: 'd' }).recognized[0];
  assert.equal(suffixResult.output, 'X');
  assert.deepEqual(
    suffixResult.actions.map((action) => action.keys),
    [['h'], ['d']],
  );
});


test('multi-step sequenceはintermediate outputがなくても最後まで認識する', () => {
  const layout = fromKana('converter-multi-step', 'converter-multi-step', {
    X: [['f'], ['j']],
  });
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'f' }).recognized, []);
  engine.handle({ type: 'up', key: 'f' });
  const result = engine.handle({ type: 'down', key: 'j' });

  assert.equal(result.recognized[0].output, 'X');
  assert.equal(result.recognized[0].replacePreviousText, undefined);
  assert.deepEqual(
    result.recognized[0].actions.map((action) => action.keys),
    [['f'], ['j']],
  );
});

test('built-in月配列の濁音は清音即時出力を後続markで置換する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  const source = engine.handle(browserPhysical('keydown', 'KeyS')).recognized[0];
  assert.equal(source.output, 'か');
  assert.equal(source.replacePreviousText, undefined);
  engine.handle(browserPhysical('keyup', 'KeyS'));

  const composed = engine.handle(browserPhysical('keydown', 'KeyL')).recognized[0];
  assert.equal(composed.output, 'が');
  assert.equal(composed.replacePreviousText, 'か');
  assert.deepEqual(
    composed.actions.map((action) => action.keys),
    [['s'], ['l']],
  );
});

test('composed prefixと無関係な次入力は通常の即時出力を維持する', () => {
  const engine = new TypingInputEngine(TSUKI_2_263.canonicalInputs);

  assert.equal(
    engine.handle(browserPhysical('keydown', 'KeyS')).recognized[0].output,
    'か',
  );
  engine.handle(browserPhysical('keyup', 'KeyS'));

  const next = engine.handle(browserPhysical('keydown', 'KeyH')).recognized[0];
  assert.equal(next.output, 'く');
  assert.equal(next.replacePreviousText, undefined);
});

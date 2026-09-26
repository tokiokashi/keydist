import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { faceFromEntries, fromFaces, fromKana, type Face, type FaceMode } from '#input/layouts/index.ts';

const face = (
  trigger: readonly string[],
  mode: FaceMode,
  entries: Record<string, string>,
  options: Partial<Pick<Face, 'inputRole' | 'triggerPersistence' | 'layer'>> = {},
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: trigger.length === 0 ? 'layer' : 'modifier',
  ...(trigger.length === 0 ? {} : { triggerPersistence: 'single' as const }),
  ...options,
});

test('Input Converter coreはcanonical simultaneous inputを物理eventから認識する', () => {
  const layout = fromFaces('converter-simultaneous', 'converter-simultaneous', [
    face([], 'simultaneous', { h: 'ほ' }),
    face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'd' }).recognized, []);
  const result = engine.handle({ type: 'down', key: 'h' });

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['へ']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['d', 'h']]);
});

test('拡張候補を持つ単打はkeyupまで保留し単打として確定できる', () => {
  const layout = fromFaces('converter-single', 'converter-single', [
    face([], 'simultaneous', { h: 'ほ' }),
    face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'h' }).recognized, []);
  const result = engine.handle({ type: 'up', key: 'h' });

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['ほ']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['h']]);
});

test('確定済み単打をreleaseする前でも次の単打を取りこぼさない', () => {
  const layout = fromFaces('converter-overlapping-singles', 'converter-overlapping-singles', [
    face([], 'simultaneous', { h: 'A', j: 'B' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(
    engine.handle({ type: 'down', key: 'h' }).recognized.map((entry) => entry.output),
    ['A'],
  );
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'j' }).recognized.map((entry) => entry.output),
    ['B'],
  );
  assert.deepEqual(engine.handle({ type: 'up', key: 'h' }).recognized, []);
  assert.deepEqual(engine.handle({ type: 'up', key: 'j' }).recognized, []);
});

test('成立不能なprefix extensionは単打をpendingにせず後続単打も失わない', () => {
  const layout = fromFaces('converter-prefix-reverse', 'converter-prefix-reverse', [
    face([], 'simultaneous', { h: 'H', d: 'D' }),
    face(['d'], 'prefix', { h: 'X' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(
    engine.handle({ type: 'down', key: 'h' }).recognized.map((entry) => entry.output),
    ['H'],
  );
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'd' }).recognized.map((entry) => entry.output),
    [],
  );
  assert.deepEqual(engine.handle({ type: 'up', key: 'd' }).recognized, []);
  assert.deepEqual(
    engine.flush().recognized.map((entry) => entry.output),
    ['D'],
  );
  assert.deepEqual(engine.handle({ type: 'up', key: 'h' }).recognized, []);
});

test('単打outputを持つprefix triggerはkeyup後も逐次prefixへ延長できる', () => {
  const layout = fromFaces('converter-prefix-trigger-single', 'converter-prefix-trigger-single', [
    face([], 'simultaneous', { d: 'D', h: 'H' }),
    face(['d'], 'prefix', { h: 'X' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'd' }).recognized, []);
  assert.deepEqual(engine.handle({ type: 'up', key: 'd' }).recognized, []);
  assert.deepEqual(
    engine.handle({ type: 'down', key: 'h' }).recognized.map((entry) => entry.output),
    ['X'],
  );
});

test('単打outputを持つprefix triggerは延長しなければflushで単打確定できる', () => {
  const layout = fromFaces('converter-prefix-trigger-flush', 'converter-prefix-trigger-flush', [
    face([], 'simultaneous', { d: 'D', h: 'H' }),
    face(['d'], 'prefix', { h: 'X' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'd' }).recognized, []);
  assert.deepEqual(engine.handle({ type: 'up', key: 'd' }).recognized, []);
  assert.deepEqual(
    engine.flush().recognized.map((entry) => entry.output),
    ['D'],
  );
});

test('prefix Requirementはtrigger release後もpress順を使って認識する', () => {
  const layout = fromFaces('converter-prefix', 'converter-prefix', [
    face([], 'simultaneous', { h: 'ほ' }),
    face(['d'], 'prefix', { h: 'へ' }, { layer: '中指シフト' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'd' }).recognized, []);
  assert.deepEqual(engine.handle({ type: 'up', key: 'd' }).recognized, []);
  const result = engine.handle({ type: 'down', key: 'h' });

  assert.deepEqual(result.recognized.map((entry) => entry.output), ['へ']);
  assert.deepEqual(result.recognized[0].actions.map((action) => action.keys), [['d'], ['h']]);
});

test('Input Converter coreは既存Trigger/Action realizationでhold start/continueを共有する', () => {
  const layout = fromFaces('converter-hold', 'converter-hold', [
    face([], 'simultaneous', { x: 'く', y: 'け' }),
    face(['q'], 'simultaneous', { x: 'ぐ', y: 'げ' }, {
      layer: '濁音',
      triggerPersistence: 'hold-capable',
    }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
    actionRealizationPolicy: { triggerActivation: 'semantic', triggerActivationClassOverrides: { 'order-free': 'separate' } },
  });

  assert.deepEqual(engine.handle({ type: 'down', key: 'q' }).recognized, []);
  const first = engine.handle({ type: 'down', key: 'x' }).recognized[0];
  assert.equal(first.output, 'ぐ');
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [
    { keys: ['q'], heldKeys: ['q'], holdPhase: 'start' },
    { keys: ['x'], heldKeys: ['q'], holdPhase: 'continue' },
  ]);

  engine.handle({ type: 'up', key: 'x' });
  const second = engine.handle({ type: 'down', key: 'y' }).recognized[0];
  assert.equal(second.output, 'げ');
  assert.deepEqual(second.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [
    { keys: ['y'], heldKeys: ['q'], holdPhase: 'continue' },
  ]);
});


test('3-key候補の途中まで重なっても未定義2-keyなら両単打を保持する', () => {
  const layout = fromKana('converter-unconsumed-overlap', 'converter-unconsumed-overlap', [
    ['A', [['h']]],
    ['B', [['j']]],
    ['ABC', [['h', 'j', 'k']]],
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  const outputs: string[] = [];
  for (const event of [
    { type: 'down', key: 'h' },
    { type: 'down', key: 'j' },
    { type: 'up', key: 'h' },
    { type: 'up', key: 'j' },
  ] as const) {
    outputs.push(...engine.handle(event).recognized.map((entry) => entry.output));
  }

  assert.deepEqual(outputs, ['A', 'B']);
});

test('未定義overlapは後から押したkeyを先にreleaseしてもpress順の単打を保持する', () => {
  const layout = fromKana('converter-unconsumed-reverse-release', 'converter-unconsumed-reverse-release', [
    ['A', [['h']]],
    ['B', [['j']]],
    ['ABC', [['h', 'j', 'k']]],
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  const outputs: string[] = [];
  for (const event of [
    { type: 'down', key: 'h' },
    { type: 'down', key: 'j' },
    { type: 'up', key: 'j' },
    { type: 'up', key: 'h' },
  ] as const) {
    outputs.push(...engine.handle(event).recognized.map((entry) => entry.output));
  }

  assert.deepEqual(outputs, ['A', 'B']);
});

test('定義済み2-key chordは単打fallbackへ二重展開しない', () => {
  const layout = fromKana('converter-defined-overlap', 'converter-defined-overlap', [
    ['A', [['h']]],
    ['B', [['j']]],
    ['AB', [['h', 'j']]],
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  const outputs: string[] = [];
  for (const event of [
    { type: 'down', key: 'h' },
    { type: 'down', key: 'j' },
    { type: 'up', key: 'h' },
    { type: 'up', key: 'j' },
  ] as const) {
    outputs.push(...engine.handle(event).recognized.map((entry) => entry.output));
  }

  assert.deepEqual(outputs, ['AB']);
});


test('recognitionKeysはprefix trigger release後も次の入力まで保持される', () => {
  const layout = fromFaces('converter-recognition-keys', 'converter-recognition-keys', [
    face([], 'simultaneous', { h: 'H' }),
    face(['d'], 'prefix', { h: 'X' }, { layer: 'shift' }),
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);

  assert.deepEqual(engine.handle({ type: 'down', key: 'd' }).recognitionKeys, ['d']);
  assert.deepEqual(engine.handle({ type: 'up', key: 'd' }).recognitionKeys, ['d']);
  const completed = engine.handle({ type: 'down', key: 'h' });
  assert.deepEqual(completed.recognized.map((entry) => entry.output), ['X']);
  assert.deepEqual(completed.recognitionKeys, []);
});

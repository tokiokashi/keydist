import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { faceFromEntries, fromFaces, type Face, type FaceMode } from '../src/layouts/index.ts';

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
    actionRealizationPolicy: { holdStart: 'separate' },
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

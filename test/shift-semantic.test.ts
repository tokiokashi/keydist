import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { buildGeometry, SHIFT_KEY } from '../src/geometry.ts';
import { LAYOUTS } from '../src/layouts/index.ts';

const qwerty = LAYOUTS.find((layout) => layout.id === 'qwerty')!;

test('alpha layoutは大文字を左右Shiftのcanonical alternativeとして持つ', () => {
  const alternatives = qwerty.canonicalInputs.get('A');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);

  const byShift = new Map(alternatives.map((alternative) => {
    const input = alternative.semanticInputs[0];
    const shift = input.roles.find((role) => role.role === 'modifier')?.key;
    return [shift, alternative] as const;
  }));

  for (const shift of [SHIFT_KEY.L, SHIFT_KEY.R]) {
    const alternative = byShift.get(shift);
    assert.ok(alternative, shift);
    const input = alternative.semanticInputs[0];
    assert.equal(input.output, 'A');
    assert.deepEqual(input.requirements, [{
      kind: 'overlap',
      keys: ['a', shift].sort(),
    }]);
    assert.deepEqual(input.capabilities, [{
      kind: 'while-held',
      keys: [shift],
    }]);
    assert.deepEqual(input.roles, [{
      key: shift,
      role: 'modifier',
      modifierGroupId: 'Shift',
    }]);
    assert.equal(input.aggregationGroupId, 'layer:Shift');

    const realization = alternative.baseRealizations[0];
    assert.deepEqual(realization.actions, [[shift, 'a']]);
    assert.deepEqual(realization.defaultOutputKeys, ['a']);
    assert.deepEqual(realization.defaultTriggerKeys, [shift]);
    assert.deepEqual(realization.defaultHoldKeys, [shift]);
  }
});

test('Shift記号もbase outputと同じphysical keyへcompileする', () => {
  const question = qwerty.canonicalInputs.get('?');
  assert.ok(question);
  assert.equal(question.length, 2);
  assert.ok(question.every((alternative) =>
    alternative.semanticInputs[0].physicalKeys.includes('/')));
});

test('evaluateは通常Shiftで出力キーと反対手のShift alternativeを選ぶ', () => {
  const geometry = buildGeometry('row-staggered');
  const trace = evaluate('A?', qwerty, geometry, DEFAULT_OPTIONS);

  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => ({
      char: stroke.char,
      triggerKeys: stroke.triggerKeys,
      aggregationGroupId: stroke.aggregationGroupId,
    })),
    [
      {
        char: 'A',
        triggerKeys: [SHIFT_KEY.R],
        aggregationGroupId: 'layer:Shift',
      },
      {
        char: '?',
        triggerKeys: [SHIFT_KEY.L],
        aggregationGroupId: 'layer:Shift',
      },
    ],
  );
});

test('Shift holdはInput Converterでstart/continueとして実現できる', () => {
  const engine = new TypingInputEngine(qwerty.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });

  assert.deepEqual(engine.handle({ type: 'down', key: SHIFT_KEY.R }).recognized, []);
  const first = engine.handle({ type: 'down', key: 'a' }).recognized[0];
  assert.equal(first.output, 'A');
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [{
    keys: [SHIFT_KEY.R, 'a'],
    heldKeys: [SHIFT_KEY.R],
    holdPhase: 'start',
  }]);

  engine.handle({ type: 'up', key: 'a' });
  const second = engine.handle({ type: 'down', key: 'b' }).recognized[0];
  assert.equal(second.output, 'B');
  assert.deepEqual(second.actions.map((action) => ({
    keys: action.keys,
    heldKeys: action.heldKeys,
    holdPhase: action.holdPhase,
  })), [{
    keys: ['b'],
    heldKeys: [SHIFT_KEY.R],
    holdPhase: 'continue',
  }]);
});

test('既定geometryは左右Shiftを小指のphysical keyとして持つ', () => {
  for (const kind of ['row-staggered', 'ortholinear', 'column-staggered'] as const) {
    const geometry = buildGeometry(kind);
    assert.equal(geometry.keys.get(SHIFT_KEY.L)?.finger, 'LP', kind);
    assert.equal(geometry.keys.get(SHIFT_KEY.R)?.finger, 'RP', kind);
  }
});

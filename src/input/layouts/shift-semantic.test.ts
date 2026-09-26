import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '#tester/engine/index.ts';
import { DEFAULT_OPTIONS, evaluate } from '#trace/evaluate.ts';
import { buildGeometry, SHIFT_KEY } from '../shapes/geometry.ts';
import { LAYOUTS } from './index.ts';
import { computeMetrics } from '#interpretation/metrics.ts';

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

test('row-staggeredのShift座標をbottom row基準で固定する', () => {
  const geometry = buildGeometry('row-staggered');
  assert.deepEqual(
    {
      left: {
        x: geometry.keys.get(SHIFT_KEY.L)?.x,
        y: geometry.keys.get(SHIFT_KEY.L)?.y,
      },
      right: {
        x: geometry.keys.get(SHIFT_KEY.R)?.x,
        y: geometry.keys.get(SHIFT_KEY.R)?.y,
      },
    },
    {
      left: { x: -0.375, y: 3 },
      right: { x: 12.125, y: 3 },
    },
  );
});


test('全角！／？は半角Shift記号と同じphysical inputとして評価する', () => {
  const geometry = buildGeometry('row-staggered');
  const halfwidth = evaluate('!?', qwerty, geometry, DEFAULT_OPTIONS);
  const fullwidth = evaluate('！？', qwerty, geometry, DEFAULT_OPTIONS);

  assert.equal(fullwidth.skipped, 0);
  assert.deepEqual(
    fullwidth.strokes.map((stroke) => ({
      keys: stroke.presses.flatMap((press) => press.keys.map((key) => key.id)),
      triggerKeys: stroke.triggerKeys,
    })),
    halfwidth.strokes.map((stroke) => ({
      keys: stroke.presses.flatMap((press) => press.keys.map((key) => key.id)),
      triggerKeys: stroke.triggerKeys,
    })),
  );
  assert.deepEqual(fullwidth.strokes.map((stroke) => stroke.inputChar), ['！', '？']);
});

test('小文字入力はShift semantic追加後も単打のまま', () => {
  const trace = evaluate('a', qwerty, buildGeometry('row-staggered'), DEFAULT_OPTIONS);

  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 1);
  assert.deepEqual(trace.strokes[0].triggerKeys, []);
  assert.deepEqual(
    trace.strokes[0].presses.flatMap((press) => press.keys.map((key) => key.id)),
    ['a'],
  );
});

test('while-held Capabilityだけでは既定評価をheld-triggerへ変えない', () => {
  const trace = evaluate('AA', qwerty, buildGeometry('row-staggered'), DEFAULT_OPTIONS);

  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 2);
  for (const stroke of trace.strokes) {
    assert.equal(stroke.participations.some((part) => part.roles.includes('held-trigger')), false);
    assert.equal(stroke.participations.some((part) => part.roles.includes('trigger')), true);
    assert.equal(stroke.participations.some((part) => part.holdPhase !== undefined), false);
  }
});

test('通常Shiftはcompositionではなくmodifier semanticとして残る', () => {
  const alternatives = qwerty.canonicalInputs.get('A');
  assert.ok(alternatives);

  for (const alternative of alternatives) {
    const input = alternative.semanticInputs[0];
    assert.deepEqual(input.classifications, []);
    assert.equal(input.roles.some((role) => role.role === 'modifier'), true);
    assert.equal(alternative.origin, 'sequence');
  }
});


test('Shift pressは通常のmetrics pipelineへそのまま計上される', () => {
  const geometry = buildGeometry('row-staggered');
  const lower = computeMetrics(evaluate('a', qwerty, geometry, DEFAULT_OPTIONS), geometry);
  const upper = computeMetrics(evaluate('A', qwerty, geometry, DEFAULT_OPTIONS), geometry);

  assert.equal(lower.presses, 1);
  assert.equal(upper.presses, 2);
  assert.equal(upper.perFingerPresses.RP, lower.perFingerPresses.RP + 1);
  assert.equal(upper.keyCounts.get(SHIFT_KEY.R), 1);
  assert.equal(upper.layers.find((layer) => layer.id === 'layer:Shift')?.presses, 2);
  assert.equal(upper.singleTapLayerRate, 0);
});

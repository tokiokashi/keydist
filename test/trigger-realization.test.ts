import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { evaluate } from '#trace/evaluate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { fromFaces } from '#input/layouts/index.ts';
import { DEFAULT_TRIGGER_REALIZATION_POLICY } from '#input/semantics/index.ts';

const geometry = buildGeometry('row-staggered');

const holdLayout = (persistence: 'single' | 'hold-capable' = 'hold-capable') =>
  fromFaces('hold-test', 'hold-test', [{
    trigger: ['q'],
    mode: 'simultaneous',
    rows: ['', '', ['', '', 'y', 'x'], ''],
    inputRole: 'modifier',
    triggerPersistence: persistence,
  }]);

test('既定Policyはhold-capableをrealizeせずbase normalizationと互換', () => {
  const trace = evaluate('xy', holdLayout(), geometry);
  assert.equal(trace.strokes.length, 2);
  assert.deepEqual(trace.strokes.map((stroke) => stroke.triggerKeys), [['q'], ['q']]);
  assert.ok(trace.strokes.every((stroke) =>
    stroke.participations.every((participation) => !participation.roles.includes('held-trigger'))));
});

test('hold利用時は同一trigger集合をstart/continueへrealizeして再押下を除く', () => {
  const layout = holdLayout();
  const off = evaluate('xy', layout, geometry);
  const on = evaluate('xy', layout, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });

  assert.equal(on.strokes.length, 2);
  assert.deepEqual(on.strokes.map((stroke) => stroke.triggerKeys), [['q'], []]);
  assert.deepEqual(
    on.strokes.map((stroke) =>
      stroke.participations
        .filter((participation) => participation.roles.includes('held-trigger'))
        .map((participation) => [participation.keys.map((key) => key.id), participation.holdPhase])),
    [
      [[['q'], 'start']],
      [[['q'], 'continue']],
    ],
  );
  assert.equal(on.strokes[0].participations
    .some((participation) => participation.roles.includes('trigger')), true);
  assert.equal(on.strokes[1].participations
    .some((participation) => participation.roles.includes('trigger')), false);
  assert.equal(on.strokes[1].presses.some((press) => press.keys.some((key) => key.id === 'q')), false);

  const offMetrics = computeMetrics(off, geometry);
  const onMetrics = computeMetrics(on, geometry);
  assert.equal(offMetrics.strokes, onMetrics.strokes);
  assert.equal(offMetrics.presses - onMetrics.presses, 1);
});

test('single triggerはhold利用ONでもheld-triggerへ昇格しない', () => {
  const trace = evaluate('xy', holdLayout('single'), geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });
  assert.deepEqual(trace.strokes.map((stroke) => stroke.triggerKeys), [['q'], ['q']]);
  assert.ok(trace.strokes.every((stroke) =>
    stroke.participations.every((participation) => !participation.roles.includes('held-trigger'))));
});





test('suffix hold-capableは次対象の別triggerを直前holdから誤伝播しない', () => {
  const layout = fromFaces('suffix-association', 'suffix-association', [
    {
      trigger: ['d'],
      mode: 'suffix',
      rows: ['', '', ['', 'x'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'hold-capable',
    },
    {
      trigger: ['j'],
      mode: 'suffix',
      rows: ['', '', ['', '', '', 'y'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'hold-capable',
    },
  ]);
  const trace = evaluate('xy', layout, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });

  const yOutput = trace.strokes.find((stroke) =>
    stroke.char === 'y'
    && stroke.participations.some((participation) => participation.roles.includes('output')));
  assert.ok(yOutput);
  assert.equal(
    yOutput.participations.some((participation) =>
      participation.roles.includes('held-trigger')),
    false,
  );
  assert.equal(yOutput.triggerKeys.length, 0);

  const yTrigger = trace.strokes.find((stroke) =>
    stroke.char === 'y'
    && stroke.participations.some((participation) => participation.roles.includes('trigger')));
  assert.ok(yTrigger);
  assert.deepEqual(yTrigger.triggerKeys, ['j']);
  assert.ok(yTrigger.participations.some((participation) =>
    participation.roles.includes('held-trigger')
    && participation.holdPhase === 'start'));
});

test('suffix singleは同じtriggerでもactive holdを継承しない', () => {
  const layout = fromFaces('suffix-single', 'suffix-single', [
    {
      trigger: ['q'],
      mode: 'suffix',
      rows: ['', '', ['', '', 'x'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'hold-capable',
    },
    {
      trigger: ['q'],
      mode: 'suffix',
      rows: ['', '', ['', '', '', 'y'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'single',
    },
  ]);
  const trace = evaluate('xy', layout, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });

  const yOutput = trace.strokes.find((stroke) =>
    stroke.char === 'y'
    && stroke.participations.some((participation) => participation.roles.includes('output')));
  assert.ok(yOutput);
  assert.equal(yOutput.participations.some((participation) =>
    participation.roles.includes('held-trigger')), false);

  const yTrigger = trace.strokes.find((stroke) =>
    stroke.char === 'y'
    && stroke.participations.some((participation) => participation.roles.includes('trigger')));
  assert.ok(yTrigger);
  assert.equal(yTrigger.participations.some((participation) =>
    participation.roles.includes('held-trigger')), false);
});

test('suffix hold-capableは同じtriggerでも次対象へhold continuationせずorderを維持する', () => {
  const layout = fromFaces('suffix-same', 'suffix-same', [{
    trigger: ['d'],
    mode: 'suffix',
    rows: ['', '', ['', 'x'], ''],
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  }]);
  const trace = evaluate('xx', layout, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });
  const outputs = trace.strokes.filter((stroke) =>
    stroke.participations.some((participation) => participation.roles.includes('output')));
  const triggers = trace.strokes.filter((stroke) =>
    stroke.participations.some((participation) => participation.roles.includes('trigger')));

  assert.equal(outputs.length, 2);
  assert.equal(triggers.length, 2);
  assert.ok(outputs.every((stroke) =>
    stroke.participations.every((participation) => !participation.roles.includes('held-trigger'))));
  assert.ok(triggers.every((stroke) =>
    stroke.participations.some((participation) =>
      participation.roles.includes('held-trigger')
      && participation.holdPhase === 'start')));
});

test('held triggerがoutputでもある場合はcontinueせずrelease/restartする', () => {
  const layout = fromFaces('overlap-hold', 'overlap-hold', [{
    trigger: ['a'],
    mode: 'simultaneous',
    rows: ['', '', ['x'], ''],
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  }]);
  const trace = evaluate('xx', layout, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: true },
  });

  assert.equal(trace.strokes.length, 2);
  for (const stroke of trace.strokes) {
    assert.equal(stroke.presses.length, 1);
    assert.deepEqual(stroke.presses[0].keys.map((key) => key.id), ['a']);
    assert.ok(stroke.participations.some((participation) =>
      participation.roles.includes('output')
      && participation.roles.includes('trigger')
      && participation.roles.includes('held-trigger')
      && participation.holdPhase === 'start'));
    assert.equal(stroke.participations.some((participation) =>
      participation.holdPhase === 'continue'), false);
  }
  const metrics = computeMetrics(trace, geometry);
  assert.equal(metrics.presses, 2);
  assert.equal(metrics.perCharPresses, 1);
});



test('Policy defaultはhold未使用', () => {
  assert.deepEqual(DEFAULT_TRIGGER_REALIZATION_POLICY, { useHold: false });
});

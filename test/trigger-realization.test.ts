import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { fromFaces } from '../src/layouts/index.ts';
import {
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  realizeTriggerStep,
} from '../src/trigger-realization.ts';

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

test('full trigger集合が一致する時だけcontinueする', () => {
  const semantic = {
    inputRole: 'modifier' as const,
    triggerPersistence: 'hold-capable' as const,
    outputKeys: ['f'],
    triggerKeys: ['q', 'w'],
  };
  const start = realizeTriggerStep(
    ['q', 'w', 'f'],
    semantic,
    'layer:test',
    { useHold: true },
    undefined,
  );
  assert.equal(start.holdPhase, 'start');

  const continued = realizeTriggerStep(
    ['w', 'q', 'f'],
    { ...semantic, triggerKeys: ['w', 'q'] },
    'layer:test',
    { useHold: true },
    start.holdState,
  );
  assert.equal(continued.holdPhase, 'continue');
  assert.deepEqual(continued.triggerKeys, []);

  const changed = realizeTriggerStep(
    ['q', 'f'],
    { ...semantic, triggerKeys: ['q'] },
    'layer:test',
    { useHold: true },
    start.holdState,
  );
  assert.equal(changed.holdPhase, 'start');
  assert.deepEqual(changed.triggerKeys, ['q']);
});

test('prefix hold-capableはtrigger-only再押下を省略してoutputへ保持を伝播する', () => {
  const policy = { useHold: true };
  const triggerSemantic = {
    inputRole: 'modifier' as const,
    triggerPersistence: 'hold-capable' as const,
    outputKeys: [] as string[],
    triggerKeys: ['q'],
  };
  const outputSemantic = {
    inputRole: 'modifier' as const,
    outputKeys: ['f'],
    triggerKeys: [] as string[],
  };

  const start = realizeTriggerStep(['q'], triggerSemantic, 'layer:test', policy, undefined);
  const output = realizeTriggerStep(['f'], outputSemantic, 'layer:test', policy, start.holdState);
  const repeatedTrigger = realizeTriggerStep(['q'], triggerSemantic, 'layer:test', policy, output.holdState);

  assert.equal(start.holdPhase, 'start');
  assert.equal(output.holdPhase, 'continue');
  assert.deepEqual(output.heldTriggerKeys, ['q']);
  assert.equal(repeatedTrigger.holdPhase, 'continue');
  assert.equal(repeatedTrigger.omitStroke, true);
});

test('Policy defaultはhold未使用', () => {
  assert.deepEqual(DEFAULT_TRIGGER_REALIZATION_POLICY, { useHold: false });
});

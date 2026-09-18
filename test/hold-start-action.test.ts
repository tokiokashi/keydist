import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { fromFaces } from '../src/layouts/index.ts';
import { computeMetrics, DEFAULT_METRIC_CONDITIONS } from '../src/metrics.ts';
import {
  additionalHoldStartSteps,
  DEFAULT_HOLD_START_ACTION_POLICY,
} from '../src/hold-start-action.ts';

const geometry = buildGeometry('row-staggered');

const simultaneous = fromFaces('hold-action-sim', 'hold-action-sim', [{
  trigger: ['q'],
  mode: 'simultaneous',
  rows: ['', '', ['', 'z', 'y', 'x'], ''],
  inputRole: 'modifier',
  triggerPersistence: 'hold-capable',
}]);

const prefix = fromFaces('hold-action-prefix', 'hold-action-prefix', [{
  trigger: ['q'],
  mode: 'prefix',
  rows: ['', '', ['', '', 'y', 'x'], ''],
  inputRole: 'modifier',
  triggerPersistence: 'hold-capable',
}]);

const composition = fromFaces('hold-action-composition', 'hold-action-composition', [{
  trigger: ['q'],
  mode: 'simultaneous',
  rows: ['', '', ['', '', 'y', 'x'], ''],
  inputRole: 'composition',
  triggerPersistence: 'hold-capable',
}]);

const realized = (text: string, layout = simultaneous) => evaluate(text, layout, geometry, {
  windowSize: 3,
  sfbHomeCost: true,
  triggerRealizationPolicy: { useHold: true },
});

test('既定ではheld-trigger/startを追加stepとして数えない', () => {
  const trace = realized('xyz');
  assert.equal(trace.strokes.length, 3);
  assert.equal(additionalHoldStartSteps(trace.strokes), 0);
  assert.deepEqual(DEFAULT_HOLD_START_ACTION_POLICY, { countAsSeparateStep: false });
});

test('simultaneousのhold開始だけを1区間につき1 additional stepとして数える', () => {
  const trace = realized('xyz');
  assert.equal(
    additionalHoldStartSteps(trace.strokes, { countAsSeparateStep: true }),
    1,
  );

  const starts = trace.strokes.filter((stroke) => stroke.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'start'));
  const continues = trace.strokes.filter((stroke) => stroke.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'continue'));
  assert.equal(starts.length, 1);
  assert.equal(continues.length, 2);
});

test('action計上ONはaction数だけを増やしphysical Stroke・press・距離を変えない', () => {
  const trace = realized('xyz');
  const baseConditions = {
    ...DEFAULT_METRIC_CONDITIONS,
    triggerRealizationPolicy: { useHold: true },
  };
  const off = computeMetrics(trace, geometry, {
    ...baseConditions,
    holdStartActionPolicy: { countAsSeparateStep: false },
  });
  const on = computeMetrics(trace, geometry, {
    ...baseConditions,
    holdStartActionPolicy: { countAsSeparateStep: true },
  });

  assert.equal(on.strokes, off.strokes);
  assert.equal(on.actions, off.actions + 1);
  assert.equal(on.perCharSteps, off.perCharSteps + 1 / trace.inputChars);
  assert.equal(on.meanPerStroke, off.meanPerStroke);
  assert.equal(on.sameFinger, off.sameFinger);
  assert.equal(on.presses, off.presses);
  assert.equal(on.perCharPresses, off.perCharPresses);
  assert.equal(on.totalUnits, off.totalUnits);
  assert.equal(on.perCharUnits, off.perCharUnits);
});

test('compositionのheld-trigger/startは追加actionとして数えない', () => {
  const trace = realized('xy', composition);
  assert.ok(trace.strokes.some((stroke) =>
    stroke.inputRole === 'composition'
    && stroke.participations.some((participation) =>
      participation.roles.includes('held-trigger') && participation.holdPhase === 'start')));
  assert.equal(
    additionalHoldStartSteps(trace.strokes, { countAsSeparateStep: true }),
    0,
  );

  const metrics = computeMetrics(trace, geometry, {
    ...DEFAULT_METRIC_CONDITIONS,
    triggerRealizationPolicy: { useHold: true },
    holdStartActionPolicy: { countAsSeparateStep: true },
  });
  assert.equal(metrics.actions, metrics.strokes);
});

test('prefix trigger-only Strokeは既に独立stepなので追加計上しない', () => {
  const trace = realized('xy', prefix);
  assert.equal(trace.strokes[0].participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'start'), true);
  assert.equal(trace.strokes[0].participations.some((participation) =>
    participation.roles.includes('output')), false);
  assert.equal(
    additionalHoldStartSteps(trace.strokes, { countAsSeparateStep: true }),
    0,
  );
});

test('holdをrealizeしていないStrokeには計上PolicyだけONにしても影響しない', () => {
  const trace = evaluate('xyz', simultaneous, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: false },
  });
  assert.equal(
    additionalHoldStartSteps(trace.strokes, { countAsSeparateStep: true }),
    0,
  );
});

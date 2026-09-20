import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { fromFaces } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import { playbackTimingSchedule } from '../src/playback.ts';
import {
  DEFAULT_HOLD_START_ACTION_POLICY,
  toActionRealizationPolicy,
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

const realized = (
  text: string,
  layout = simultaneous,
  holdStart: 'combined' | 'separate' = 'combined',
) => evaluate(text, layout, geometry, {
  windowSize: 3,
  sfbHomeCost: true,
  triggerRealizationPolicy: { useHold: true },
  actionRealizationPolicy: { holdStart },
});

test('旧hold-start設定はActionRealizationPolicyへ1対1で変換する', () => {
  assert.deepEqual(DEFAULT_HOLD_START_ACTION_POLICY, { countAsSeparateStep: false });
  assert.deepEqual(
    toActionRealizationPolicy({ countAsSeparateStep: false }),
    { holdStart: 'combined' },
  );
  assert.deepEqual(
    toActionRealizationPolicy({ countAsSeparateStep: true }),
    { holdStart: 'separate' },
  );
});

test('combinedではhold開始をoutputと同じrealized Strokeに保つ', () => {
  const trace = realized('xyz');
  assert.equal(trace.strokes.length, 3);
  assert.equal(trace.strokes[0].presses.flatMap((press) => press.keys).length, 2);
  assert.ok(trace.strokes[0].participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'start'));
  assert.ok(trace.strokes[0].participations.some((participation) =>
    participation.roles.includes('output')));
});

test('separateではhold開始とfresh outputが共通Stroke stream上で分割される', () => {
  const trace = realized('xyz', simultaneous, 'separate');
  assert.equal(trace.strokes.length, 4);

  const holdStart = trace.strokes[0];
  const output = trace.strokes[1];
  assert.deepEqual(holdStart.presses.flatMap((press) => press.keys.map((key) => key.id)), ['q']);
  assert.equal(holdStart.participations.some((participation) =>
    participation.roles.includes('output')), false);
  assert.ok(holdStart.participations.some((participation) =>
    participation.roles.includes('trigger')
    && participation.roles.includes('held-trigger')
    && participation.holdPhase === 'start'));

  assert.deepEqual(output.presses.flatMap((press) => press.keys.map((key) => key.id)), ['f']);
  assert.ok(output.participations.some((participation) =>
    participation.roles.includes('output')));
  assert.ok(output.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'continue'));
});

test('separate後はMetricsもvirtual補正せず共通Stroke streamを数える', () => {
  const combinedTrace = realized('xyz');
  const separateTrace = realized('xyz', simultaneous, 'separate');
  const combined = computeMetrics(combinedTrace, geometry);
  const separate = computeMetrics(separateTrace, geometry, {
    ...combined.conditions,
    actionRealizationPolicy: { holdStart: 'separate' },
  });

  assert.equal(combined.actions, combinedTrace.strokes.length);
  assert.equal(separate.actions, separateTrace.strokes.length);
  assert.equal(separate.actions, combined.actions + 1);
  assert.equal(separate.presses, combined.presses);
});

test('Chain / Timing / PlaybackはActionRealizationPolicy適用後の同じStroke streamを読む', () => {
  const combinedTrace = realized('xyz', simultaneous, 'combined');
  const separateTrace = realized('xyz', simultaneous, 'separate');

  const combinedAnalysis = analyzeStrokeStructure(
    combinedTrace.strokes,
    undefined,
    undefined,
    undefined,
    { holdStart: 'combined' },
  );
  const separateAnalysis = analyzeStrokeStructure(
    separateTrace.strokes,
    undefined,
    undefined,
    undefined,
    { holdStart: 'separate' },
  );
  const combinedSchedule = playbackTimingSchedule(combinedAnalysis, 4, false);
  const separateSchedule = playbackTimingSchedule(separateAnalysis, 4, false);

  assert.equal(combinedTrace.strokes.length, 3);
  assert.equal(separateTrace.strokes.length, 4);

  // structural analysis / Chainへ渡すstrokes自体がevaluateのrealized stream。
  assert.equal(combinedAnalysis.strokes, combinedTrace.strokes);
  assert.equal(separateAnalysis.strokes, separateTrace.strokes);
  assert.equal(combinedAnalysis.aggregate.strokeCount, combinedTrace.strokes.length);
  assert.equal(separateAnalysis.aggregate.strokeCount, separateTrace.strokes.length);
  assert.deepEqual(
    combinedAnalysis.aggregate.conditions.actionRealizationPolicy,
    { holdStart: 'combined' },
  );
  assert.deepEqual(
    separateAnalysis.aggregate.conditions.actionRealizationPolicy,
    { holdStart: 'separate' },
  );

  // Timing / Playback scheduleも同じStroke index列をそのまま使う。
  assert.equal(combinedSchedule.length, combinedTrace.strokes.length);
  assert.equal(separateSchedule.length, separateTrace.strokes.length);
  assert.deepEqual(
    combinedSchedule.map((step) => step.strokeIndex),
    combinedTrace.strokes.map((stroke) => stroke.index),
  );
  assert.deepEqual(
    separateSchedule.map((step) => step.strokeIndex),
    separateTrace.strokes.map((stroke) => stroke.index),
  );
});

test('compositionのhold startはseparate指定でも分割しない', () => {
  const combined = realized('xy', composition, 'combined');
  const separate = realized('xy', composition, 'separate');
  assert.equal(separate.strokes.length, combined.strokes.length);
  assert.deepEqual(
    separate.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    combined.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
  );
});

test('prefix trigger-only Strokeは既に独立しているためseparateでも増えない', () => {
  const combined = realized('xy', prefix, 'combined');
  const separate = realized('xy', prefix, 'separate');
  assert.equal(separate.strokes.length, combined.strokes.length);
  assert.equal(separate.strokes[0].participations.some((participation) =>
    participation.roles.includes('output')), false);
});

test('holdをrealizeしなければActionRealizationPolicyだけseparateでも影響しない', () => {
  const trace = evaluate('xy', simultaneous, geometry, {
    windowSize: 3,
    sfbHomeCost: true,
    triggerRealizationPolicy: { useHold: false },
    actionRealizationPolicy: { holdStart: 'separate' },
  });
  assert.equal(trace.strokes.length, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { fromFaces, LAYOUT_BY_ID, type Layout } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import { playbackTimingSchedule } from '../src/playback.ts';
import type { ActionRealizationPolicy } from '../src/core/semantic-input/index.ts';

const geometry = buildGeometry('row-staggered');

const simultaneous = fromFaces('action-sim', 'action-sim', [{
  trigger: ['q'],
  mode: 'simultaneous',
  rows: ['', '', ['', 'z', 'y', 'x'], ''],
  inputRole: 'modifier',
  triggerPersistence: 'hold-capable',
}]);

const prefix = fromFaces('action-prefix', 'action-prefix', [{
  trigger: ['q'],
  mode: 'prefix',
  rows: ['', '', ['', '', 'y', 'x'], ''],
  inputRole: 'modifier',
  triggerPersistence: 'hold-capable',
}]);

const composition = fromFaces('action-composition', 'action-composition', [{
  trigger: ['q'],
  mode: 'simultaneous',
  rows: ['', '', ['', '', 'y', 'x'], ''],
  inputRole: 'composition',
  triggerPersistence: 'hold-capable',
}]);

const realized = (
  text: string,
  useHold: boolean,
  actionRealizationPolicy: ActionRealizationPolicy,
  layout: Layout = simultaneous,
) => evaluate(text, layout, geometry, {
  windowSize: 3,
  sfbHomeCost: true,
  triggerRealizationPolicy: { useHold },
  actionRealizationPolicy,
});

const disabled = (): ActionRealizationPolicy => ({ triggerActivation: 'disabled' });
const separateOrderFree = (): ActionRealizationPolicy => ({
  triggerActivation: 'semantic',
  triggerActivationClassOverrides: { 'order-free': 'separate' },
});

test('trigger action groupingとcontinuous holdの4象限を独立にrealizeする', () => {
  const combinedNoHold = realized('xy', false, disabled());
  const separateNoHold = realized('xy', false, separateOrderFree());
  const combinedHold = realized('xy', true, disabled());
  const separateHold = realized('xy', true, separateOrderFree());

  assert.equal(combinedNoHold.strokes.length, 2);
  assert.equal(separateNoHold.strokes.length, 4);
  assert.equal(combinedHold.strokes.length, 2);
  assert.equal(separateHold.strokes.length, 3);

  assert.equal(combinedNoHold.strokes.flatMap((stroke) => stroke.presses).length, 4);
  assert.equal(separateNoHold.strokes.flatMap((stroke) => stroke.presses).length, 4);
  assert.equal(combinedHold.strokes.flatMap((stroke) => stroke.presses).length, 3);
  assert.equal(separateHold.strokes.flatMap((stroke) => stroke.presses).length, 3);
});

test('holdなしseparateは各入力のfresh triggerを独立Strokeにする', () => {
  const trace = realized('xy', false, separateOrderFree());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    [['q'], ['f'], ['q'], ['d']],
  );
  assert.equal(trace.strokes[0].participations.some((participation) =>
    participation.roles.includes('held-trigger')), false);
});

test('holdありseparateは最初のactivationだけ分離しcontinueごとには増やさない', () => {
  const trace = realized('xy', true, separateOrderFree());
  assert.equal(trace.strokes.length, 3);

  const trigger = trace.strokes[0];
  const firstOutput = trace.strokes[1];
  const continuedOutput = trace.strokes[2];

  assert.deepEqual(trigger.presses.flatMap((press) => press.keys.map((key) => key.id)), ['q']);
  assert.ok(trigger.participations.some((participation) =>
    participation.roles.includes('trigger')
    && participation.roles.includes('held-trigger')
    && participation.holdPhase === 'start'));

  assert.ok(firstOutput.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'continue'));
  assert.ok(continuedOutput.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'continue'));
});

test('separate後はMetricsもvirtual補正せず共通Stroke streamを数える', () => {
  const combinedTrace = realized('xy', false, disabled());
  const separateTrace = realized('xy', false, separateOrderFree());
  const combined = computeMetrics(combinedTrace, geometry);
  const separate = computeMetrics(separateTrace, geometry, {
    ...combined.conditions,
    actionRealizationPolicy: separateOrderFree(),
  });

  assert.equal(combined.actions, combinedTrace.strokes.length);
  assert.equal(separate.actions, separateTrace.strokes.length);
  assert.equal(separate.actions, combined.actions * 2);
  assert.equal(separate.presses, combined.presses);
});

test('Chain / Timing / PlaybackはActionRealizationPolicy適用後の同じStroke streamを読む', () => {
  const combinedTrace = realized('xy', false, disabled());
  const separateTrace = realized('xy', false, separateOrderFree());

  const combinedAnalysis = analyzeStrokeStructure(
    combinedTrace.strokes,
    undefined,
    undefined,
    { useHold: false },
    disabled(),
  );
  const separateAnalysis = analyzeStrokeStructure(
    separateTrace.strokes,
    undefined,
    undefined,
    { useHold: false },
    separateOrderFree(),
  );
  const combinedSchedule = playbackTimingSchedule(combinedAnalysis, 4, false);
  const separateSchedule = playbackTimingSchedule(separateAnalysis, 4, false);

  assert.equal(combinedAnalysis.strokes, combinedTrace.strokes);
  assert.equal(separateAnalysis.strokes, separateTrace.strokes);
  assert.equal(combinedAnalysis.aggregate.strokeCount, combinedTrace.strokes.length);
  assert.equal(separateAnalysis.aggregate.strokeCount, separateTrace.strokes.length);
  assert.deepEqual(
    combinedAnalysis.aggregate.conditions.actionRealizationPolicy,
    disabled(),
  );
  assert.deepEqual(
    separateAnalysis.aggregate.conditions.actionRealizationPolicy,
    separateOrderFree(),
  );
  assert.deepEqual(
    combinedSchedule.map((step) => step.strokeIndex),
    combinedTrace.strokes.map((stroke) => stroke.index),
  );
  assert.deepEqual(
    separateSchedule.map((step) => step.strokeIndex),
    separateTrace.strokes.map((stroke) => stroke.index),
  );
});

test('compositionはsemantic grouping overrideでも分割しない', () => {
  const combined = realized('xy', false, disabled(), composition);
  const separate = realized('xy', false, separateOrderFree(), composition);
  assert.equal(separate.strokes.length, combined.strokes.length);
});

test('prefix trigger-only Strokeは既に独立しているためseparateでも増えない', () => {
  const combined = realized('xy', false, disabled(), prefix);
  const separate = realized('xy', false, separateOrderFree(), prefix);
  assert.equal(separate.strokes.length, combined.strokes.length);
  assert.equal(separate.strokes[0].participations.some((participation) =>
    participation.roles.includes('output')), false);
});

test('薙刀式はsemantic既定値だけでSandSをseparate、order-free装飾をcombinedにする', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const semanticPolicy: ActionRealizationPolicy = { triggerActivation: 'semantic' };

  const combined = realized('おが', false, disabled(), naginata);
  const mixed = realized('おが', false, semanticPolicy, naginata);

  assert.equal(combined.strokes.length, 2);
  assert.equal(mixed.strokes.length, 3);
  assert.equal(mixed.strokes.filter((stroke) => stroke.layerId === 'layer:SandS').length, 2);
  assert.equal(mixed.strokes.filter((stroke) => stroke.layerId === 'layer:濁音').length, 1);
});

test('薙刀式のorder-free大分類は必要なら一括でseparateへoverrideできる', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const policy: ActionRealizationPolicy = {
    triggerActivation: 'semantic',
    triggerActivationClassOverrides: { 'order-free': 'separate' },
  };
  const trace = realized('が', false, policy, naginata);
  assert.equal(trace.strokes.length, 2);
  assert.equal(trace.strokes[0].layerId, 'layer:濁音');
  assert.equal(trace.strokes[1].layerId, 'layer:濁音');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import {
  analyzeStrokeStructure,
} from '../src/analysis-aggregate.ts';
import {
  DEFAULT_ARPEGGIO_POLICY,
} from '../src/analysis-arpeggio.ts';
import { DEFAULT_CHAIN_POLICY } from '../src/analysis-chain.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
} from '../src/core/semantic-input/index.ts';

const key = (id: string, finger: Finger, x: number, y: number, row = 2): Key => ({
  id,
  finger,
  x,
  y,
  row,
  col: 0,
});

const press = (
  finger: Finger,
  keys: Key[],
  target?: Point,
  sfb = false,
): Press => ({
  finger,
  keys,
  target: target ?? { x: keys[0].x, y: keys[0].y },
  gap: 1,
  distance: 0,
  sfb,
});

const participation = (p: Press): StrokeParticipation => ({
  hand: p.finger.startsWith('L') ? 'left' : 'right',
  finger: p.finger,
  keys: p.keys,
  roles: ['output'],
});

const stroke = (index: number, p: Press): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  aggregationGroupId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [participation(p)],
  presses: [p],
  distance: 0,
  positions: {} as Stroke['positions'],
});

const keepSameFinger = {
  ...DEFAULT_CHAIN_POLICY,
  breakOnSameFinger: false,
};

test('overlapするArpeggioSpanはraw countを保ちcoverageだけunionする', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LP', [key('q', 'LP', 1, 1)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.equal(result.arpeggioSpans.length, 2);
  assert.deepEqual(
    result.arpeggioSpans.map((span) => [
      span.startStrokeIndex,
      span.endStrokeIndex,
      span.direction,
    ]),
    [
      [0, 3, 'inward'],
      [1, 4, 'outward'],
    ],
  );
  assert.equal(result.aggregate.arpeggio.spans, 2);
  assert.equal(result.aggregate.arpeggio.meanSpanLength, 3);
  assert.deepEqual(result.aggregate.arpeggio.coverage, {
    strokes: 4,
    rate: 1,
  });
});

test('A → A → A はSFB event=2、関与Stroke=3になる', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LI', [key('f', 'LI', 4, 2)])),
    stroke(1, press('LI', [key('r', 'LI', 3.5, 1)], undefined, true)),
    stroke(2, press('LI', [key('v', 'LI', 4.25, 3)], undefined, true)),
  ], keepSameFinger);

  assert.equal(result.sfbEvents.length, 2);
  assert.equal(result.aggregate.sfb.events, 2);
  assert.deepEqual(result.aggregate.sfb.involvedStrokes, {
    strokes: 3,
    rate: 1,
  });
  assert.deepEqual(
    result.annotations.map((annotation) => annotation.inSfb),
    [true, true, true],
  );
});

test('Redirect annotationは3 Stroke全体ではなくpivotだけに付く', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(2, press('LR', [key('s', 'LR', 2, 2)])),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  assert.deepEqual(
    result.annotations.map((annotation) => annotation.inRedirect),
    [false, true, false],
  );
  assert.equal(result.aggregate.redirect.events, 1);
  assert.deepEqual(result.aggregate.redirect.pivots, {
    strokes: 1,
    rate: 1 / 3,
  });
});

test('bridgeSameFinger後もinSfbを残して非排他的annotationにする', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LM', [key('d', 'LM', 3, 2)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.equal(result.annotations[1].inArpeggio, true);
  assert.equal(result.annotations[2].inArpeggio, true);
  assert.equal(result.annotations[1].inSfb, true);
  assert.equal(result.annotations[2].inSfb, true);
});

test('LongRoll内部pairはinTwoRollにならずAnyRollはunionになる', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger);

  assert.equal(result.longRolls.length, 1);
  assert.equal(result.twoRolls.length, 0);
  assert.deepEqual(
    result.annotations.map((annotation) => [
      annotation.inLongRoll,
      annotation.inTwoRoll,
    ]),
    [
      [true, false],
      [true, false],
      [true, false],
      [true, false],
    ],
  );
  assert.deepEqual(result.aggregate.roll.longRoll, { strokes: 4, rate: 1 });
  assert.deepEqual(result.aggregate.roll.twoRoll, { strokes: 0, rate: 0 });
  assert.deepEqual(result.aggregate.roll.anyRoll, { strokes: 4, rate: 1 });
});

test('standalone TwoRollの両端だけinTwoRoll=trueになりcoverageへunionする', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(2, press('LR', [key('s', 'LR', 2, 2)])),
  ], keepSameFinger);

  assert.deepEqual(result.redirects.map((redirect) => redirect.pivotStrokeIndex), [1]);
  assert.deepEqual(result.twoRolls, [{
    chainIndex: 0,
    startStrokeIndex: 1,
    endStrokeIndex: 3,
    direction: 'outward',
  }]);
  assert.deepEqual(
    result.annotations.map((annotation) => [
      annotation.inLongRoll,
      annotation.inTwoRoll,
      annotation.inRedirect,
    ]),
    [
      [false, false, false],
      [false, true, true],
      [false, true, false],
    ],
  );
  assert.deepEqual(result.aggregate.roll.longRoll, { strokes: 0, rate: 0 });
  assert.deepEqual(result.aggregate.roll.twoRoll, { strokes: 2, rate: 2 / 3 });
  assert.deepEqual(result.aggregate.roll.anyRoll, { strokes: 2, rate: 2 / 3 });
});

test('directional pair統計はcandidate数ではなくHandTransitionを基準に数える', () => {
  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LP', [key('q', 'LP', 1, 1)])),
  ], keepSameFinger);

  assert.deepEqual(result.aggregate.directionalTransitions, {
    total: 3,
    inward: 1,
    outward: 1,
    same: 1,
    mixed: 0,
    empty: 0,
  });
});

test('集計結果は解決済みChainPolicy / ArpeggioPolicyをsnapshotで保持する', () => {
  const chainPolicy = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnOppositeHandSimultaneous: true,
  };
  const arpeggioPolicy = {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
    includeSingleRedirectTail: true,
  };

  const result = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
  ], chainPolicy, arpeggioPolicy);

  assert.deepEqual(result.aggregate.conditions, {
    chainPolicy,
    arpeggioPolicy,
    triggerRealizationPolicy: DEFAULT_TRIGGER_REALIZATION_POLICY,
    actionRealizationPolicy: DEFAULT_ACTION_REALIZATION_POLICY,
  });
  assert.notEqual(result.aggregate.conditions.chainPolicy, chainPolicy);
  assert.notEqual(result.aggregate.conditions.arpeggioPolicy, arpeggioPolicy);
  assert.notEqual(
    result.aggregate.conditions.triggerRealizationPolicy,
    DEFAULT_TRIGGER_REALIZATION_POLICY,
  );
  assert.notEqual(
    result.aggregate.conditions.actionRealizationPolicy,
    DEFAULT_ACTION_REALIZATION_POLICY,
  );
  assert.equal(Object.isFrozen(result.aggregate.conditions), true);
  assert.equal(Object.isFrozen(result.aggregate.conditions.chainPolicy), true);
  assert.equal(Object.isFrozen(result.aggregate.conditions.arpeggioPolicy), true);
  assert.equal(Object.isFrozen(result.aggregate.conditions.triggerRealizationPolicy), true);
  assert.equal(Object.isFrozen(result.aggregate.conditions.actionRealizationPolicy), true);
});

test('Stroke本体をannotation生成でmutateしない', () => {
  const strokes = [
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
  ];
  const before = strokes.map((entry) => ({ ...entry }));

  const result = analyzeStrokeStructure(strokes, keepSameFinger);

  assert.equal(result.strokes, strokes);
  assert.deepEqual(strokes, before);
  assert.equal('inLongRoll' in (strokes[0] as unknown as Record<string, unknown>), false);
  assert.equal(Object.isFrozen(result.annotations), true);
  assert.equal(Object.isFrozen(result.annotations[0]), true);
  assert.equal(Object.isFrozen(result.aggregate), true);
});

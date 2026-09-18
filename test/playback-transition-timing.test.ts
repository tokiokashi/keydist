import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import {
  playbackStepDurationMs,
} from '../src/playback.ts';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import {
  DEFAULT_CHAIN_POLICY,
} from '../src/analysis-chain.ts';
import {
  DEFAULT_ARPEGGIO_POLICY,
} from '../src/analysis-arpeggio.ts';

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
  distance = 0,
): Press => ({
  finger,
  keys,
  target: target ?? { x: keys[0].x, y: keys[0].y },
  gap: 1,
  distance,
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
  layerId: 'single',
  inputRole: 'layer',
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [participation(p)],
  presses: [p],
  distance: 0,
  positions: {} as Stroke['positions'],
});

const multiStroke = (index: number, presses: Press[]): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  layerId: 'single',
  inputRole: 'layer',
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: presses.map(participation),
  presses,
  distance: 0,
  positions: {} as Stroke['positions'],
});

const keepSameFinger = {
  ...DEFAULT_CHAIN_POLICY,
  breakOnSameFinger: false,
};

const calibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 8, 'R→L': 7 },
  sameHandDifferentFingerActionsPerSecond: 2,
  sameHandDifferentFingerActionsPerSecondByPair: {
    'LP:LR': 2,
    'LR:LM': 2,
    'LM:LI': 3,
  },
  sameHandDifferentFingerActionsPerDirectedPair: {
    'LP>LR': 4,
    'LR>LM': 5,
    'LM>LI': 10,
  },
  fingerSpeedUnitsPerSecond: { LI: 8 },
  fallbackFingerSpeedUnitsPerSecond: 10,
  measuredAt: 1,
};

test('方向別Transition CalibrationはArpeggio所属に依存せず適用する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(1, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger);

  assert.equal(analysis.arpeggioSpans.length, 1);
  assert.equal(
    playbackStepDurationMs(analysis, 1, 1, false, calibration),
    100,
  );

  const withoutArpeggio = {
    ...analysis,
    arpeggioSpans: [],
    annotations: analysis.annotations.map((annotation) => ({
      ...annotation,
      inArpeggio: false,
    })),
  };
  assert.equal(
    playbackStepDurationMs(withoutArpeggio, 1, 1, false, calibration),
    100,
  );
});

test('異手TransitionはL→R / R→Lの方向別Calibrationを常に使う', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LI', [key('f', 'LI', 4, 2)])),
    stroke(1, press('RI', [key('j', 'RI', 7, 2)])),
    stroke(2, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger);

  assert.equal(playbackStepDurationMs(analysis, 1, 1, false, calibration), 125);
  assert.ok(Math.abs(
    playbackStepDurationMs(analysis, 2, 1, false, calibration) - (1000 / 7),
  ) < 1e-9);
});

test('3打以上のRollでも内部Transitionを1回ずつdirected pairで評価する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger);

  assert.equal(analysis.longRolls.length, 1);
  assert.deepEqual(
    [1, 2, 3].map((index) =>
      playbackStepDurationMs(analysis, index, 1, false, calibration)),
    [250, 200, 100],
  );
});

test('overlapするArpeggioSpanがあっても同じTransition時間を二重加算しない', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LP', [key('q', 'LP', 1, 1)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.equal(analysis.arpeggioSpans.length, 2);
  const withOverlap = [0, 1, 2, 3].reduce(
    (sum, index) => sum + playbackStepDurationMs(
      analysis,
      index,
      2,
      true,
      calibration,
    ),
    0,
  );
  const withoutSpans = {
    ...analysis,
    arpeggioSpans: [],
    annotations: analysis.annotations.map((annotation) => ({
      ...annotation,
      inArpeggio: false,
    })),
  };
  const withoutOverlap = [0, 1, 2, 3].reduce(
    (sum, index) => sum + playbackStepDurationMs(
      withoutSpans,
      index,
      2,
      true,
      calibration,
    ),
    0,
  );
  assert.equal(withOverlap, withoutOverlap);
});

test('複数candidate時は既存のfirst-match規則を順序込みで固定する', () => {
  const analysis = analyzeStrokeStructure([
    multiStroke(0, [
      press('LP', [key('a', 'LP', 1, 2)]),
      press('LM', [key('d', 'LM', 3, 2)]),
    ]),
    multiStroke(1, [
      press('LR', [key('s', 'LR', 2, 2)]),
      press('LI', [key('f', 'LI', 4, 2)]),
    ]),
  ], keepSameFinger);

  assert.deepEqual(
    analysis.transitions[0].candidates.map((candidate) =>
      `${candidate.fromFinger}>${candidate.toFinger}`),
    ['LP>LR', 'LP>LI', 'LM>LR', 'LM>LI'],
  );

  const multiCalibration = {
    ...calibration,
    sameHandDifferentFingerActionsPerDirectedPair: {
      'LP>LR': 10,
      'LP>LI': 20,
      'LM>LR': 30,
      'LM>LI': 40,
    },
  };
  assert.equal(
    playbackStepDurationMs(analysis, 1, 1, false, multiCalibration),
    100,
    'Press×Press候補の先頭different-finger pairを既存規則どおり使う',
  );
});

test('Chain境界でHandTransitionが無い場合は元StrokeのTiming fallbackを使う', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LI', [key('f', 'LI', 4, 2)])),
    stroke(1, press('LI', [key('r', 'LI', 3.5, 1)], undefined, true, 3)),
  ], DEFAULT_CHAIN_POLICY);

  assert.equal(
    analysis.transitions.some((transition) => transition.toStrokeIndex === 1),
    false,
    '既定breakOnSameFingerでAnalysis Chain Transitionは生成されない',
  );
  assert.equal(
    playbackStepDurationMs(analysis, 1, 1, false, calibration),
    200,
    'Transitionが無くても通常速度fallbackを維持する',
  );
});

test('SFBの移動速度による律速はTransition Timing移行後も維持する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LI', [key('f', 'LI', 4, 2)])),
    stroke(1, press('LI', [key('r', 'LI', 3.5, 1)], undefined, true, 3)),
  ], keepSameFinger);

  assert.equal(
    playbackStepDurationMs(analysis, 1, 1, true, calibration),
    375,
  );
});

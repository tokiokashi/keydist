import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '#input/shapes/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '#trace/generate.ts';
import {
  analyzeStrokeTransitions,
  fingerRelation,
} from './transition.ts';
import { DEFAULT_CHAIN_POLICY } from './chain.ts';

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

const stroke = (index: number, presses: Press[]): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  aggregationGroupId: 'single',
  classifications: [],
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
  breakOnThumbOnly: false,
};

test('finger relationは左右の物理x方向と独立した解剖学的rankを使う', () => {
  assert.deepEqual(fingerRelation('LP', 'LM'), { direction: 'inward', step: 2 });
  assert.deepEqual(fingerRelation('RP', 'RM'), { direction: 'inward', step: 2 });
  assert.deepEqual(fingerRelation('LI', 'LR'), { direction: 'outward', step: 2 });
  assert.deepEqual(fingerRelation('RI', 'RR'), { direction: 'outward', step: 2 });
  assert.deepEqual(fingerRelation('LT', 'LT'), { direction: 'same', step: 0 });
});

test('1 Stroke / 1 handに複数Pressがある場合もPress×Press直積をすべて保持する', () => {
  const fromPresses = [
    press('LP', [key('a', 'LP', 1, 2)]),
    press('LM', [key('d', 'LM', 3, 2)]),
  ];
  const toPresses = [
    press('LR', [key('w', 'LR', 2, 1)]),
    press('LI', [key('r', 'LI', 4, 1)]),
  ];
  const strokes = [stroke(0, fromPresses), stroke(1, toPresses)];
  const result = analyzeStrokeTransitions(strokes, keepSameFinger);

  assert.equal(result.transitions.length, 1);
  const transition = result.transitions[0];
  assert.equal(transition.candidates.length, 4);
  assert.deepEqual(
    transition.candidates.map((candidate) => [candidate.fromFinger, candidate.toFinger]),
    [['LP', 'LR'], ['LP', 'LI'], ['LM', 'LR'], ['LM', 'LI']],
  );
  assert.equal(transition.candidates[0].fromKeys, strokes[0].presses[0].keys);
  assert.equal(transition.candidates[0].toKeys, strokes[1].presses[0].keys);
  assert.equal(transition.candidates[0].fromParticipationIndex, 0);
  assert.equal(transition.candidates[0].toParticipationIndex, 0);
});

test('飛び指とgeometry factをcandidate削減なしで保持する', () => {
  const strokes = [
    stroke(0, [press('LP', [key('a', 'LP', 0, 2)])]),
    stroke(1, [press('LI', [key('r', 'LI', 3.5, 1)], undefined, true)]),
  ];
  const candidate = analyzeStrokeTransitions(strokes, keepSameFinger)
    .transitions[0].candidates[0];

  assert.equal(candidate.fingerDirection, 'inward');
  assert.equal(candidate.fingerStep, 3);
  assert.equal(candidate.dx, 3.5);
  assert.equal(candidate.dy, -1);
});

test('右手のinwardは物理xが負でもinwardのまま', () => {
  const strokes = [
    stroke(0, [press('RP', [key(';', 'RP', 10, 2)])]),
    stroke(1, [press('RI', [key('j', 'RI', 7, 2)])]),
  ];
  const candidate = analyzeStrokeTransitions(strokes, keepSameFinger)
    .transitions[0].candidates[0];

  assert.equal(candidate.fingerDirection, 'inward');
  assert.equal(candidate.fingerStep, 3);
  assert.equal(candidate.dx, -3);
});

test('親指もTransition factから除外しない', () => {
  const strokes = [
    stroke(0, [press('LI', [key('f', 'LI', 4, 2)])]),
    stroke(1, [press('LT', [key('thumb-l', 'LT', 4.5, 4, 4)])]),
  ];
  const candidate = analyzeStrokeTransitions(strokes, keepSameFinger)
    .transitions[0].candidates[0];

  assert.deepEqual(
    [candidate.fromFinger, candidate.toFinger, candidate.fingerDirection, candidate.fingerStep],
    ['LI', 'LT', 'inward', 1],
  );
});

test('SFB event数と関与Strokeのunionを分離して取得する', () => {
  const strokes = [
    stroke(0, [press('LI', [key('f', 'LI', 4, 2)])]),
    stroke(1, [press('LI', [key('r', 'LI', 3.5, 1)])]),
    stroke(2, [press('LI', [key('v', 'LI', 4.25, 3)])]),
  ];
  const result = analyzeStrokeTransitions(strokes, keepSameFinger);

  assert.equal(result.sfbEvents.length, 2);
  assert.deepEqual(result.sfbEvents.map((event) => event.transitionIndex), [0, 1]);
  assert.deepEqual(result.sfbStrokeIndexes, [0, 1, 2]);
  assert.equal(result.transitions[0].candidates[0].fingerDirection, 'same');
  assert.equal(result.transitions[1].candidates[0].fingerDirection, 'same');
});

test('1 Transitionにsame candidateが複数あってもSFB Eventは1件でcandidate indexを全保持する', () => {
  const result = analyzeStrokeTransitions([
    stroke(0, [
      press('LI', [key('f1', 'LI', 4, 2)]),
      press('LI', [key('f2', 'LI', 4.2, 2)]),
    ]),
    stroke(1, [
      press('LI', [key('r1', 'LI', 3.5, 1)]),
      press('LI', [key('r2', 'LI', 3.7, 1)]),
    ]),
  ], keepSameFinger);

  assert.equal(result.transitions.length, 1);
  assert.equal(result.transitions[0].candidates.length, 4);
  assert.equal(result.sfbEvents.length, 1);
  assert.deepEqual(result.sfbEvents[0].candidateIndexes, [0, 1, 2, 3]);
  assert.deepEqual(result.sfbStrokeIndexes, [0, 1]);
});

test('Analysis Chain境界を跨ぐTransitionは生成しない', () => {
  const result = analyzeStrokeTransitions([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LI', [key('f', 'LI', 4, 2)])]),
    stroke(2, [press('RI', [key('j', 'RI', 7, 2)])]),
    stroke(3, [press('LM', [key('d', 'LM', 3, 2)])]),
  ], keepSameFinger);

  assert.deepEqual(
    result.transitions.map((transition) => [
      transition.hand,
      transition.fromStrokeIndex,
      transition.toStrokeIndex,
    ]),
    [['left', 0, 1]],
  );
});

test('既定breakOnSameFinger=trueでは非親指SFB StrokeがChain境界になりSFB Transitionを作らない', () => {
  const result = analyzeStrokeTransitions([
    stroke(0, [press('LI', [key('f', 'LI', 4, 2)])]),
    stroke(1, [press('LI', [key('r', 'LI', 3.5, 1)], undefined, true)]),
    stroke(2, [press('LM', [key('d', 'LM', 3, 2)])]),
  ]);

  assert.deepEqual(
    result.chains.map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 1], [2, 3]],
  );
  assert.equal(result.transitions.length, 0);
  assert.equal(result.sfbEvents.length, 0);
});

test('Transition / candidate / SFB結果は1回の解析内でimmutable index契約を持つ', () => {
  const result = analyzeStrokeTransitions([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LR', [key('s', 'LR', 2, 2)])]),
  ], keepSameFinger);

  assert.deepEqual(result.transitions.map((transition) => transition.transitionIndex), [0]);
  assert.equal(result.transitions[0].chainIndex, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.transitions), true);
  assert.equal(Object.isFrozen(result.transitions[0]), true);
  assert.equal(Object.isFrozen(result.transitions[0].candidates), true);
  assert.equal(Object.isFrozen(result.transitions[0].candidates[0]), true);
  assert.equal(Object.isFrozen(result.sfbEvents), true);
  assert.equal(Object.isFrozen(result.sfbStrokeIndexes), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type {
  ParticipationRole,
  Press,
  Stroke,
  StrokeParticipation,
} from '../src/evaluate.ts';
import {
  analyzeStrokeRolls,
  isRollEligibleStroke,
  transitionsForStrokeSpan,
} from '../src/analysis-roll.ts';
import { DEFAULT_CHAIN_POLICY } from '../src/analysis-chain.ts';

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

interface PressSemantic {
  press: Press;
  roles?: readonly ParticipationRole[];
  holdPhase?: StrokeParticipation['holdPhase'];
}

const stroke = (index: number, entries: PressSemantic[]): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  layerId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: entries.map(({ press: p, roles = ['output'], holdPhase }) => ({
    hand: p.finger.startsWith('L') ? 'left' : 'right',
    finger: p.finger,
    keys: p.keys,
    roles,
    ...(holdPhase === undefined ? {} : { holdPhase }),
  })),
  presses: entries.map((entry) => entry.press),
  distance: 0,
  positions: {} as Stroke['positions'],
});

const output = (p: Press): PressSemantic => ({ press: p, roles: ['output'] });
const keepSameFinger = {
  ...DEFAULT_CHAIN_POLICY,
  breakOnSameFinger: false,
  breakOnThumbOnly: false,
};

test('A → B → C → D はmaximal LongRoll 1件だけで部分LongRoll/TwoRollを作らない', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
    stroke(2, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
    stroke(3, [output(press('LI', [key('f', 'LI', 4, 2)]))]),
  ], keepSameFinger);

  assert.deepEqual(result.longRolls, [{
    chainIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 4,
    direction: 'inward',
  }]);
  assert.deepEqual(result.twoRolls, []);

  const transitions = transitionsForStrokeSpan(result, 0, 0, 4);
  assert.deepEqual(transitions.map((transition) => transition.transitionIndex), [0, 1, 2]);
});

test('A → B ← C はend側Redirect pivotだけをTwoRollから除外する', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
    stroke(2, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
  ], keepSameFinger);

  assert.deepEqual(result.redirects.map((redirect) => redirect.pivotStrokeIndex), [1]);
  assert.deepEqual(result.longRolls, []);
  assert.deepEqual(result.twoRolls, [{
    chainIndex: 0,
    startStrokeIndex: 1,
    endStrokeIndex: 3,
    direction: 'outward',
  }]);
});

test('same TransitionはLongRollを切るがstructural fact自体は残す', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
    stroke(2, [output(press('LR', [key('w', 'LR', 2, 1)], undefined, true))]),
    stroke(3, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
  ], keepSameFinger);

  assert.equal(result.transitions[1].candidates[0].fingerDirection, 'same');
  assert.equal(result.sfbEvents.length, 1);
  assert.deepEqual(result.longRolls, []);
  assert.deepEqual(result.twoRolls.map((roll) => [
    roll.startStrokeIndex,
    roll.endStrokeIndex,
    roll.direction,
  ]), [
    [0, 2, 'inward'],
    [2, 4, 'inward'],
  ]);
});

test('対象手の複数Press Strokeはcandidate選択でpure Rollへ迂回しない', () => {
  const pivot = stroke(1, [
    output(press('LM', [key('d', 'LM', 3, 2)])),
    output(press('LI', [key('f', 'LI', 4, 2)])),
  ]);
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    pivot,
    stroke(2, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
  ], keepSameFinger);

  assert.equal(isRollEligibleStroke(pivot, 'left'), false);
  assert.ok(result.redirects.length >= 1, '同じfixtureでもRedirectのexistential candidateは成立する');
  assert.deepEqual(result.longRolls, []);
  assert.deepEqual(result.twoRolls, []);
});

test('opposite-handの同一Stroke内新規trigger activationはpure Rollを分断する', () => {
  const middle = stroke(1, [
    output(press('LM', [key('d', 'LM', 3, 2)])),
    {
      press: press('RT', [key('thumb-r', 'RT', 7, 4, 4)]),
      roles: ['trigger'],
    },
  ]);
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    middle,
    stroke(2, [output(press('LI', [key('f', 'LI', 4, 2)]))]),
  ], keepSameFinger);

  assert.equal(isRollEligibleStroke(middle, 'left'), false);
  assert.deepEqual(result.longRolls.filter((roll) => roll.chainIndex === 0), []);
  assert.deepEqual(result.twoRolls.filter((roll) => roll.chainIndex === 0), []);
});

test('opposite-hand held-trigger/continueだけならpure Rollを分断しない', () => {
  const middle = stroke(1, [
    output(press('LM', [key('d', 'LM', 3, 2)])),
    {
      press: press('RT', [key('thumb-r', 'RT', 7, 4, 4)]),
      roles: ['held-trigger'],
      holdPhase: 'continue',
    },
  ]);
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
    middle,
    stroke(2, [output(press('LI', [key('f', 'LI', 4, 2)]))]),
  ], keepSameFinger);

  assert.equal(isRollEligibleStroke(middle, 'left'), true);
  assert.deepEqual(result.longRolls.filter((roll) => roll.chainIndex === 0), [{
    chainIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 3,
    direction: 'inward',
  }]);
});

test('output roleの親指を含むstructural LongRollをArpeggio設定なしで保持する', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
    stroke(1, [output(press('LI', [key('f', 'LI', 4, 2)]))]),
    stroke(2, [output(press('LT', [key('thumb-l', 'LT', 4.5, 4, 4)]))]),
  ], keepSameFinger);

  assert.deepEqual(result.longRolls, [{
    chainIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 3,
    direction: 'inward',
  }]);
});

test('trigger-onlyの親指はRoll構成指にしない', () => {
  const trigger = stroke(1, [{
    press: press('LT', [key('thumb-l', 'LT', 4.5, 4, 4)]),
    roles: ['trigger'],
  }]);

  assert.equal(isRollEligibleStroke(trigger, 'left'), false);
});

test('finger jumpだけではLongRollから除外しない', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
    stroke(2, [output(press('LI', [key('f', 'LI', 4, 2)]))]),
  ], keepSameFinger);

  assert.deepEqual(result.longRolls, [{
    chainIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 3,
    direction: 'inward',
  }]);
  assert.deepEqual(
    result.transitions.map((transition) => transition.candidates[0].fingerStep),
    [2, 1],
  );
});

test('trigger-only Strokeを列の中間に置くとpure LongRollを分断する', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [{
      press: press('LT', [key('thumb-l', 'LT', 4.5, 4, 4)]),
      roles: ['trigger'],
    }]),
    stroke(2, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
  ], {
    ...keepSameFinger,
    breakOnTriggerOnly: false,
  });

  assert.equal(result.transitions.length, 2);
  assert.deepEqual(result.longRolls, []);
  assert.deepEqual(result.twoRolls, []);
});

test('standalone TwoRollを正例として保持しLongRollとは排他的になる', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
  ], keepSameFinger);

  assert.deepEqual(result.longRolls, []);
  assert.deepEqual(result.twoRolls, [{
    chainIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 2,
    direction: 'inward',
  }]);
});

test('Roll resultはimmutableでLongRollとTwoRollが排他的', () => {
  const result = analyzeStrokeRolls([
    stroke(0, [output(press('LP', [key('a', 'LP', 1, 2)]))]),
    stroke(1, [output(press('LR', [key('s', 'LR', 2, 2)]))]),
    stroke(2, [output(press('LM', [key('d', 'LM', 3, 2)]))]),
  ], keepSameFinger);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.longRolls), true);
  assert.equal(Object.isFrozen(result.longRolls[0]), true);
  assert.equal(Object.isFrozen(result.twoRolls), true);

  for (const twoRoll of result.twoRolls) {
    assert.equal(result.longRolls.some((longRoll) =>
      longRoll.chainIndex === twoRoll.chainIndex
      && longRoll.startStrokeIndex <= twoRoll.startStrokeIndex
      && twoRoll.endStrokeIndex <= longRoll.endStrokeIndex), false);
  }
});

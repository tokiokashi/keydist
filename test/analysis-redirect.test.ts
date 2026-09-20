import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import {
  analyzeStrokeRedirects,
  buildRedirectEvents,
  redirectGeometryQualities,
} from '../src/analysis-redirect.ts';
import {
  type FingerTransition,
  type HandTransition,
  type TransitionAnalysisResult,
} from '../src/analysis-transition.ts';
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
  layerId: 'single',
  inputRole: 'layer',
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
};

test('A -> B <- C はpivot=BのRedirectEvent 1件になる', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 3, 2)])]),
    stroke(2, [press('LR', [key('s', 'LR', 2, 2)])]),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  const event = result.redirects[0];
  assert.equal(event.pivotStrokeIndex, 1);
  assert.equal(event.beforeTransitionIndex, 0);
  assert.equal(event.afterTransitionIndex, 1);
  assert.deepEqual(event.candidates.map((candidate) => [
    candidate.fromFinger,
    candidate.pivotFinger,
    candidate.toFinger,
  ]), [['LP', 'LM', 'LR']]);
});

test('複数RedirectCandidate pathが成立しても3 Stroke windowのEventは1件', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [
      press('LP', [key('a', 'LP', 1, 2)]),
      press('LR', [key('s', 'LR', 2, 2)]),
    ]),
    stroke(1, [
      press('LM', [key('d', 'LM', 3, 2)]),
      press('LI', [key('f', 'LI', 4, 2)]),
    ]),
    stroke(2, [
      press('LP', [key('q', 'LP', 1, 1)]),
      press('LR', [key('w', 'LR', 2, 1)]),
    ]),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  assert.equal(result.redirects[0].candidates.length, 8);
  assert.deepEqual(
    result.redirects[0].candidates.map((candidate) => [
      candidate.fromFinger,
      candidate.pivotFinger,
      candidate.toFinger,
    ]),
    [
      ['LP', 'LM', 'LP'],
      ['LP', 'LM', 'LR'],
      ['LP', 'LI', 'LP'],
      ['LP', 'LI', 'LR'],
      ['LR', 'LM', 'LP'],
      ['LR', 'LM', 'LR'],
      ['LR', 'LI', 'LP'],
      ['LR', 'LI', 'LR'],
    ],
  );
  assert.deepEqual(
    result.redirects[0].candidates.map((candidate) => candidate.candidateIndex),
    result.redirects[0].candidates.map((_, index) => index),
  );
});

test('pivot Strokeが同一手の複数Pressでも同じpivot Pressを通る反転pathは保持する', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [
      press('LM', [key('d', 'LM', 3, 2)]),
      press('LI', [key('f', 'LI', 4, 2)]),
    ]),
    stroke(2, [press('LR', [key('s', 'LR', 2, 2)])]),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  const event = result.redirects[0];
  assert.ok(event.candidates.some((candidate) => candidate.pivotFinger === 'LM'));
  assert.ok(event.candidates.some((candidate) => candidate.pivotFinger === 'LI'));
  // 同じfixtureを#208でpure Roll側の複数Press除外にも使う。
});

const candidate = (
  candidateIndex: number,
  fromFinger: Finger,
  toFinger: Finger,
  fromPressIndex: number,
  toPressIndex: number,
  direction: FingerTransition['fingerDirection'],
): FingerTransition => ({
  candidateIndex,
  fromPressIndex,
  toPressIndex,
  fromParticipationIndex: fromPressIndex,
  toParticipationIndex: toPressIndex,
  fromFinger,
  toFinger,
  fromKeys: [],
  toKeys: [],
  fingerDirection: direction,
  fingerStep: 1,
  dx: 0,
  dy: 0,
});

test('before/afterで別pivot Pressしか成立しない場合は架空のRedirectCandidateを継ぎ接ぎしない', () => {
  const transitions: HandTransition[] = [
    {
      transitionIndex: 0,
      chainIndex: 0,
      hand: 'left',
      fromStrokeIndex: 0,
      toStrokeIndex: 1,
      candidates: [
        candidate(0, 'LP', 'LM', 0, 0, 'inward'),
      ],
    },
    {
      transitionIndex: 1,
      chainIndex: 0,
      hand: 'left',
      fromStrokeIndex: 1,
      toStrokeIndex: 2,
      candidates: [
        candidate(0, 'LR', 'LP', 1, 0, 'outward'),
      ],
    },
  ];
  const analysis = {
    chains: [{
      chainIndex: 0,
      rawRunIndex: 0,
      hand: 'left',
      startStrokeIndex: 0,
      endStrokeIndex: 3,
    }],
    transitions,
  } as unknown as TransitionAnalysisResult;

  assert.deepEqual(buildRedirectEvents(analysis), []);
});

test('連続方向反転は重なる個別RedirectEventとして保持する', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 3, 2)])]),
    stroke(2, [press('LR', [key('s', 'LR', 2, 2)])]),
    stroke(3, [press('LI', [key('f', 'LI', 4, 2)])]),
    stroke(4, [press('LP', [key('q', 'LP', 1, 1)])]),
  ], keepSameFinger);

  assert.deepEqual(result.redirects.map((event) => event.pivotStrokeIndex), [1, 2, 3]);
  assert.deepEqual(result.redirects.map((event) => event.redirectIndex), [0, 1, 2]);
});

test('same Transitionを方向反転として誤認しない', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 3, 2)])]),
    stroke(2, [press('LM', [key('e', 'LM', 2.5, 1)])]),
  ], keepSameFinger);

  assert.equal(result.transitions[1].candidates[0].fingerDirection, 'same');
  assert.equal(result.redirects.length, 0);
});

test('Chain境界を跨いでRedirectEventを生成しない', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 3, 2)], undefined, true)]),
    stroke(2, [press('LR', [key('s', 'LR', 2, 2)])]),
  ]);

  assert.equal(result.redirects.length, 0);
  assert.equal(result.transitions.length, 0);
});

test('横方向折り返し振幅はphysical dxの引き返し共通量としてcandidateごとに導出する', () => {
  const qualityFor = (xs: readonly [number, number, number]) => {
    const result = analyzeStrokeRedirects([
      stroke(0, [press('LP', [key('a', 'LP', xs[0], 2)])]),
      stroke(1, [press('LM', [key('d', 'LM', xs[1], 2)])]),
      stroke(2, [press('LR', [key('s', 'LR', xs[2], 2)])]),
    ], keepSameFinger);
    assert.equal(result.redirects.length, 1);
    const qualities = redirectGeometryQualities(result, result.redirects[0]);
    assert.equal(qualities.length, 1);
    return qualities[0];
  };

  assert.deepEqual(qualityFor([0, 1, 0.75]), {
    candidateIndex: 0,
    beforeDx: 1,
    afterDx: -0.25,
    horizontalReversal: 0.25,
  });
  assert.deepEqual(qualityFor([0, 2, 0.5]), {
    candidateIndex: 0,
    beforeDx: 2,
    afterDx: -1.5,
    horizontalReversal: 1.5,
  });
  assert.deepEqual(qualityFor([0, 2, 1.75]), {
    candidateIndex: 0,
    beforeDx: 2,
    afterDx: -0.25,
    horizontalReversal: 0.25,
  });
});

test('finger-direction上はRedirectでもphysical xが反転しなければhorizontalReversalは0', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 0, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 1, 2)])]),
    stroke(2, [press('LR', [key('s', 'LR', 1.5, 2)])]),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  assert.deepEqual(
    redirectGeometryQualities(result, result.redirects[0]),
    [{
      candidateIndex: 0,
      beforeDx: 1,
      afterDx: 0.5,
      horizontalReversal: 0,
    }],
  );
});

test('片側のphysical dxが0ならhorizontalReversalは0', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 0, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 1, 2)])]),
    stroke(2, [press('LR', [key('s', 'LR', 1, 2)])]),
  ], keepSameFinger);

  assert.equal(result.redirects.length, 1);
  assert.deepEqual(
    redirectGeometryQualities(result, result.redirects[0]),
    [{
      candidateIndex: 0,
      beforeDx: 1,
      afterDx: 0,
      horizontalReversal: 0,
    }],
  );
});

test('複数RedirectCandidateのgeometry qualityをevent単位へ集約せず全件保持する', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [
      press('LP', [key('a', 'LP', 0, 2)]),
      press('LR', [key('s', 'LR', 1, 2)]),
    ]),
    stroke(1, [
      press('LM', [key('d', 'LM', 3, 2)]),
      press('LI', [key('f', 'LI', 4, 2)]),
    ]),
    stroke(2, [
      press('LP', [key('q', 'LP', 0.5, 1)]),
      press('LR', [key('w', 'LR', 2.5, 1)]),
    ]),
  ], keepSameFinger);

  const event = result.redirects[0];
  const qualities = redirectGeometryQualities(result, event);
  assert.equal(qualities.length, event.candidates.length);
  assert.deepEqual(
    qualities.map((quality) => quality.candidateIndex),
    event.candidates.map((candidate) => candidate.candidateIndex),
  );
  assert.equal(Object.isFrozen(qualities), true);
  assert.ok(qualities.every((quality) => Object.isFrozen(quality)));
  assert.ok(new Set(qualities.map((quality) => quality.horizontalReversal)).size > 1);
});

test('Redirect result / Event / candidateはimmutableな結果内indexとして保持する', () => {
  const result = analyzeStrokeRedirects([
    stroke(0, [press('LP', [key('a', 'LP', 1, 2)])]),
    stroke(1, [press('LM', [key('d', 'LM', 3, 2)])]),
    stroke(2, [press('LR', [key('s', 'LR', 2, 2)])]),
  ], keepSameFinger);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.redirects), true);
  assert.equal(Object.isFrozen(result.redirects[0]), true);
  assert.equal(Object.isFrozen(result.redirects[0].candidates), true);
  assert.equal(Object.isFrozen(result.redirects[0].candidates[0]), true);
});

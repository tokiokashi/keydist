import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import {
  aggregateBigramVectors,
  buildBigramVectors,
  directionSummary,
  filterBigramVectors,
  type BigramVector,
} from '../src/bigram-vectors.ts';

const key = (id: string, finger: Finger, x: number, y = 2): Key => ({
  id,
  finger,
  x,
  y,
  row: 2,
  col: 0,
});

const press = (
  finger: Finger,
  id: string,
  x: number,
  y = 2,
  target?: Point,
): Press => ({
  finger,
  keys: [key(id, finger, x, y)],
  target: target ?? { x, y },
  gap: 1,
  distance: 0,
  sfb: false,
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

test('Actualは隣接Strokeだけ、Within-handは反対手を飛ばした手内bigramを作る', () => {
  const strokes = [
    stroke(0, [press('LI', 'f', 4)]),
    stroke(1, [press('RI', 'j', 7)]),
    stroke(2, [press('LM', 'd', 3)]),
  ];

  const actual = buildBigramVectors(strokes, 'actual');
  assert.deepEqual(
    actual.map((vector) => [vector.fromFinger, vector.toFinger, vector.hand]),
    [
      ['LI', 'RI', 'cross'],
      ['RI', 'LM', 'cross'],
    ],
  );

  const withinHand = buildBigramVectors(strokes, 'within-hand');
  assert.deepEqual(
    withinHand.map((vector) => [
      vector.fromStrokeIndex,
      vector.toStrokeIndex,
      vector.fromFinger,
      vector.toFinger,
      vector.hand,
    ]),
    [[0, 2, 'LI', 'LM', 'left']],
  );
  assert.equal(withinHand[0].dx, -1);
  assert.equal(withinHand[0].fingerDirection, 'outward');
});

test('Within-handは同じ手の親指Strokeを飛び越えない', () => {
  const strokes = [
    stroke(0, [press('LI', 'f', 4)]),
    stroke(1, [press('LT', 'thumb-l', 4.5, 4)]),
    stroke(2, [press('LM', 'd', 3)]),
  ];

  assert.deepEqual(buildBigramVectors(strokes, 'within-hand'), []);
});

test('1指選択は関与vector、2指選択は押し順によらない指ペアだけを残す', () => {
  const vectors = buildBigramVectors([
    stroke(0, [press('LP', 'a', 1)]),
    stroke(1, [press('LM', 'd', 3)]),
    stroke(2, [press('LI', 'f', 4)]),
    stroke(3, [press('LM', 'd', 3)]),
  ], 'actual');

  assert.deepEqual(
    filterBigramVectors(vectors, ['middle']).map((vector) => [
      vector.fromFingerClass,
      vector.toFingerClass,
    ]),
    [
      ['pinky', 'middle'],
      ['middle', 'index'],
      ['index', 'middle'],
    ],
  );

  assert.deepEqual(
    filterBigramVectors(vectors, ['middle', 'index']).map((vector) => [
      vector.fromFingerClass,
      vector.toFingerClass,
    ]),
    [
      ['middle', 'index'],
      ['index', 'middle'],
    ],
  );
});

test('同一物理vectorはweightへ集約する', () => {
  const vectors = buildBigramVectors([
    stroke(0, [press('LI', 'f', 4)]),
    stroke(1, [press('LM', 'd', 3)]),
    stroke(2, [press('LI', 'f', 4)]),
    stroke(3, [press('LM', 'd', 3)]),
  ], 'actual');

  const aggregated = aggregateBigramVectors(vectors);
  const outward = aggregated.find(
    (vector) => vector.fromFinger === 'LI' && vector.toFinger === 'LM',
  );
  assert.equal(outward?.weight, 2);
});

function vector(overrides: Partial<BigramVector>): BigramVector {
  return {
    id: 'v',
    source: 'actual',
    fromStrokeIndex: 0,
    toStrokeIndex: 1,
    fromFinger: 'LP',
    toFinger: 'LI',
    fromFingerClass: 'pinky',
    toFingerClass: 'index',
    fromKeyIds: ['a'],
    toKeyIds: ['f'],
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    hand: 'left',
    fingerDirection: 'inward',
    dx: 1,
    dy: 0,
    distance: 1,
    angle: 0,
    weight: 1,
    ...overrides,
  };
}

test('mean resultantは距離ではなく単位方向をfrequency-weightedで合成する', () => {
  const summary = directionSummary([
    vector({ dx: 10, distance: 10, weight: 1 }),
    vector({ dx: 1, distance: 1, weight: 1, id: 'v2' }),
  ], 'left');

  assert.equal(summary.x, 1);
  assert.equal(summary.y, 0);
  assert.equal(summary.magnitude, 1);
  assert.equal(summary.directionalWeight, 2);
});

test('逆方向が同数ならmean resultantの集中度は0になる', () => {
  const summary = directionSummary([
    vector({ id: 'right', dx: 1, distance: 1, angle: 0 }),
    vector({
      id: 'left',
      fromFinger: 'LI',
      toFinger: 'LP',
      fromFingerClass: 'index',
      toFingerClass: 'pinky',
      fingerDirection: 'outward',
      dx: -1,
      distance: 1,
      angle: Math.PI,
    }),
  ], 'left');

  assert.ok(summary.magnitude < 1e-12);
  assert.equal(summary.inwardWeight, 1);
  assert.equal(summary.outwardWeight, 1);
});

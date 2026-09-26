import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeOutgoingMaxWeight,
  orderKeyboardFlowVectors,
  resolveKeyboardFlowMaxWeight,
  scaleKeyboardFlowWeight,
} from './options.ts';

const vectors = [
  { id: 'same-heavy', hand: 'left' as const, weight: 9, distance: 1 },
  { id: 'cross-heavy', hand: 'cross' as const, weight: 8, distance: 1 },
  { id: 'same-light', hand: 'right' as const, weight: 2, distance: 1 },
  { id: 'cross-light', hand: 'cross' as const, weight: 1, distance: 1 },
  { id: 'repeat', hand: 'left' as const, weight: 99, distance: 0 },
];

test('keyboard flow weight scale keeps linear as the default shape and expands lower weights', () => {
  assert.equal(scaleKeyboardFlowWeight(4, 16, 'linear'), 0.25);
  assert.equal(scaleKeyboardFlowWeight(4, 16, 'sqrt'), 0.5);
  assert.ok(scaleKeyboardFlowWeight(4, 16, 'log') > 0.25);
  assert.equal(scaleKeyboardFlowWeight(16, 16, 'linear'), 1);
  assert.equal(scaleKeyboardFlowWeight(16, 16, 'sqrt'), 1);
  assert.equal(scaleKeyboardFlowWeight(16, 16, 'log'), 1);
});

test('weight order draws thick edges first so thin edges land on top', () => {
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'weight').map((vector) => vector.id),
    ['same-heavy', 'cross-heavy', 'same-light', 'cross-light'],
  );
});

test('same-hand and cross-hand priorities only change group z-order', () => {
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'same-hand-top').map((vector) => vector.id),
    ['cross-heavy', 'cross-light', 'same-heavy', 'same-light'],
  );
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'cross-hand-top').map((vector) => vector.id),
    ['same-heavy', 'same-light', 'cross-heavy', 'cross-light'],
  );
});

const outgoingVectors = [
  { weight: 3, fromKeyIds: ['A'] },
  { weight: 9, fromKeyIds: ['A', 'B'] },
  { weight: 20, fromKeyIds: ['B'] },
];

test('computeOutgoingMaxWeight limits the max weight to edges starting at the hovered key', () => {
  assert.equal(computeOutgoingMaxWeight(outgoingVectors, 'A'), 9);
  assert.equal(computeOutgoingMaxWeight(outgoingVectors, 'B'), 20);
  assert.equal(computeOutgoingMaxWeight(outgoingVectors, 'C'), 0);
  assert.equal(computeOutgoingMaxWeight(outgoingVectors, null), 0);
});

test('resolveKeyboardFlowMaxWeight uses the key-local max only for the hovered key\'s outgoing edges under "key" scale', () => {
  const outgoing = { weight: 9, fromKeyIds: ['A', 'B'] };
  const notOutgoing = { weight: 20, fromKeyIds: ['B'] };

  // "key"設定 + ホバー中 + 始点一致 -> key-local max
  assert.equal(resolveKeyboardFlowMaxWeight(outgoing, 100, 9, 'key', 'A'), 9);
  // "key"設定 + ホバー中だが始点不一致 -> global max のまま
  assert.equal(resolveKeyboardFlowMaxWeight(notOutgoing, 100, 9, 'key', 'A'), 100);
  // "global"設定 -> 常にglobal max
  assert.equal(resolveKeyboardFlowMaxWeight(outgoing, 100, 9, 'global', 'A'), 100);
  // ホバーなし -> 常にglobal max
  assert.equal(resolveKeyboardFlowMaxWeight(outgoing, 100, 9, 'key', null), 100);
});

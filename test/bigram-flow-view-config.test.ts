import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderKeyboardFlowVectors,
  scaleKeyboardFlowWeight,
} from '../src/features/bigram-vector/bigram-flow-view-config.ts';

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

test('weight order preserves the current thin-to-thick drawing order', () => {
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'weight').map((vector) => vector.id),
    ['cross-light', 'same-light', 'cross-heavy', 'same-heavy'],
  );
});

test('same-hand and cross-hand priorities only change group z-order', () => {
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'same-hand-top').map((vector) => vector.id),
    ['cross-light', 'cross-heavy', 'same-light', 'same-heavy'],
  );
  assert.deepEqual(
    orderKeyboardFlowVectors(vectors, 'cross-hand-top').map((vector) => vector.id),
    ['same-light', 'same-heavy', 'cross-light', 'cross-heavy'],
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { countStates, excessState, stateShares } from './excess-distribution.ts';

test('浮動小数の誤差だけ違う値は同じ状態に数える', () => {
  // 0.1 + 0.2 は 0.30000000000000004 で、0.3 と1ビット違う
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(excessState(0.1 + 0.2), excessState(0.3));
  // 同じ長さを別の順序で作った値（hypotと平方根）
  const a = Math.hypot(0.25, 1) - 1;
  const b = Math.sqrt(0.25 ** 2 + 1) - 1;
  const counts = countStates([a, b, a + 1e-13, a - 1e-13]);
  assert.equal(counts.size, 1);
  assert.equal([...counts.values()][0], 4);
});

test('引き算で0に残る誤差と、-0は状態0に揃う', () => {
  const residue = 0.1 + 0.2 - 0.3;
  assert.ok(residue !== 0);
  assert.ok(Object.is(excessState(-0), 0));
  assert.ok(Object.is(excessState(-1e-17), 0));
  const counts = countStates([0, -0, residue, -residue]);
  assert.deepEqual([...counts], [[0, 4]]);
});

test('丸めの桁（小数第6位）より細かい差は同じ状態、粗い差は別の状態', () => {
  assert.equal(excessState(0.2500001), excessState(0.25));
  assert.notEqual(excessState(0.25001), excessState(0.25));
  assert.equal(excessState(0.25), 0.25);
  assert.equal(excessState(-0.0123456789), -0.012346);
});

test('割合は状態の昇順で、総和が100%になる', () => {
  const shares = stateShares(countStates([0.25, 0, 0, -0.5, 0.25, 0, 0, 0]));
  assert.deepEqual(shares.map((item) => item.state), [-0.5, 0, 0.25]);
  assert.deepEqual(shares.map((item) => item.count), [1, 5, 2]);
  assert.deepEqual(shares.map((item) => item.share), [12.5, 62.5, 25]);
  assert.equal(shares.reduce((sum, item) => sum + item.share, 0), 100);
});

test('打鍵が0件なら状態は無い', () => {
  assert.equal(countStates([]).size, 0);
  assert.deepEqual(stateShares(new Map()), []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { heatIntensity } from './heatmap-figure.ts';

test('色の強度の線形と対数。最大値が0以下でも割り算で壊れない', () => {
  assert.equal(heatIntensity(5, 10, 'linear'), 0.5);
  assert.equal(heatIntensity(0, 10, 'linear'), 0);
  assert.equal(heatIntensity(10, 10, 'linear'), 1);
  assert.equal(heatIntensity(9, 99, 'log'), Math.log(10) / Math.log(100));
  assert.equal(heatIntensity(10, 10, 'log'), 1);
  assert.equal(heatIntensity(0, 0, 'linear'), 0);
  assert.equal(heatIntensity(0, 0, 'log'), 0);
});

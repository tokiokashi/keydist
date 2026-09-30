import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeYRange, N_SENSITIVITY_Y_RANGE_MODE } from './y-range.ts';

const relative = [100, 100, 90, 77, 65, 97, 85, 82];

test('既定は0から始める決め方（縦軸の見た目を変えない）', () => {
  assert.equal(N_SENSITIVITY_Y_RANGE_MODE, 'full');
});

test('full: 相対は0〜100%を20%刻み、実測は0〜最大値', () => {
  assert.deepEqual(computeYRange('full', true, relative), { lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] });
  const absolute = computeYRange('full', false, [380, 250, 170]);
  assert.equal(absolute.lo, 0);
  assert.equal(absolute.hi, 380);
  assert.equal(absolute.ticks.length, 6);
});

test('fit: 値のある範囲に合わせ、相対の上限は100%のまま', () => {
  assert.deepEqual(computeYRange('fit', true, relative), { lo: 60, hi: 100, ticks: [60, 70, 80, 90, 100] });
  const absolute = computeYRange('fit', false, [380, 250, 170]);
  assert.ok(absolute.lo > 0 && absolute.lo <= 170);
  assert.ok(absolute.hi >= 380);
});

test('coarse: 0〜最大を4等分した区切りへ下限を切り下げる', () => {
  assert.deepEqual(computeYRange('coarse', true, relative), { lo: 50, hi: 100, ticks: [50, 75, 100] });
  assert.equal(computeYRange('coarse', true, [100, 20]).lo, 0);
});

test('値が上限に張り付く時（全点が100%）と空の時は、詰めずに0から', () => {
  assert.equal(computeYRange('fit', true, [100, 100]).lo, 0);
  assert.equal(computeYRange('fit', true, []).lo, 0);
});

test('どの決め方でも、範囲は全点を含む', () => {
  for (const mode of ['full', 'fit', 'coarse'] as const) {
    const range = computeYRange(mode, false, [380.8, 247.3, 168.6, 137.7]);
    assert.ok(range.lo <= 137.7 && range.hi >= 380.8, mode);
  }
});

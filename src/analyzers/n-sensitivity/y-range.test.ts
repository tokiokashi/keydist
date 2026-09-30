import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeYRange, formatYTicks } from './y-range.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS } from './options.ts';

const relative = [100, 100, 90, 77, 65, 97, 85, 82];

test('既定は0から始める決め方（縦軸の見た目を変えない）', () => {
  assert.equal(DEFAULT_N_SENSITIVITY_OPTIONS.yRange, 'full');
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

test('coarse: 相対は4等分した区切りへ下限を切り下げる', () => {
  assert.deepEqual(computeYRange('coarse', true, relative), { lo: 50, hi: 100, ticks: [50, 75, 100] });
  assert.equal(computeYRange('coarse', true, [100, 20]).lo, 0);
});

test('coarse: 実測の目盛りはきりのよい値（区切りの悪い最大値をそのまま4等分しない）', () => {
  const range = computeYRange('coarse', false, [380.8, 247.3, 168.6, 137.7]);
  assert.deepEqual(range, { lo: 100, hi: 400, ticks: [100, 200, 300, 400] });
  assert.deepEqual(formatYTicks(false, range.ticks), ['100 u', '200 u', '300 u', '400 u']);
});

test('値が上限に張り付く時（全点が100%）と空の時は、詰めずに0から', () => {
  assert.equal(computeYRange('fit', true, [100, 100]).lo, 0);
  assert.equal(computeYRange('fit', true, []).lo, 0);
});

test('どの決め方でも、範囲は全点を含む', () => {
  for (const mode of ['full', 'fit', 'coarse'] as const) {
    for (const relativeScale of [true, false]) {
      const values = relativeScale ? [100, 99.6, 99.55, 99.9] : [380.8, 247.3, 168.6, 137.7];
      const range = computeYRange(mode, relativeScale, values);
      assert.ok(range.lo <= Math.min(...values) && range.hi >= Math.max(...values), `${mode} ${relativeScale}`);
    }
  }
});

test('値の幅がごく狭い時、目盛りは小数で書き分け、同じ文字が並ばない', () => {
  const range = computeYRange('fit', true, [100, 100, 99.9, 99.7, 99.55]);
  const labels = formatYTicks(true, range.ticks);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.some((label) => /\.\d%$/.test(label)), labels.join(' '));
  assert.ok(range.ticks.every((tick) => Number.isFinite(tick)));
});

test('整数の刻みなら小数を付けない（従来の見た目のまま）', () => {
  assert.deepEqual(formatYTicks(true, [0, 20, 40, 60, 80, 100]), ['0%', '20%', '40%', '60%', '80%', '100%']);
  assert.deepEqual(formatYTicks(false, [0, 76.16, 152.32]), ['0 u', '76 u', '152 u']);
});

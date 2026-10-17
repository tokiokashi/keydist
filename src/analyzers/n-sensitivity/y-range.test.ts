import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeYRange, formatYTicks, yValuesRange } from './y-range.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS } from './options.ts';

const relative = [100, 100, 90, 77, 65, 97, 85, 82];

test('既定は0から始める決め方（縦軸の見た目を変えない）', () => {
  assert.equal(DEFAULT_N_SENSITIVITY_OPTIONS.yRange, 'full');
});

test('full: 相対は0〜100%を20%刻み、実測は0〜最大値', () => {
  assert.deepEqual(computeYRange('full', 'ratio', relative), { lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] });
  const absolute = computeYRange('full', 'value', [380, 250, 170]);
  assert.equal(absolute.lo, 0);
  assert.equal(absolute.hi, 380);
  assert.equal(absolute.ticks.length, 6);
});

test('fit: 値のある範囲に合わせ、相対の上限は100%のまま', () => {
  assert.deepEqual(computeYRange('fit', 'ratio', relative), { lo: 60, hi: 100, ticks: [60, 70, 80, 90, 100] });
  const absolute = computeYRange('fit', 'value', [380, 250, 170]);
  assert.ok(absolute.lo > 0 && absolute.lo <= 170);
  assert.ok(absolute.hi >= 380);
});

test('coarse: 相対は4等分した区切りへ下限を切り下げる', () => {
  assert.deepEqual(computeYRange('coarse', 'ratio', relative), { lo: 50, hi: 100, ticks: [50, 75, 100] });
  assert.equal(computeYRange('coarse', 'ratio', [100, 20]).lo, 0);
});

test('coarse: 実測の目盛りはきりのよい値（区切りの悪い最大値をそのまま4等分しない）', () => {
  const range = computeYRange('coarse', 'value', [380.8, 247.3, 168.6, 137.7]);
  assert.deepEqual(range, { lo: 100, hi: 400, ticks: [100, 200, 300, 400] });
  assert.deepEqual(formatYTicks('value', range.ticks, 'totalUnits'), ['100 u', '200 u', '300 u', '400 u']);
});

test('値が上限に張り付く時（全点が100%）と空の時は、詰めずに0から', () => {
  assert.equal(computeYRange('fit', 'ratio', [100, 100]).lo, 0);
  assert.equal(computeYRange('fit', 'ratio', []).lo, 0);
});

test('どの決め方でも、範囲は全点を含む', () => {
  for (const mode of ['full', 'fit', 'coarse'] as const) {
    for (const relativeScale of [true, false]) {
      const values = relativeScale ? [100, 99.6, 99.55, 99.9] : [380.8, 247.3, 168.6, 137.7];
      const range = computeYRange(mode, relativeScale ? 'ratio' : 'value', values);
      assert.ok(range.lo <= Math.min(...values) && range.hi >= Math.max(...values), `${mode} ${relativeScale}`);
    }
  }
});

test('値の幅がごく狭い時、目盛りは小数で書き分け、同じ文字が並ばない', () => {
  const range = computeYRange('fit', 'ratio', [100, 100, 99.9, 99.7, 99.55]);
  const labels = formatYTicks('ratio', range.ticks, 'totalUnits');
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(
    labels.some((label) => /\.\d%$/.test(label)),
    labels.join(' '),
  );
  assert.ok(range.ticks.every((tick) => Number.isFinite(tick)));
});

test('整数の刻みなら小数を付けない（従来の見た目のまま）', () => {
  assert.deepEqual(formatYTicks('ratio', [0, 20, 40, 60, 80, 100], 'totalUnits'), ['0%', '20%', '40%', '60%', '80%', '100%']);
  assert.deepEqual(formatYTicks('value', [0, 76.16, 152.32], 'totalUnits'), ['0 u', '76 u', '152 u']);
});

test('揃える範囲: 報告は描く値の最小と最大で、値が無ければ報告しない', () => {
  assert.deepEqual(yValuesRange([380, 250, 170]), { min: 170, max: 380 });
  assert.equal(yValuesRange([]), undefined);
});

test('揃えた範囲を値として渡すと、小さい方のペインも大きい方と同じ目盛りになる', () => {
  const own = [200, 150];
  const other = [380, 170];
  const shared = yValuesRange([...own, ...other])!;
  const merged = computeYRange('fit', 'value', [shared.min, shared.max]);
  assert.notDeepEqual(merged, computeYRange('fit', 'value', own));
  assert.deepEqual(merged, computeYRange('fit', 'value', other.concat(own)));
  assert.equal(merged.hi >= 380 && merged.lo <= 150, true);
  // 相対は上限が100%のままで、下限だけが揃う
  const relativeMerged = computeYRange('fit', 'ratio', [60, 100]);
  assert.equal(relativeMerged.hi, 100);
  assert.ok(relativeMerged.lo <= 60);
});

test('差[pt]: N=0の点が0なので範囲は0を含み、負の差も縦軸に収まる', () => {
  const delta = [0, 1.2, -0.8, -3.4, 0.6];
  for (const mode of ['full', 'fit', 'coarse'] as const) {
    const range = computeYRange(mode, 'delta', delta);
    assert.ok(range.lo <= -3.4 && range.hi >= 1.2, `${mode} ${JSON.stringify(range)}`);
    assert.ok(range.lo <= 0 && range.hi >= 0, mode);
    assert.deepEqual(range.ticks.at(0), range.lo);
    assert.deepEqual(range.ticks.at(-1), range.hi);
  }
});

test('差[pt]: 決め方で余白と目盛りの粗さが変わり、空と全点0でも目盛りが作れる', () => {
  const delta = [0, 3, -5];
  const full = computeYRange('full', 'delta', delta);
  assert.deepEqual(full, { lo: -6, hi: 4, ticks: [-6, -4, -2, 0, 2, 4] });
  assert.ok(computeYRange('coarse', 'delta', delta).ticks.length < full.ticks.length);
  assert.ok(computeYRange('fit', 'delta', delta).lo < -5);
  for (const mode of ['full', 'fit', 'coarse'] as const) {
    const flat = computeYRange(mode, 'delta', [0, 0]);
    assert.ok(flat.hi > flat.lo && flat.ticks.length >= 2, mode);
    assert.ok(computeYRange(mode, 'delta', []).hi > 0, mode);
  }
});

test('差[pt]の目盛りの文字はptを付け、刻みに応じて小数を付ける', () => {
  assert.deepEqual(formatYTicks('delta', [-2, 0, 2], 'sameFingerRate'), ['-2 pt', '0 pt', '2 pt']);
  assert.deepEqual(formatYTicks('delta', [-0.5, 0, 0.5], 'sameFingerRate'), ['-0.5 pt', '0.0 pt', '0.5 pt']);
});

test('実測の目盛りは指標の単位と桁で書く', () => {
  assert.deepEqual(formatYTicks('value', [0, 1.5], 'meanPerStroke'), ['0.00 u/打鍵', '1.50 u/打鍵']);
  assert.deepEqual(formatYTicks('value', [0, 12.5], 'sameFingerRate'), ['0.0%', '12.5%']);
  assert.deepEqual(formatYTicks('value', [0, 4], 'sameFinger'), ['0回', '4回']);
});

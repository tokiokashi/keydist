import assert from 'node:assert/strict';
import test from 'node:test';
import type { FingerDistanceExtracted } from './extract.ts';
import { chartSpecOf } from './chart-data.ts';

/** 棒の値の文字だけを見るための最小の抽出結果。 */
const extractedWith = (value: number): FingerDistanceExtracted =>
  ({
    fingers: [{ finger: 'LI', hand: 'left', distance: value, distanceShare: 1, presses: value, pressShare: 1 }],
    adjacent: [],
  }) as unknown as FingerDistanceExtracted;

const valueTextOf = (value: number, metric: 'distance' | 'presses') => chartSpecOf(extractedWith(value), metric).bars[0]!.valueText;

test('5桁以下の値の表示は縮めない（移動距離は1000未満で小数1桁、1000以上で整数）', () => {
  assert.equal(valueTextOf(12.34, 'distance'), '12.3');
  assert.equal(valueTextOf(1234.56, 'distance'), '1235');
  assert.equal(valueTextOf(99999, 'distance'), '99999');
  assert.equal(valueTextOf(99999, 'presses'), '99999');
});

test('6桁・7桁・8桁の値は、棒の幅に収まる5文字以内の表示になる', () => {
  const samples: readonly number[] = [100_000, 123_456, 999_999, 1_000_000, 1_234_567, 9_999_999, 12_345_678, 123_456_789];
  for (const value of samples) {
    for (const metric of ['distance', 'presses'] as const) {
      const text = valueTextOf(value, metric);
      assert.ok(text.length <= 5, `${metric} ${value} → ${text}`);
    }
  }
});

test('10万以上はkで、100万以上はMで縮める', () => {
  assert.equal(valueTextOf(123_456, 'presses'), '123k');
  assert.equal(valueTextOf(1_234_567, 'presses'), '1.2M');
  assert.equal(valueTextOf(12_345_678, 'presses'), '12M');
  assert.equal(valueTextOf(123_456.7, 'distance'), '123k');
});

test('表示を丸めて桁が上がる境目は、上の単位に寄せる', () => {
  assert.equal(valueTextOf(99_999.7, 'distance'), '100k');
  assert.equal(valueTextOf(999_999.7, 'presses'), '1.0M');
});

test('ツールチップには縮めない正確な値が出る', () => {
  const bar = chartSpecOf(extractedWith(1_234_567), 'presses').bars[0]!;
  assert.ok(bar.tip.includes('1234567'), bar.tip);
});

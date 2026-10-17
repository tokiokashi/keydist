import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_COLUMN_IDS } from './column-text.ts';
import { COMPARISON_BAR_SCALE, comparisonBarFraction, comparisonBarRange } from './data-bar.ts';

const fractions = (scale: 'zero' | 'relative', values: number[]) => {
  const range = comparisonBarRange(scale, values);
  return values.map((value) => comparisonBarFraction(value, range));
};

test('0起点の列は、値を列の最大値で割った長さになる', () => {
  assert.deepEqual(fractions('zero', [0, 50, 100]), [0, 0.5, 1]);
});

test('割合の列も、100%ではなく列の最大値を全幅にする', () => {
  assert.deepEqual(fractions('zero', [2, 4, 1]), [0.5, 1, 0.25]);
});

test('0起点で列の最大値が0ならバーを出さない', () => {
  assert.deepEqual(fractions('zero', [0, 0]), [undefined, undefined]);
});

test('相対の列は、最小を0・最大を全幅にし、負の値も扱う', () => {
  assert.deepEqual(fractions('relative', [-0.2, 0, 0.2]), [0, 0.5, 1]);
});

test('相対の列で全行が同じ値ならバーを出さない', () => {
  assert.deepEqual(fractions('relative', [0.3, 0.3, 0.3]), [undefined, undefined, undefined]);
});

test('値が数でないセルにはバーを出さず、列の最大値・最小値にも入れない', () => {
  assert.deepEqual(fractions('zero', [10, NaN, 5, Infinity]), [1, undefined, 0.5, undefined]);
  assert.deepEqual(fractions('relative', [1, NaN, 3]), [0, undefined, 1]);
  assert.equal(comparisonBarRange('zero', [NaN]), undefined);
  assert.equal(comparisonBarFraction(1, undefined), undefined);
});

test('負になりうる指間平均だけが相対で、他の列は0起点', () => {
  for (const column of COMPARISON_COLUMN_IDS) {
    assert.equal(COMPARISON_BAR_SCALE[column], column === 'adjacentMean' ? 'relative' : 'zero', column);
  }
});

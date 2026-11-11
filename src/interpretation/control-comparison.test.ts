import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTROL_CONDITIONS, CONTROL_SEED_COUNT, CONTROL_SEED_START, controlSeeds, meanDeviation } from './control-comparison.ts';

test('meanDeviation: 算術平均と、値の数で割る母標準偏差を返す', () => {
  // 平均5、偏差の2乗の平均 (9+1+1+1+0+0+4+16)/8 = 4
  const result = meanDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(result.mean, 5);
  assert.equal(result.deviation, 2);
});

test('meanDeviation: 値が1個なら標準偏差は0、0個なら平均も標準偏差も0', () => {
  assert.deepEqual(meanDeviation([3.5]), { mean: 3.5, deviation: 0 });
  assert.deepEqual(meanDeviation([]), { mean: 0, deviation: 0 });
});

test('controlSeeds: 始まりの値から連続する20個で、条件の記述と一致する', () => {
  const seeds = controlSeeds();
  assert.equal(seeds.length, 20);
  assert.equal(seeds[0], CONTROL_SEED_START);
  assert.equal(seeds[19], CONTROL_SEED_START + 19);
  assert.equal(CONTROL_CONDITIONS.seedCount, CONTROL_SEED_COUNT);
  assert.equal(CONTROL_CONDITIONS.seedStart, CONTROL_SEED_START);
});

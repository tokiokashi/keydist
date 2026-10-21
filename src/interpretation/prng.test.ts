import assert from 'node:assert/strict';
import test from 'node:test';
import { createMulberry32, PRNG_NAME } from './prng.ts';

test('mulberry32は同じ種から同じ列を出し、値は0以上1未満', () => {
  const a = createMulberry32(12345);
  const b = createMulberry32(12345);
  const values = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(
    values,
    Array.from({ length: 1000 }, () => b()),
  );
  for (const value of values) assert.ok(value >= 0 && value < 1);
  assert.notDeepEqual(
    values.slice(0, 5),
    Array.from(
      { length: 5 },
      (
        (c) => () =>
          c()
      )(createMulberry32(12346)),
    ),
  );
  assert.equal(PRNG_NAME, 'mulberry32');
});

test('mulberry32の最初の値は固定（参照実装の値）', () => {
  // 種0の最初の3値。生成器の実装を変えたら、再現の条件に書いた名前の意味が変わる
  const random = createMulberry32(0);
  assert.deepEqual(
    [random(), random(), random()].map((x) => Number(x.toFixed(10))),
    [0.2664292087, 0.0003297457, 0.2232720274],
  );
});

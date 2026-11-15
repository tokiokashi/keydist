import assert from 'node:assert/strict';
import test from 'node:test';
import { detectContextLength, encodeRuns, mutualInformation, permuteRuns, selectRunsUpTo } from './corpus-context.ts';

test('相互情報量: 手で計算した値と一致する', () => {
  // 組は(a,b)と(b,a)が各1回。周辺分布はどちらも1/2ずつ。I = log2((1/2) / (1/2 × 1/2)) = 1ビット
  assert.equal(
    mutualInformation(
      encodeRuns([
        ['a', 'b'],
        ['b', 'a'],
      ]),
      1,
    ),
    1,
  );
  // a,b,a,bの距離1の組は(a,b)が2回、(b,a)が1回。N=3、1つ目はa:2・b:1、2つ目はb:2・a:1
  const expected = (2 / 3) * Math.log2((2 * 3) / (2 * 2)) + (1 / 3) * Math.log2((1 * 3) / (1 * 1));
  assert.ok(Math.abs(mutualInformation(encodeRuns([['a', 'b', 'a', 'b']]), 1)! - expected) < 1e-12);
});

test('相互情報量: 走りをまたぐ組を数えず、組が無ければundefined', () => {
  // 走りの間の(b,a)を数えると組に(b,a)が混ざり、値は0にならない。数えなければ組は(a,b)の2回だけで、0になる
  assert.equal(
    mutualInformation(
      encodeRuns([
        ['a', 'b'],
        ['a', 'b'],
      ]),
      1,
    ),
    0,
  );
  assert.equal(mutualInformation(encodeRuns([['a'], ['b'], ['a']]), 1), undefined);
  assert.equal(mutualInformation(encodeRuns([['a', 'b']]), 2), undefined);
});

test('並べ替え: 同じ種から同じ系列が出て、単位の出現回数と走りの長さを保つ', () => {
  const runs = encodeRuns([
    ['a', 'b', 'c'],
    ['a', 'a'],
    ['d', 'b', 'c', 'a'],
  ]);
  const first = permuteRuns(runs, 3);
  assert.deepEqual([...first.units], [...permuteRuns(runs, 3).units]);
  assert.notDeepEqual([...first.units], [...permuteRuns(runs, 4).units]);
  assert.deepEqual(first.lengths, runs.lengths);
  assert.deepEqual([...first.units].sort(), [...runs.units].sort());
});

test('検出: 周期のある系列は検出でき、並べ替えと区別が付かない系列は0', () => {
  const periodic = [Array.from({ length: 400 }, (_, i) => 'abc'[i % 3]!)];
  assert.ok(detectContextLength(periodic, 4).length >= 1);
  const unique = [Array.from({ length: 50 }, (_, i) => `u${i}`)];
  assert.equal(detectContextLength(unique, 4).length, 0);
});

test('大きさの変更: 走りを途中で切らず、目標に達するまで足し、同じ種から同じ選び方が出る', () => {
  const lengths = [10, 20, 30, 40, 50];
  const chosen = selectRunsUpTo(lengths, 45, 1);
  assert.deepEqual(chosen, selectRunsUpTo(lengths, 45, 1));
  const total = chosen.reduce((sum, index) => sum + lengths[index]!, 0);
  assert.ok(total >= 45);
  assert.ok(total - Math.min(...chosen.map((index) => lengths[index]!)) < 45);
});

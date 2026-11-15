import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectContextLength,
  encodeRuns,
  grassbergerMutualInformation,
  mutualInformation,
  pairsAtDistance,
  permuteSecond,
  runSelectionOrder,
  selectRunsUpTo,
} from './corpus-context.ts';

const pairsOf = (runs: string[][], distance: number) => pairsAtDistance(encodeRuns(runs), distance);

test('相互情報量: 手で計算した値と一致する', () => {
  // 組は(a,b)と(b,a)が各1回。周辺分布はどちらも1/2ずつ。I = log2((1/2) / (1/2 × 1/2)) = 1ビット
  assert.equal(
    mutualInformation(
      pairsOf(
        [
          ['a', 'b'],
          ['b', 'a'],
        ],
        1,
      )!,
    ),
    1,
  );
  // a,b,a,bの距離1の組は(a,b)が2回、(b,a)が1回。N=3、1つ目はa:2・b:1、2つ目はb:2・a:1
  const expected = (2 / 3) * Math.log2((2 * 3) / (2 * 2)) + (1 / 3) * Math.log2((1 * 3) / (1 * 1));
  assert.ok(Math.abs(mutualInformation(pairsOf([['a', 'b', 'a', 'b']], 1)!) - expected) < 1e-12);
});

test('組: 走りをまたぐ組を作らず、組が無ければundefined', () => {
  // 走りの間の(b,a)を数えると組に(b,a)が混ざり、値は0にならない。数えなければ組は(a,b)の2回だけで、0になる
  const pairs = pairsOf(
    [
      ['a', 'b'],
      ['a', 'b'],
    ],
    1,
  )!;
  assert.equal(pairs.first.length, 2);
  assert.equal(mutualInformation(pairs), 0);
  assert.equal(pairsOf([['a'], ['b'], ['a']], 1), undefined);
  assert.equal(pairsOf([['a', 'b']], 2), undefined);
});

test('Grassbergerの推定量: 手で計算した値と一致する', () => {
  // 組は(a,b)と(b,a)が各1回。各Ŝ = ln 2 − (1/2)(ψ(1) + ψ(1)) = ln 2 + γ。I = Ŝ + Ŝ − Ŝ = (ln 2 + γ) / ln 2（ビット単位）
  const euler = 0.5772156649015329;
  const value = grassbergerMutualInformation(
    pairsOf(
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
      1,
    )!,
  );
  assert.ok(Math.abs(value - (1 + euler / Math.LN2)) < 1e-12);
});

test('並べ替え: 組の2つ目だけを並べ替え、周辺分布と組の数を変えず、同じ種から同じ列が出る', () => {
  const pairs = pairsOf(
    [
      ['a', 'b', 'c', 'a', 'd'],
      ['a', 'a', 'b'],
      ['d', 'b', 'c', 'a'],
    ],
    1,
  )!;
  const counts = (units: Int32Array): number[] => {
    const result = new Array<number>(pairs.alphabet).fill(0);
    for (const unit of units) result[unit]!++;
    return result;
  };
  const shuffled = permuteSecond(pairs, 3);
  assert.equal(shuffled.length, pairs.second.length);
  assert.deepEqual(counts(shuffled), counts(pairs.second));
  assert.deepEqual([...shuffled], [...permuteSecond(pairs, 3)]);
  assert.notDeepEqual([...shuffled], [...permuteSecond(pairs, 4)]);
  assert.notDeepEqual([...shuffled], [...pairs.second]);
});

test('検出: 周期3の系列は、格子の全点で手で出せる値になり、検出できる', () => {
  const periodic = [Array.from({ length: 400 }, (_, i) => 'abc'[i % 3]!)];
  const result = detectContextLength(periodic, 4, { permutations: 19 });
  assert.deepEqual(
    result.rows.map((row) => row.distance),
    [1, 2, 3, 4],
  );
  for (const row of result.rows) {
    // 距離が3の倍数なら組は(a,a)(b,b)(c,c)、そうでなければ(a,b)(b,c)(c,a)のような3種類で、どちらもlog2(3)ビット（組の数は3の倍数に近いので、1/3からのずれは1e-2以内）
    assert.ok(Math.abs(row.mutualInformation - Math.log2(3)) < 1e-2, `d=${row.distance}`);
    // 19通りで元以上になる並べ替えが無ければ、p値は1/20
    assert.equal(row.pValue, 1 / 20);
    assert.ok(row.detected);
  }
  assert.equal(result.length, 4);
  assert.equal(result.reachedLimit, true);
});

test('検出: 同じ単位が2度と出ない系列は、元と並べ替えの値が等しく、p値は1で検出できない', () => {
  const unique = [Array.from({ length: 50 }, (_, i) => `u${i}`)];
  const result = detectContextLength(unique, 4, { permutations: 19 });
  assert.equal(result.length, 0);
  assert.deepEqual(
    result.rows.map((row) => row.pValue),
    [1, 1, 1, 1],
  );
  // 組の数Nに対して、元も並べ替えもlog2(N)ビット
  assert.ok(Math.abs(result.rows[0]!.mutualInformation - Math.log2(49)) < 1e-12);
  assert.ok(Math.abs(result.rows[0]!.excess) < 1e-12);
});

test('大きさの変更: 選んだ走りの合計が目標以上で、最後に足した走りの前は目標未満', () => {
  const lengths = [10, 20, 30, 40, 50, 5, 15, 25];
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const target of [1, 45, 100, 150]) {
      const chosen = selectRunsUpTo(lengths, target, seed);
      assert.deepEqual(chosen, selectRunsUpTo(lengths, target, seed));
      const total = chosen.reduce((sum, index) => sum + lengths[index]!, 0);
      assert.ok(total >= target);
      // 選んだのは、選ぶ順の先頭から数えた走り。最後に足した走りの前の合計は目標未満
      const order = runSelectionOrder(lengths.length, seed).slice(0, chosen.length);
      assert.deepEqual(
        [...order].sort((a, b) => a - b),
        chosen,
      );
      const last = order.at(-1)!;
      assert.ok(total - lengths[last]! < target);
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { generateTrace } from '#trace/generate.ts';
import {
  buildSegmentationReport,
  fixedBoundaries,
  median,
  quantileNearestRank,
  randomBoundaries,
  rankAmong,
  SEGMENT_SEED_COUNT,
  segmentLengths,
  segmentStats,
  segmentValues,
} from './segments.ts';
import { buildSpanIndex, SPAN_METRIC_IDS, spanTotals, wholeTotals } from './span-metrics.ts';

const geometry = buildGeometry('row-staggered');
const TEXT = SAMPLE_TEXT_JA.replace(/\s/g, '').slice(0, 600);

function indexFor(layoutId: string) {
  return buildSpanIndex(generateTrace(TEXT, LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true }));
}

/** 5〜12文字の区間に区切った、文節の代わりの区切り。 */
function bunsetsuLike(total: number): number[] {
  const boundaries: number[] = [];
  let position = 0;
  for (let step = 0; ; step++) {
    position += 5 + ((step * 7) % 8);
    if (position >= total) return boundaries;
    boundaries.push(position);
  }
}

test('ランダムの区切りは文節と同じ数で、区間の長さの並べ替えになる', () => {
  const bunsetsu = bunsetsuLike(TEXT.length);
  for (const seed of [1, 2, 3]) {
    const boundaries = randomBoundaries(bunsetsu, TEXT.length, seed);
    assert.equal(boundaries.length, bunsetsu.length);
    assert.deepEqual(
      segmentLengths(boundaries, TEXT.length).sort((a, b) => a - b),
      segmentLengths(bunsetsu, TEXT.length).sort((a, b) => a - b),
    );
    for (let i = 1; i < boundaries.length; i++) assert.ok(boundaries[i]! > boundaries[i - 1]!);
  }
});

test('同じ区切りと同じ種からは同じランダムの区切りが出て、種が違えば違う区切りが出る', () => {
  const bunsetsu = bunsetsuLike(TEXT.length);
  assert.deepEqual(randomBoundaries(bunsetsu, TEXT.length, 5), randomBoundaries(bunsetsu, TEXT.length, 5));
  assert.notDeepEqual(randomBoundaries(bunsetsu, TEXT.length, 5), randomBoundaries(bunsetsu, TEXT.length, 6));
  const index = indexFor('qwerty');
  const a = buildSegmentationReport(index, bunsetsu, 9)!;
  const b = buildSegmentationReport(index, bunsetsu, 9)!;
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.seeds,
    Array.from({ length: SEGMENT_SEED_COUNT }, (_, i) => 9 + i),
  );
});

test('固定長は、文節の区間の長さの平均を丸めた長さで先頭から区切る', () => {
  const total = 100;
  const bunsetsu = [10, 30, 60, 80]; // 5区間、平均20
  assert.deepEqual(fixedBoundaries(bunsetsu, total), [20, 40, 60, 80]);
  assert.deepEqual(fixedBoundaries([], total), []);
  // 平均が割り切れない時は丸める（100/3 → 33）
  assert.deepEqual(fixedBoundaries([30, 70], total), [33, 66, 99]);
});

test('3つの区切り方のどれでも、区間ごとの分子と分母を足すとテキスト全体に戻る', () => {
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const index = indexFor(layoutId);
    const bunsetsu = bunsetsuLike(index.inputChars);
    const cases = {
      bunsetsu,
      fixed: fixedBoundaries(bunsetsu, index.inputChars),
      random: randomBoundaries(bunsetsu, index.inputChars, 11),
    };
    for (const [name, boundaries] of Object.entries(cases)) {
      for (const metric of SPAN_METRIC_IDS) {
        let numerator = 0;
        let denominator = 0;
        let start = 0;
        for (const end of [...boundaries, index.inputChars]) {
          const totals = spanTotals(index, metric, start, end);
          numerator += totals.numerator;
          denominator += totals.denominator;
          start = end;
        }
        const whole = wholeTotals(index, metric);
        assert.ok(Math.abs(numerator - whole.numerator) < 1e-9, `${layoutId} ${name} ${metric} 分子`);
        assert.equal(denominator, whole.denominator, `${layoutId} ${name} ${metric} 分母`);
      }
    }
  }
});

test('区切りの直後の1文字の量は、次の区間の最初の文字に帰属したステップの距離の和の、全区切りでの平均', () => {
  const index = indexFor('qwerty');
  const boundaries = bunsetsuLike(index.inputChars);
  const stats = segmentStats(index, boundaries);
  const expectedAfter = boundaries.reduce((sum, b) => sum + index.distanceAt[b]!, 0) / boundaries.length;
  const expectedBefore = boundaries.reduce((sum, b) => sum + index.distanceAt[b - 1]!, 0) / boundaries.length;
  assert.ok(Math.abs(stats.byMetric.perCharUnits.after! - expectedAfter) < 1e-9);
  assert.ok(Math.abs(stats.byMetric.perCharUnits.before! - expectedBefore) < 1e-9);
  // 打鍵の指標は、1文字の範囲の分子の和 / 分母の和
  const steps = boundaries.reduce((sum, b) => sum + index.stepsAt[b]!, 0);
  const distance = boundaries.reduce((sum, b) => sum + index.distanceAt[b]!, 0);
  assert.ok(Math.abs(stats.byMetric.meanPerStroke.after! - distance / steps) < 1e-9);
  assert.equal(stats.segmentCount, boundaries.length + 1);
});

test('自明な小さい例で、直後の1文字の量と90%点を手計算と照らす', () => {
  // 文字ごとの距離を直接持つ索引の代わりに、小さなテキストのTraceから求める
  const trace = generateTrace('あいうえおかきくけこ', LAYOUT_BY_ID.get('jis-kana')!, geometry, { windowSize: 3, sfbHomeCost: true });
  const index = buildSpanIndex(trace);
  const boundaries = [3, 7];
  const values = segmentValues(index, 'perCharUnits', boundaries);
  assert.equal(values.length, 3);
  const expected = [
    (index.distanceUpTo[3]! - index.distanceUpTo[0]!) / 3,
    (index.distanceUpTo[7]! - index.distanceUpTo[3]!) / 4,
    (index.distanceUpTo[10]! - index.distanceUpTo[7]!) / 3,
  ];
  assert.deepEqual(
    [...values],
    [...expected].sort((a, b) => a - b),
  );
  const stats = segmentStats(index, boundaries);
  assert.equal(stats.byMetric.perCharUnits.p90, [...expected].sort((a, b) => a - b)[2]);
  assert.ok(Math.abs(stats.byMetric.perCharUnits.after! - (index.distanceAt[3]! + index.distanceAt[7]!) / 2) < 1e-12);
});

test('90%点は補間しない（小さい方から切り上げた番目の値）。中央値は偶数個なら中央の2つの平均', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(quantileNearestRank(ten, 0.9), 9);
  assert.equal(quantileNearestRank([5], 0.9), 5);
  assert.equal(quantileNearestRank([], 0.9), undefined);
  assert.equal(median(ten), 5.5);
  assert.equal(median([1, 2, 3]), 2);
});

test('順位は同じ値があれば幅で示し、端に数えるのは厳密に小さいか大きい時だけ', () => {
  const others = [2, 3, 4, 5];
  assert.deepEqual(rankAmong(1, others), { low: 1, high: 1, of: 5, extreme: 'lowest' });
  assert.deepEqual(rankAmong(9, others), { low: 5, high: 5, of: 5, extreme: 'highest' });
  assert.deepEqual(rankAmong(3.5, others), { low: 3, high: 3, of: 5, extreme: null });
  // 最小の値と同点なら端に数えない
  assert.deepEqual(rankAmong(2, others), { low: 1, high: 2, of: 5, extreme: null });
  assert.deepEqual(rankAmong(5, others), { low: 4, high: 5, of: 5, extreme: null });
  assert.deepEqual(rankAmong(3, [3, 3, 3]), { low: 1, high: 4, of: 4, extreme: null });
});

test('特徴が無い入力（文節の区切りがランダムな区切りと同じ分布）で、端に来る割合は 2/21 以下', () => {
  const index = indexFor('qwerty');
  let extremes = 0;
  const trials = 60;
  for (let trial = 0; trial < trials; trial++) {
    // 文節の代わりに、ランダムな区間の長さを持つ区切りを使う（テキストの内容と区切りは無関係）
    const bunsetsu = randomBoundaries(bunsetsuLike(index.inputChars), index.inputChars, 1000 + trial);
    const report = buildSegmentationReport(index, bunsetsu, 1)!;
    if (report.rank.p90?.extreme !== null) extremes++;
  }
  // 2/21 は約9.5%。60回で期待は約5.7回。大きく外れていないことだけを確かめる
  assert.ok(extremes / trials <= 0.25, `端に来た割合 ${extremes}/${trials}`);
});

test('区切りが1つも無ければ報告を作らない', () => {
  assert.equal(buildSegmentationReport(indexFor('qwerty'), [], 1), undefined);
});

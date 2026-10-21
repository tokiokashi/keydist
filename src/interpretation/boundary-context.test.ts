import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { generateTrace } from '#trace/generate.ts';
import {
  BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT,
  boundaryContextVerdict,
  boundaryShare,
  comparableBoundaries,
  compareBoundaryContext,
  contextKey,
  contextMatchedBoundaries,
} from './boundary-context.ts';
import { rankAmong } from './segments.ts';
import { buildSpanIndex, spanTotals, wholeTotals } from './span-metrics.ts';

const geometry = buildGeometry('row-staggered');
const TEXT = SAMPLE_TEXT_JA.replace(/\s/g, '').slice(0, 600);
const CHARS = [...TEXT];

function indexFor(layoutId: string) {
  return buildSpanIndex(generateTrace(TEXT, LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true }));
}

/** 位置が不規則に並ぶ、文節の代わりの区切り。0から始まる位置も含めて、前の文字が足りない区切りを作る。 */
function bunsetsuLike(total: number): number[] {
  const boundaries: number[] = [1];
  let position = 1;
  for (let step = 0; ; step++) {
    position += 3 + ((step * 7) % 8);
    if (position >= total) return boundaries;
    boundaries.push(position);
  }
}

function keyCounts(chars: readonly string[], boundaries: readonly number[], length: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const boundary of boundaries) {
    const key = contextKey(chars, boundary, length)!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

test('同じテキスト・同じ種からは同じ区切りが出て、種が違えば違う区切りが出る', () => {
  const bunsetsu = bunsetsuLike(CHARS.length);
  for (const length of [1, 2, 3]) {
    assert.deepEqual(contextMatchedBoundaries(CHARS, bunsetsu, length, 7), contextMatchedBoundaries(CHARS, bunsetsu, length, 7));
  }
  assert.notDeepEqual(contextMatchedBoundaries(CHARS, bunsetsu, 1, 7).boundaries, contextMatchedBoundaries(CHARS, bunsetsu, 1, 8).boundaries);
});

test('選んだ区切りの並びの型ごとの数は、文節の区切りの型ごとの数と一致する', () => {
  const bunsetsu = bunsetsuLike(CHARS.length);
  for (const length of [1, 2, 3]) {
    const compared = comparableBoundaries(bunsetsu, length);
    for (const seed of [1, 2, 3]) {
      const { boundaries } = contextMatchedBoundaries(CHARS, bunsetsu, length, seed);
      assert.equal(boundaries.length, compared.length);
      assert.equal(new Set(boundaries).size, boundaries.length);
      assert.deepEqual(keyCounts(CHARS, boundaries, length), keyCounts(CHARS, compared, length));
      for (let i = 1; i < boundaries.length; i++) assert.ok(boundaries[i]! > boundaries[i - 1]!);
    }
  }
});

test('出現位置の数と区切りの数が等しい型では位置が全部選ばれ、選ぶ余地が無い区切りに数えられる', () => {
  // 文字aは位置1・4・6にだけ現れる。位置1と4を区切りにするとk=2、m=3で余地がある。bは位置8だけでk=m=1
  const chars = [...'xaxxaxaxbx'];
  const result = contextMatchedBoundaries(chars, [1, 4, 8], 1, 1);
  assert.equal(result.comparedCount, 3);
  assert.equal(result.forcedCount, 1);
  assert.ok(result.boundaries.includes(8));
  assert.equal(result.boundaries.filter((b) => chars[b] === 'a').length, 2);
  // 全部が選ぶ余地の無い型なら、ランダムな区切りは文節と同じになる
  const all = contextMatchedBoundaries(chars, [1, 4, 6, 8], 1, 1);
  assert.deepEqual(all.boundaries, [1, 4, 6, 8]);
  assert.equal(all.forcedCount, 4);
});

test('前の文字が足りない区切りは、その並びの長さの比較から除かれる', () => {
  const chars = [...'abcdefgh'];
  assert.deepEqual(comparableBoundaries([1, 2, 5], 1), [1, 2, 5]);
  assert.deepEqual(comparableBoundaries([1, 2, 5], 2), [1, 2, 5]);
  assert.deepEqual(comparableBoundaries([1, 2, 5], 3), [2, 5]);
  assert.equal(contextKey(chars, 1, 3), undefined);
  assert.equal(contextKey(chars, 2, 3), 'abc');
  assert.equal(contextMatchedBoundaries(chars, [1, 2, 5], 3, 1).comparedCount, 2);
  assert.ok(contextMatchedBoundaries(chars, [1, 2, 5], 3, 1).boundaries.every((b) => b >= 2));
  const index = indexFor('qwerty');
  const bunsetsu = bunsetsuLike(CHARS.length);
  assert.equal(compareBoundaryContext(index, CHARS, bunsetsu, 3, 1).comparedCount, bunsetsu.length - 1);
  assert.equal(compareBoundaryContext(index, CHARS, bunsetsu, 2, 1).comparedCount, bunsetsu.length);
});

test('選ぶ余地が無い区切りの割合が上限を超えたら判定を出さず、判定の文言は端かどうかで決まる', () => {
  const lowest = rankAmong(0, [1, 2, 3]);
  const middle = rankAmong(2, [1, 3]);
  assert.equal(boundaryContextVerdict(lowest, 0.1).kind, 'unexplained');
  assert.equal(boundaryContextVerdict(middle, 0).kind, 'not-ruled-out');
  assert.deepEqual(boundaryContextVerdict(lowest, BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT + 0.01), { kind: 'withheld', reason: 'forced-ratio' });
  assert.deepEqual(boundaryContextVerdict(undefined, 0), { kind: 'withheld', reason: 'undefined-value' });
  assert.deepEqual(boundaryContextVerdict(lowest, undefined), { kind: 'withheld', reason: 'undefined-value' });
});

test('並びの長さごと・配列ごとに別々に比べ、順位は文節の値とランダム20個の21個になる', () => {
  const bunsetsu = bunsetsuLike(CHARS.length);
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const index = indexFor(layoutId);
    const lengths = [1, 2, 3].map((length) => compareBoundaryContext(index, CHARS, bunsetsu, length, 1));
    for (const result of lengths) {
      assert.equal(result.random.length, 20);
      assert.equal(result.rank?.of, 21);
      assert.equal(result.verdict.kind === 'withheld', result.forcedRatio! > BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT);
    }
  }
});

test('境目の打鍵が占める割合は、区切りの直後の1文字に帰属する距離の和を全文の距離の和で割った値に一致する', () => {
  const bunsetsu = bunsetsuLike(CHARS.length);
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const index = indexFor(layoutId);
    const share = boundaryShare(index, bunsetsu);
    let sum = 0;
    for (const boundary of bunsetsu) sum += index.distanceAt[boundary]!;
    assert.ok(Math.abs(share.distanceShare! - sum / index.distanceUpTo[index.inputChars]!) < 1e-12);
    assert.equal(share.charShare, bunsetsu.length / index.inputChars);
    const whole = wholeTotals(index, 'perCharUnits');
    assert.ok(
      Math.abs(share.distanceShare! - bunsetsu.reduce((s, b) => s + spanTotals(index, 'perCharUnits', b, b + 1).numerator, 0) / whole.numerator) < 1e-12,
    );
  }
});

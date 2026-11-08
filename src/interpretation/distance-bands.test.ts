import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { DISTANCE_BAND_COUNT, distanceBandCounts, distanceBandOf, distanceBandShares, traceDistanceBandCounts } from './distance-bands.ts';
import { buildSpanIndex } from './span-metrics.ts';

test('境目ちょうどの距離は上の区分に入る', () => {
  assert.deepEqual([0, 0.49, 0.5, 1.49, 1.5, 2.49, 2.5, 7].map(distanceBandOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('打てない文字を数えず、分母は打てた文字の数になる', () => {
  const counted = distanceBandCounts([0, 0.5, 1.5, 2.5, 0, 0.2], [0, 4]);
  assert.deepEqual(counted.counts, [1, 1, 1, 1]);
  assert.equal(counted.typed, 4);
  assert.equal(counted.skipped, 2);
});

test('範囲外と重複した打てない文字の位置は、数に入れない', () => {
  const counted = distanceBandCounts([0, 1, 2], [1, 1, 9, -1]);
  assert.equal(counted.skipped, 1);
  assert.equal(counted.typed, 2);
});

test('割合の和は丸める前で1になり、打てた文字が0なら割合は決まらない', () => {
  const shares = distanceBandShares(distanceBandCounts([0, 0.7, 1.6, 3, 3, 0.1, 1], []))!;
  assert.equal(shares.length, DISTANCE_BAND_COUNT);
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
  assert.equal(distanceBandShares(distanceBandCounts([0, 0], [0, 1])), undefined);
});

test('Traceから数えた値は、distanceAtを直接数えた値と一致する', () => {
  const text = 'こんにちは、せかい。\nきょうはいいてんきです';
  const trace = generateTrace(text, LAYOUT_BY_ID.get('jis-kana')!, buildGeometry('row-staggered'), { windowSize: 3, sfbHomeCost: true });
  const counted = traceDistanceBandCounts(trace);
  assert.equal(counted.typed + counted.skipped, trace.inputChars);
  assert.equal(counted.skipped, new Set(trace.skippedPositions).size);
  assert.ok(counted.skipped >= 1);
  assert.equal(
    counted.counts.reduce((sum, count) => sum + count, 0),
    counted.typed,
  );
  assert.deepEqual(counted, distanceBandCounts(buildSpanIndex(trace).distanceAt, trace.skippedPositions));
});

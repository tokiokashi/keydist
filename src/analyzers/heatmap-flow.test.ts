import assert from 'node:assert/strict';
import test from 'node:test';
import type { BigramVector } from './bigram-vectors.ts';
import { heatmapFlowSegments, heatmapFlowStrokeWidth } from './heatmap-flow.ts';
import { MIN_LINE_SCREEN_PX } from './keyboard-flow-lines.ts';

const vector = (id: string, weight: number, fromKeyIds: string[], toKeyIds: string[]): BigramVector =>
  ({
    id,
    weight,
    fromKeyIds,
    toKeyIds,
    hand: 'left',
    distance: 1,
  }) as unknown as BigramVector;

test('線の太さは組数に比例し、尺度の最大値が同じなら、どの図でも同じ組数は同じ太さになる', () => {
  const zoom = 10;
  assert.equal(heatmapFlowStrokeWidth(5, 10, zoom), heatmapFlowStrokeWidth(5, 10, zoom));
  const half = heatmapFlowStrokeWidth(5, 10, zoom);
  const full = heatmapFlowStrokeWidth(10, 10, zoom);
  const none = heatmapFlowStrokeWidth(0, 10, zoom);
  assert.ok(none < half && half < full);
  // 比例: 0 → 半分 → 最大 の増分が等しい
  assert.ok(Math.abs(half - none - (full - half)) < 1e-9);
});

test('尺度の最大値が違えば、同じ組数でも太さが変わる（共通の最大値を渡す理由）', () => {
  assert.ok(heatmapFlowStrokeWidth(5, 5, 10) > heatmapFlowStrokeWidth(5, 10, 10));
});

test('縮んだ図でも、線は画面上で最小の太さを下回らない', () => {
  const zoom = 0.2;
  assert.equal(heatmapFlowStrokeWidth(1, 100, zoom), MIN_LINE_SCREEN_PX / zoom);
  assert.ok(heatmapFlowStrokeWidth(100, 100, 10) > MIN_LINE_SCREEN_PX / 10);
});

test('線の端は図に描いたキーの中心で、コンボは複数のキーの中心の平均。描いていないキーの組は描かない', () => {
  const centers = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 30, y: 0 }],
    ['c', { x: 60, y: 30 }],
  ]);
  const segments = heatmapFlowSegments(
    [vector('ab', 2, ['a'], ['b']), vector('combo', 1, ['b', 'c'], ['a']), vector('missing', 9, ['a'], ['z'])],
    centers,
  );
  assert.deepEqual(
    segments.map((segment) => [segment.vector.id, segment.start, segment.end]),
    [
      ['ab', { x: 0, y: 0 }, { x: 30, y: 0 }],
      ['combo', { x: 45, y: 15 }, { x: 0, y: 0 }],
    ],
  );
});

test('太い線を先に、細い線を後（前面）に並べる', () => {
  const centers = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 30, y: 0 }],
  ]);
  const segments = heatmapFlowSegments([vector('thin', 1, ['a'], ['b']), vector('thick', 5, ['b'], ['a'])], centers);
  assert.deepEqual(
    segments.map((segment) => segment.vector.id),
    ['thick', 'thin'],
  );
});

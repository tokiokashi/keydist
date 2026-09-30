import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateTextWidth,
  LEGEND_MAX_LABEL_WIDTH,
  placeLegend,
  segmentIntersectsRect,
  truncateLabel,
  type Point,
  type Rect,
} from './legend-placement.ts';

const PLOT: Rect = { x: 48, y: 16, width: 400, height: 150 };
const LEFT = PLOT.x;
const RIGHT = PLOT.x + PLOT.width;
const TOP = PLOT.y;
const BOTTOM = PLOT.y + PLOT.height;

/** 左上から右下へ下がる線（N感度の線の形）。 */
const descending: Point[] = [{ x: LEFT, y: TOP }, { x: LEFT + 60, y: TOP }, { x: RIGHT, y: TOP + 60 }];

test('線分と矩形の交差: 内側・貫通・かすめない・縁', () => {
  const rect: Rect = { x: 10, y: 10, width: 20, height: 20 };
  assert.equal(segmentIntersectsRect({ x: 15, y: 15 }, { x: 16, y: 16 }, rect), true);
  assert.equal(segmentIntersectsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, rect), true);
  assert.equal(segmentIntersectsRect({ x: 0, y: 0 }, { x: 40, y: 5 }, rect), false);
  assert.equal(segmentIntersectsRect({ x: 0, y: 0 }, { x: 5, y: 40 }, rect), false);
  assert.equal(segmentIntersectsRect({ x: 30, y: 0 }, { x: 30, y: 40 }, rect), true);
});

test('左上から右下へ下がる線なら、左下に置く', () => {
  const placement = placeLegend(PLOT, [descending], ['QWERTY', 'Dvorak']);
  assert.equal(placement.corner, 'bottom-left');
  assert.equal(placement.overlaps, 0);
});

test('左下が線で塞がれていれば右上へ移す', () => {
  const low: Point[] = [{ x: LEFT, y: BOTTOM - 10 }, { x: RIGHT, y: BOTTOM - 10 }];
  const placement = placeLegend(PLOT, [low], ['QWERTY', 'Dvorak']);
  assert.equal(placement.corner, 'top-right');
  assert.equal(placement.overlaps, 0);
});

test('左下・右上が塞がれていれば、空いている別の隅へ移す', () => {
  const lowLeft: Point[] = [{ x: LEFT, y: BOTTOM - 10 }, { x: LEFT + 200, y: BOTTOM - 10 }];
  const highRight: Point[] = [{ x: RIGHT - 200, y: TOP + 10 }, { x: RIGHT, y: TOP + 10 }];
  const placement = placeLegend(PLOT, [lowLeft, highRight], ['QWERTY']);
  assert.equal(placement.corner, 'bottom-right');
  assert.equal(placement.overlaps, 0);
});

test('1列では収まらない時は2列にして低くする', () => {
  // 上の壁の下は空いているが、8行を1列に積むと高さが足りない
  const labels = Array.from({ length: 8 }, (_, i) => `配列${i}`);
  const plot: Rect = { x: 0, y: 0, width: 400, height: 170 };
  const wall: Point[] = [{ x: 0, y: 30 }, { x: 400, y: 30 }];
  const placement = placeLegend(plot, [wall], labels);
  assert.equal(placement.columns, 2);
  assert.equal(placement.overlaps, 0);
});

test('どこにも収まらなければ、線と交わる数が最も少ない隅を返す', () => {
  const fullPlot: Rect = { x: 0, y: 0, width: 100, height: 60 };
  const lines: Point[][] = [
    [{ x: 0, y: 0 }, { x: 100, y: 60 }],
    [{ x: 0, y: 60 }, { x: 100, y: 0 }],
  ];
  const placement = placeLegend(fullPlot, lines, ['A', 'B', 'C']);
  assert.ok(placement.overlaps > 0);
});

test('枠は常にプロット領域の内側に収まる', () => {
  const placement = placeLegend(PLOT, [descending], ['QWERTY', 'Dvorak', 'Colemak-DH']);
  assert.ok(placement.rect.x >= PLOT.x && placement.rect.x + placement.rect.width <= PLOT.x + PLOT.width);
  assert.ok(placement.rect.y >= PLOT.y && placement.rect.y + placement.rect.height <= PLOT.y + PLOT.height);
});

test('長い名前は幅の上限で「…」に省き、短い名前はそのまま', () => {
  assert.equal(truncateLabel('QWERTY'), 'QWERTY');
  const long = 'とても長い名前の配列とても長い名前の配列とても長い名前の配列';
  const cut = truncateLabel(long);
  assert.ok(cut.endsWith('…'));
  assert.ok(estimateTextWidth(cut) <= LEGEND_MAX_LABEL_WIDTH);
});

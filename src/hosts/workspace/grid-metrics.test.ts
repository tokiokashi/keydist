import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRID_COLS } from '#engine/workspace-grid.ts';
import { defaultGridSize, minGridSize, minPaneCols, MIN_PANE_WIDTH_PX } from './grid-metrics.ts';

test('minPaneCols: 面が広ければ2列。狭くて2列が下限の幅に満たない時だけ列数を増やす', () => {
  // FHD・左のメニューを開いた面（1680px）。2列は131pxで下限の幅に収まる
  assert.equal(minPaneCols(1680), 2);
  // 縦積みに切り替わる760pxの直上（左のメニューを開いた面は521px）。2列は35pxなので、下限の幅が収まる列数まで増える
  const narrow = minPaneCols(521);
  assert.ok(narrow > 2 && narrow < GRID_COLS, String(narrow));
  const step = (521 - 16 - (GRID_COLS - 1) * 8) / GRID_COLS + 8;
  assert.ok(narrow * step - 8 >= MIN_PANE_WIDTH_PX);
  assert.ok((narrow - 1) * step - 8 < MIN_PANE_WIDTH_PX, '最小の列数になっている');
  // 面が極端に狭くても（0・負）、列の外へは出ない
  assert.equal(minPaneCols(0), GRID_COLS);
  assert.equal(minPaneCols(-100), GRID_COLS);
});

test('既定の幅は面の半分（24列のうち12列）。Analyzerの下限は2列', () => {
  assert.equal(defaultGridSize('bigram-flow').w, GRID_COLS / 2);
  assert.equal(GRID_COLS, 24);
  assert.equal(minGridSize('bigram-flow', 1680).w, 2);
});

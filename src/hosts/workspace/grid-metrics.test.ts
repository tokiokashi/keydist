import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PANE_COLS, DEFAULT_SMALL_PANE_COLS, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { BLANK_PANE_ID } from '#engine/workspace.ts';
import {
  colsFitting,
  defaultGridSize,
  DRAG_EXTEND_COLS,
  extendedReach,
  GRID_COL_STEP_PX,
  GRID_MARGIN_PX,
  GRID_PADDING_PX,
  gridCols,
  gridWidthPx,
  minGridSize,
  minPaneCols,
  MIN_PANE_WIDTH_PX,
  rightmostCol,
  visibleColRange,
} from './grid-metrics.ts';

test('列の幅は固定: 並びの幅は列の数だけで決まり、面の幅は関係しない', () => {
  assert.equal(GRID_COL_STEP_PX, 68);
  // 1列の画素の幅（列の幅 = 1列ぶん - 升の間）
  assert.equal(gridWidthPx(1), 2 * GRID_PADDING_PX + GRID_COL_STEP_PX - GRID_MARGIN_PX);
  // 1列増えるごとに1列ぶんだけ広がる
  assert.equal(gridWidthPx(25) - gridWidthPx(24), GRID_COL_STEP_PX);
  assert.equal(gridWidthPx(24), 1640);
});

test('colsFitting: 面に収まる最大の列数。その幅に並びが収まり、1列増やすと収まらない', () => {
  for (const area of [521, 1200, 1665, 1680, 2305, 2560]) {
    const cols = colsFitting(area);
    assert.ok(gridWidthPx(cols) <= area, `${area}: ${cols}列が収まる`);
    assert.ok(gridWidthPx(cols + 1) > area, `${area}: ${cols + 1}列は収まらない`);
  }
  // 面が極端に狭くても、列は1以上
  assert.equal(colsFitting(0), 1);
  assert.equal(colsFitting(-100), 1);
  assert.equal(colsFitting(Number.NaN), 1);
});

test('gridCols: 面に収まる列数と並びの右端の大きい方。右端より小さくならない', () => {
  // 広い面で並びが狭い: 面に収まる列数
  assert.equal(gridCols(1680, 12, 0), colsFitting(1680));
  // 狭い面で並びが広い: 並びの右端（並びが書き換わらない）
  assert.equal(gridCols(521, 24, 0), 24);
  // ドラッグ中に伸ばした列
  assert.equal(gridCols(1680, 12, 40), 40);
});

test('rightmostCol: xとwの和の最大。ペインが無ければ0', () => {
  const grid: WorkspaceGrid = [
    { id: 'a', x: 0, y: 0, w: 12, h: 4 },
    { id: 'b', x: 30, y: 0, w: 6, h: 4 },
  ];
  assert.equal(rightmostCol(grid), 36);
  assert.equal(rightmostCol([]), 0);
});

test('visibleColRange: 一部しか見えていない端の列は含めない', () => {
  // スクロールしていない1680pxの面: 左端の列から、収まる列まで
  const first = visibleColRange(0, 1680);
  assert.equal(first.start, 0);
  assert.equal(first.end, colsFitting(1680));
  // スクロールしていない面では、どの幅でも面に収まる列の数と一致する（超えない）
  for (let area = 761; area <= 2560; area += 1) {
    assert.equal(visibleColRange(0, area).end, colsFitting(area), `${area}px`);
  }
  // 列の途中までスクロールすると、左端の欠けた列を含めない
  const scrolled = visibleColRange(100, 1000);
  const left = GRID_PADDING_PX + scrolled.start * GRID_COL_STEP_PX;
  const right = GRID_PADDING_PX + scrolled.end * GRID_COL_STEP_PX - GRID_MARGIN_PX;
  assert.ok(left >= 100, `左端の列は見えている: ${left}`);
  assert.ok(right <= 100 + 1000, `右端の列は見えている: ${right}`);
  assert.ok(left - GRID_COL_STEP_PX < 100, '1列左は欠けている');
  assert.ok(right + GRID_COL_STEP_PX > 100 + 1000, '1列右は欠けている');
  // 面が1列より狭くても、範囲は1列以上
  assert.equal(visibleColRange(0, 10).end, 1);
});

test('extendedReach: 動かしている枠が列の右端に届いた時にだけ伸ばし、伸ばした列は縮めない', () => {
  assert.equal(extendedReach(24, 20, 0), 0);
  assert.equal(extendedReach(24, 24, 0), 24 + DRAG_EXTEND_COLS);
  // 伸びた後に枠が戻っても、操作の間は縮めない
  assert.equal(extendedReach(28, 20, 28), 28);
  // 伸びた列の右端に届けば、さらに伸ばす
  assert.equal(extendedReach(28, 28, 28), 28 + DRAG_EXTEND_COLS);
});

test('横幅の下限: 2列。固定の列の幅で、2列が最小の画素の幅に収まる', () => {
  assert.equal(minPaneCols(), 2);
  assert.ok(gridWidthPx(2) - 2 * GRID_PADDING_PX >= MIN_PANE_WIDTH_PX, '2列の幅が最小の幅以上');
  assert.equal(minGridSize('bigram-flow').w, 2);
  assert.equal(minGridSize(BLANK_PANE_ID).w, 2);
});

test('既定の幅は12列（余白のペインは6列）', () => {
  assert.equal(DEFAULT_PANE_COLS, 12);
  assert.equal(DEFAULT_SMALL_PANE_COLS, 6);
  assert.equal(defaultGridSize('bigram-flow').w, DEFAULT_PANE_COLS);
  assert.equal(defaultGridSize(BLANK_PANE_ID).w, DEFAULT_SMALL_PANE_COLS);
});

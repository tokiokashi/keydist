import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compactGrid,
  DEFAULT_GRID_RANGE,
  DEFAULT_PANE_COLS,
  DEFAULT_SMALL_PANE_COLS,
  FALLBACK_GRID_SIZE,
  GRID_MAX_COLS,
  gridPaneIds,
  gridWithPane,
  gridWithPaneNextTo,
  gridWithMovedPane,
  gridWithoutPane,
  gridWithResizedPane,
  normalizeGrid,
  sameGrid,
  type GridItem,
  type WorkspaceGrid,
} from './workspace-grid.ts';

const item = (id: string, x: number, y: number, w: number, h: number): GridItem => ({ id, x, y, w, h });

function noOverlap(grid: WorkspaceGrid): boolean {
  return grid.every((a, i) => grid.slice(i + 1).every((b) => !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)));
}

test('gridWithPane: 空いている最初の場所へ、指定の大きさで置く。他の枠は動かさない', () => {
  let grid: WorkspaceGrid = [];
  grid = gridWithPane(grid, 'a', { w: 12, h: 10 }, true);
  grid = gridWithPane(grid, 'b', { w: 12, h: 14 }, true);
  grid = gridWithPane(grid, 'c', { w: 12, h: 8 }, true);
  assert.deepEqual(grid, [item('a', 0, 0, 12, 10), item('b', 12, 0, 12, 14), item('c', 0, 10, 12, 8)]);
  assert.equal(gridWithPane(grid, 'a', { w: 6, h: 3 }, true), grid);
});

test('gridWithPaneNextTo: 元と同じ大きさで右隣に置く。右が塞がっていれば真下', () => {
  const grid = gridWithPane(gridWithPane([], 'a', { w: 12, h: 10 }, true), 'b', { w: 8, h: 6 }, true);
  // aの右隣はbで塞がっている。真下に同じ大きさで置く
  const below = gridWithPaneNextTo(grid, 'a', 'a2', true);
  assert.deepEqual(below.find((i) => i.id === 'a2'), item('a2', 0, 10, 12, 10));
  // bの右隣は範囲（既定は24列）に収まらない（12 + 8 + 8 > 24）ので、bの真下
  const bBelow = gridWithPaneNextTo(grid, 'b', 'b2', true);
  assert.deepEqual(bBelow.find((i) => i.id === 'b2'), item('b2', 12, 6, 8, 6));
  // 空いている右隣があれば右隣
  const narrow = gridWithPane([], 'n', { w: 8, h: 6 }, true);
  assert.deepEqual(gridWithPaneNextTo(narrow, 'n', 'n2', true).find((i) => i.id === 'n2'), item('n2', 8, 0, 8, 6));
});

test('gridWithPaneNextTo: 右隣が範囲に収まらなければ、範囲の外へは置かない', () => {
  const grid = gridWithPane([], 'a', { w: 16, h: 6 }, true);
  const next = gridWithPaneNextTo(grid, 'a', 'a2', true);
  const copy = next.find((i) => i.id === 'a2')!;
  assert.equal(copy.w, 16);
  assert.equal(copy.h, 6);
  assert.ok(copy.x + copy.w <= DEFAULT_GRID_RANGE.end);
  assert.ok(noOverlap(next));
});

test('既定の幅と列の上限: ペインの既定の幅は12列、余白のペインなどは6列。上限は24列より大きい固定値', () => {
  assert.equal(DEFAULT_PANE_COLS, 12);
  assert.equal(DEFAULT_SMALL_PANE_COLS, 6);
  assert.equal(FALLBACK_GRID_SIZE.w, DEFAULT_PANE_COLS);
  assert.ok(GRID_MAX_COLS > 24);
  // 大きさを渡さずに枠を足すと、既定の幅になる
  const grid = normalizeGrid(undefined, ['a'], false);
  assert.equal(grid[0]!.w, DEFAULT_PANE_COLS);
});

test('gridWithPane: 範囲を渡すと、その範囲の中の空いている最初の場所に置く（24列より右を含む）', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 6)];
  // 範囲が左端から離れていれば、その左端に置く
  assert.deepEqual(gridWithPane(grid, 'n', { w: 12, h: 4 }, false, { start: 30, end: 60 }).find((i) => i.id === 'n'), item('n', 30, 0, 12, 4));
  // 範囲の中が塞がっていれば、次の空き（右へ）。範囲の外の空きは使わない
  const filled: WorkspaceGrid = [item('a', 30, 0, 12, 6)];
  assert.deepEqual(gridWithPane(filled, 'n', { w: 12, h: 4 }, false, { start: 30, end: 60 }).find((i) => i.id === 'n'), item('n', 42, 0, 12, 4));
  // 範囲に空きが無ければ、並びの下の範囲の左端
  const full: WorkspaceGrid = [item('a', 30, 0, 15, 6), item('b', 45, 0, 15, 6)];
  assert.deepEqual(gridWithPane(full, 'n', { w: 12, h: 4 }, false, { start: 30, end: 60 }).find((i) => i.id === 'n'), item('n', 30, 6, 12, 4));
  // 上限は越えない
  const edge = gridWithPane([], 'n', { w: 12, h: 4 }, false, { start: GRID_MAX_COLS - 2, end: GRID_MAX_COLS + 20 }).find((i) => i.id === 'n')!;
  assert.equal(edge.x + edge.w, GRID_MAX_COLS);
});

test('gridWithPaneNextTo: 右隣が範囲の外なら、範囲の中（真下、無ければ空いている場所）に置く', () => {
  const grid: WorkspaceGrid = [item('a', 30, 0, 12, 6)];
  const range = { start: 30, end: 42 };
  // aの右隣（42〜54）は範囲の外。範囲の中の真下に置く
  assert.deepEqual(gridWithPaneNextTo(grid, 'a', 'a2', false, undefined, range).find((i) => i.id === 'a2'), item('a2', 30, 6, 12, 6));
  // 範囲が広ければ右隣
  assert.deepEqual(gridWithPaneNextTo(grid, 'a', 'a2', false, undefined, { start: 30, end: 60 }).find((i) => i.id === 'a2'), item('a2', 42, 0, 12, 6));
  // 元のペインが範囲の左に隠れていて、真下も範囲の外なら、範囲の中の空いている最初の場所
  const hidden: WorkspaceGrid = [item('a', 0, 0, 12, 6)];
  assert.deepEqual(gridWithPaneNextTo(hidden, 'a', 'a2', false, undefined, { start: 30, end: 60 }).find((i) => i.id === 'a2'), item('a2', 30, 6, 12, 6));
});

test('gridWithoutPane: 下のペインは上へ詰まる。他のペインの大きさは変わらない', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 24, 6), item('b', 0, 6, 12, 9), item('c', 12, 6, 12, 5)];
  const next = gridWithoutPane(grid, 'a', true);
  assert.deepEqual(next, [item('b', 0, 0, 12, 9), item('c', 12, 0, 12, 5)]);
  assert.equal(gridWithoutPane(grid, 'none', true), grid);
});

test('compactGrid: 上に空きがあれば詰め、詰まっていれば内容を変えない', () => {
  const sparse: WorkspaceGrid = [item('a', 0, 3, 12, 4), item('b', 0, 20, 12, 4)];
  assert.deepEqual(compactGrid(sparse), [item('a', 0, 0, 12, 4), item('b', 0, 4, 12, 4)]);
  const tight: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)];
  assert.ok(sameGrid(compactGrid(tight), tight));
});

test('normalizeGrid: 24列より右の位置と幅は保ち、列の上限だけで収める', () => {
  const wide: WorkspaceGrid = [item('a', 30, 0, 12, 4), item('b', 0, 0, 28, 4), item('c', 1000, 0, 12, 4), item('d', 0, 4, 9999, 4)];
  const fixed = normalizeGrid(wide, ['a', 'b', 'c', 'd'], false);
  assert.deepEqual(fixed.find((i) => i.id === 'a'), item('a', 30, 0, 12, 4));
  assert.deepEqual(fixed.find((i) => i.id === 'b'), item('b', 0, 0, 28, 4));
  assert.deepEqual(fixed.find((i) => i.id === 'c'), item('c', GRID_MAX_COLS - 12, 0, 12, 4));
  assert.equal(fixed.find((i) => i.id === 'd')!.w, GRID_MAX_COLS);
  assert.ok(noOverlap(fixed));
});

test('normalizeGrid: 範囲外・重なり・知らないペイン・重複を直し、枠の無いペインは足す', () => {
  const dirty: WorkspaceGrid = [
    item('a', 18, 0, 12, 5),
    item('a', 0, 0, 2, 2),
    item('ghost', 0, 0, 1, 1),
    item('b', 0, 0, 12, 5),
    item('c', 0, 0, 0, 0),
  ];
  const fixed = normalizeGrid(dirty, ['a', 'b', 'c', 'd'], true);
  assert.deepEqual([...gridPaneIds(fixed)].sort(), ['a', 'b', 'c', 'd']);
  assert.ok(noOverlap(fixed));
  for (const i of fixed) assert.ok(i.x >= 0 && i.x + i.w <= GRID_MAX_COLS && i.w >= 1 && i.h >= 1, JSON.stringify(i));
  assert.deepEqual(normalizeGrid(undefined, [], true), []);
});

test('sameGrid: 配列の順は見ず、位置と大きさだけを比べる', () => {
  const a: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)];
  assert.ok(sameGrid(a, [a[1]!, a[0]!]));
  assert.equal(sameGrid(a, [a[0]!, item('b', 12, 0, 12, 5)]), false);
  assert.equal(sameGrid(a, [a[0]!]), false);
});

test('詰めない設定: 閉じた所は空いたまま残り、他の枠は動かない', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 24, 6), item('b', 0, 6, 12, 9), item('c', 12, 6, 12, 5)];
  assert.deepEqual(gridWithoutPane(grid, 'a', false), [item('b', 0, 6, 12, 9), item('c', 12, 6, 12, 5)]);
});

test('詰めない設定: 追加は空いた所へ入り、他の枠は動かない。複製も同じ', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 6, 12, 4)];
  // 右上（12, 0）は空いている
  assert.deepEqual(gridWithPane(grid, 'n', { w: 12, h: 3 }, false), [...grid, item('n', 12, 0, 12, 3)]);
  assert.deepEqual(gridWithPaneNextTo(grid, 'a', 'a2', false), [...grid, item('a2', 12, 0, 12, 4)]);
});

test('normalizeGrid: 詰めない設定は上の空きを残し、重なりだけを下へ押して解く', () => {
  const gapped: WorkspaceGrid = [item('a', 0, 5, 12, 4), item('b', 0, 20, 12, 4)];
  assert.deepEqual(normalizeGrid(gapped, ['a', 'b'], false), gapped);
  assert.deepEqual(normalizeGrid(gapped, ['a', 'b'], true), [item('a', 0, 0, 12, 4), item('b', 0, 4, 12, 4)]);
  const overlapped: WorkspaceGrid = [item('a', 0, 5, 12, 4), item('b', 0, 6, 12, 4)];
  assert.deepEqual(normalizeGrid(overlapped, ['a', 'b'], false), [item('a', 0, 5, 12, 4), item('b', 0, 9, 12, 4)]);
});

test('gridWithMovedPane: 1列・1行ずつ動かし、列と行の端で止まる', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 20, 8, 12, 4)];
  assert.deepEqual(gridWithMovedPane(grid, 'b', 1, 0, false), [grid[0], item('b', 21, 8, 12, 4)]);
  assert.deepEqual(gridWithMovedPane(grid, 'b', 0, -1, false), [grid[0], item('b', 20, 7, 12, 4)]);
  assert.equal(gridWithMovedPane(grid, 'a', -1, 0, false), grid);
  assert.equal(gridWithMovedPane(grid, 'a', 0, -1, false), grid);
  const edge: WorkspaceGrid = [item('a', GRID_MAX_COLS - 12, 0, 12, 4)];
  assert.equal(gridWithMovedPane(edge, 'a', 1, 0, false), edge);
  assert.equal(gridWithMovedPane(grid, 'none', 1, 0, false), grid);
});

test('gridWithMovedPane: 動かした先で重なった相手は下へ押し、動かした枠は動かさない', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)];
  const moved = gridWithMovedPane(grid, 'a', 1, 0, false);
  assert.deepEqual(moved, [item('a', 1, 0, 12, 4), item('b', 12, 4, 12, 4)]);
  assert.ok(noOverlap(moved));
});

test('gridWithMovedPane: 詰める設定では押した後に上へ詰める', () => {
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)];
  assert.deepEqual(gridWithMovedPane(grid, 'b', 0, 1, true), [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)]);
});

test('gridWithResizedPane: 右下の角を動かし、下限と列の上限で止まる', () => {
  const min = { w: 2, h: 3 };
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', GRID_MAX_COLS - 3, 10, 3, 4)];
  assert.deepEqual(gridWithResizedPane(grid, 'a', 1, 0, min, false), [item('a', 0, 0, 13, 4), grid[1]]);
  assert.deepEqual(gridWithResizedPane(grid, 'a', 0, -1, min, false), [item('a', 0, 0, 12, 3), grid[1]]);
  assert.equal(gridWithResizedPane([item('a', 0, 0, 2, 3)], 'a', -1, -1, min, false)[0]!.w, 2);
  assert.equal(gridWithResizedPane(grid, 'b', 1, 0, min, false), grid);
});

test('gridWithResizedPane: 下限を下回る枠は縮めず、広げる操作には従う。広げて重なった相手は下へ押す', () => {
  const min = { w: 4, h: 6 };
  const small: WorkspaceGrid = [item('a', 0, 0, 2, 3)];
  assert.equal(gridWithResizedPane(small, 'a', -1, -1, min, false), small);
  assert.deepEqual(gridWithResizedPane(small, 'a', 1, 0, min, false), [item('a', 0, 0, 3, 3)]);
  const grid: WorkspaceGrid = [item('a', 0, 0, 12, 4), item('b', 12, 0, 12, 4)];
  const grown = gridWithResizedPane(grid, 'a', 1, 0, min, false);
  assert.deepEqual(grown, [item('a', 0, 0, 13, 4), item('b', 12, 4, 12, 4)]);
});

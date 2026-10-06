import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compactGrid,
  GRID_COLS,
  gridPaneIds,
  gridWithPane,
  gridWithPaneNextTo,
  gridWithoutPane,
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
  // bの右隣は列に収まらない（12 + 8 + 8 > 24）ので、bの真下
  const bBelow = gridWithPaneNextTo(grid, 'b', 'b2', true);
  assert.deepEqual(bBelow.find((i) => i.id === 'b2'), item('b2', 12, 6, 8, 6));
  // 空いている右隣があれば右隣
  const narrow = gridWithPane([], 'n', { w: 8, h: 6 }, true);
  assert.deepEqual(gridWithPaneNextTo(narrow, 'n', 'n2', true).find((i) => i.id === 'n2'), item('n2', 8, 0, 8, 6));
});

test('gridWithPaneNextTo: 右隣が列に収まらなければ、列の外へは置かない', () => {
  const grid = gridWithPane([], 'a', { w: 16, h: 6 }, true);
  const next = gridWithPaneNextTo(grid, 'a', 'a2', true);
  const copy = next.find((i) => i.id === 'a2')!;
  assert.equal(copy.w, 16);
  assert.equal(copy.h, 6);
  assert.ok(copy.x + copy.w <= GRID_COLS);
  assert.ok(noOverlap(next));
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
  for (const i of fixed) assert.ok(i.x >= 0 && i.x + i.w <= GRID_COLS && i.w >= 1 && i.h >= 1, JSON.stringify(i));
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

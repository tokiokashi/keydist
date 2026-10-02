import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceの格子（ペインごとに位置と大きさを持つ。列は12、1升の高さ28px、升の間8px）。
 * 大きさを変えるつかみは、下の辺（高さだけ）・右の辺と左の辺（幅だけ。左の辺は左端が動く）・右下の角（幅と高さを別々に）の4つ。
 * 1つのペインを変えても、他のペインの大きさは変わらない。複製は元と同じ大きさで隣に置き、閉じると下のペインが詰まる。
 * ペインは中身が軽い余白のペインで足りる（格子の動きは中身に依らない）。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const ROW_STEP = 28 + 8;
const blank = (id: string) => ({ id, analyzerId: 'blank', binding: { mode: 'none' } });

interface Cell { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
const cell = (id: string, x: number, y: number, w: number, h: number): Cell => ({ id, x, y, w, h });

async function open(page: Page, ids: readonly string[], grid: readonly Cell[], size = { width: 1440, height: 1200 }): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'g', name: '格子', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: ids.map(blank), grid });
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(ids.length);
}

async function stored(page: Page): Promise<Cell[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return JSON.parse(raw!).workspaces[0].grid;
}

const itemOf = async (page: Page, id: string) => (await stored(page)).find((item) => item.id === id)!;

/** 1列ぶんの横の幅（列の幅 + 升の間）。格子の面の実寸から求める。 */
async function colStep(page: Page): Promise<number> {
  const width = (await page.locator('.workspace-grid-area').boundingBox())!.width;
  return (width - 16 - 11 * 8) / 12 + 8;
}

async function dragHandle(page: Page, id: string, axis: 's' | 'e' | 'w' | 'se', dx: number, dy: number): Promise<void> {
  const box = (await page.locator(`.workspace-grid-item[data-pane-id="${id}"] .react-resizable-handle-${axis}`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test('つかみは下の辺・右の辺・左の辺・右下の角の4つだけで、上の辺と他の角には無い', async ({ page }) => {
  await open(page, ['a'], [cell('a', 2, 0, 6, 10)]);
  const classes = await page.locator('.workspace-grid-item .react-resizable-handle').evaluateAll((els) => els.map((el) => [...el.classList].find((c) => /^react-resizable-handle-/.test(c))));
  expect([...classes].sort()).toEqual(['react-resizable-handle-e', 'react-resizable-handle-s', 'react-resizable-handle-se', 'react-resizable-handle-w']);
});

test('下の辺をつかむと高さだけが変わる（幅も位置も変わらない）。他のペインの大きさは変わらない', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 5, 10), cell('b', 6, 0, 5, 10)]);
  await dragHandle(page, 'a', 's', 0, 3 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(13);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 5, 13));
  expect(await itemOf(page, 'b')).toEqual(cell('b', 6, 0, 5, 10));
  // 横にずらして離しても、幅は変わらない
  await dragHandle(page, 'a', 's', 150, -2 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(11);
  expect((await itemOf(page, 'a')).w).toBe(5);
});

test('右の辺をつかむと幅だけが変わる（高さも位置も変わらない）。他のペインの大きさは変わらない', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 4, 10), cell('b', 8, 0, 4, 10)]);
  const step = await colStep(page);
  await dragHandle(page, 'a', 'e', Math.round(2 * step), 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(6);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 6, 10));
  expect(await itemOf(page, 'b')).toEqual(cell('b', 8, 0, 4, 10));
  // 縦にずらして離しても、高さは変わらない
  await dragHandle(page, 'a', 'e', -Math.round(step), 5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(5);
  expect((await itemOf(page, 'a')).h).toBe(10);
});

test('左の辺をつかむと幅だけが変わり、左端が動く（右端と高さは変わらない）', async ({ page }) => {
  await open(page, ['a'], [cell('a', 4, 0, 4, 10)]);
  const step = await colStep(page);
  await dragHandle(page, 'a', 'w', -Math.round(2 * step), 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(6);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 2, 0, 6, 10));
  await dragHandle(page, 'a', 'w', Math.round(step), 4 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(5);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 3, 0, 5, 10));
});

test('右下の角をつかむと、幅と高さを別々の量で変えられる（縦横比は固定されない）', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 4, 10)]);
  const step = await colStep(page);
  // 幅を1列、高さを5行（比が 5:1）
  await dragHandle(page, 'a', 'se', Math.round(step), 5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(15);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 5, 15));
  // 幅を3列、高さを1行縮める（比が 3:1 で、前と違う）
  await dragHandle(page, 'a', 'se', Math.round(3 * step), -ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(8);
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 8, 14));
});

test('大きさの変更はUndo / Redoで1手ずつ戻り、再読み込みしても位置と大きさが残る', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 4, 10), cell('b', 6, 0, 4, 10)]);
  await dragHandle(page, 'a', 's', 0, 2 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(12);
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(10);
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(12);

  const before = await stored(page);
  const boxes = () => page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return [el.getAttribute('data-pane-id'), Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)];
  }));
  // 大きさの変化にはライブラリの短い動き（200ms）が付くので、落ち着いてから測る
  await page.waitForTimeout(500);
  const drawn = await boxes();
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  expect(await stored(page)).toEqual(before);
  await expect.poll(boxes).toEqual(drawn);
});

test('複製は元と同じ大きさで右隣に置く。右が塞がっていれば真下に置く', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 4, 12), cell('b', 4, 0, 4, 8)]);
  // aの右隣はbで塞がっている。aと同じ4 x 12を、aの真下へ
  await page.locator('.workspace-grid-item[data-pane-id="a"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /複製/ }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  const afterFirst = await stored(page);
  const below = afterFirst.find((item) => item.id !== 'a' && item.id !== 'b')!;
  expect(below).toEqual({ ...cell(below.id, 0, 12, 4, 12) });

  // bの右隣（x 8〜12）は空いているので、bと同じ4 x 8を右隣へ
  await page.locator('.workspace-grid-item[data-pane-id="b"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /複製/ }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(4);
  const right = (await stored(page)).find((item) => ![ 'a', 'b', below.id ].includes(item.id))!;
  expect(right).toEqual(cell(right.id, 8, 0, 4, 8));
  // 元のペインは動かない
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 4, 12));
  expect(await itemOf(page, 'b')).toEqual(cell('b', 4, 0, 4, 8));
});

test('ペインを閉じると、下のペインが上へ詰まる。どのペインの大きさも変わらない', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], [cell('a', 0, 0, 6, 8), cell('b', 0, 8, 6, 10), cell('c', 0, 18, 6, 6)]);
  await page.locator('.workspace-grid-item[data-pane-id="b"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await expect.poll(async () => (await itemOf(page, 'c')).y).toBe(8);
  expect(await stored(page)).toEqual([cell('a', 0, 0, 6, 8), cell('c', 0, 8, 6, 6)]);
  // Undoで元の位置と大きさへ戻る
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  expect((await stored(page)).find((item) => item.id === 'c')).toEqual(cell('c', 0, 18, 6, 6));
});

test('足したペインは、Analyzerごとの既定の大きさで、空いている最初の場所に入る', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 6, 8)]);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  const added = (await stored(page)).find((item) => item.id !== 'a')!;
  // aの右隣（空いている最初の場所）、幅は列の半分
  expect(added.x).toBe(6);
  expect(added.y).toBe(0);
  expect(added.w).toBe(6);
  expect(added.h).toBeGreaterThanOrEqual(12);
  // 既存のペインは動かない
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 6, 8));
});

test('ペインを動かしても大きさは変わらず、ぶつかったペインは下へ押される', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 5, 8), cell('b', 6, 0, 5, 8)]);
  const grab = (await page.locator('.workspace-grid-item[data-pane-id="a"] .workspace-drag-handle').boundingBox())!;
  const step = await colStep(page);
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.round(6 * step), y + 4, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await itemOf(page, 'a')).x).toBeGreaterThanOrEqual(5);
  const a = await itemOf(page, 'a');
  expect([a.w, a.h]).toEqual([5, 8]);
  const b = await itemOf(page, 'b');
  expect([b.w, b.h]).toEqual([5, 8]);
  // 重ならない
  const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  expect(overlaps).toBe(false);
});

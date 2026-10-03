import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { cell, colStep, dragHandle, dragPane, drawnTop, itemOf, open, ROW_STEP, settle, stored, WORKSPACES_KEY } from './workspace-grid-helper.ts';

/**
 * 「空いた所に詰める」の設定。Workspaceごとに持ち、既定は詰めない。
 * 詰めない時は、ペインを縮める・動かす・閉じて空いた所を空いたまま残し、ぶつかった相手を下へ押す動きだけを残す。
 * 詰める時は、空いた所へ下のペインが上がる（今までの動き）。
 */

const menuButton = (page: Page) => page.getByRole('button', { name: 'Workspaceの操作' });
const compactItem = (page: Page) => page.getByRole('menuitemcheckbox', { name: /空いた所に詰める/ });

async function toggleCompact(page: Page): Promise<void> {
  await menuButton(page).click();
  await compactItem(page).click();
  await settle(page);
}

async function workspaces(page: Page): Promise<Array<Record<string, unknown>>> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return JSON.parse(raw!).workspaces;
}

// aの下にcがあり、bは右の列。aを縮めたり閉じたりすると、aの下に空きができる
const COLUMN = [cell('a', 0, 0, 12, 10), cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)];

test('詰めない（既定）: 縮めた所へ下のペインが上がらない', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], COLUMN);
  await dragHandle(page, 'a', 's', 0, -5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(5);
  expect(await stored(page)).toEqual([cell('a', 0, 0, 12, 5), cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)]);
  // 見えている位置も、cはaを縮める前と同じ高さのまま
  expect(await drawnTop(page, 'c') - await drawnTop(page, 'a')).toBe(10 * ROW_STEP);
});

test('詰めない（既定）: 閉じた所は空いたまま残り、元に戻すで戻る', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], COLUMN);
  await page.locator('.workspace-grid-item[data-pane-id="a"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  expect(await stored(page)).toEqual([cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)]);
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  expect(await itemOf(page, 'c')).toEqual(cell('c', 0, 10, 12, 6));
});

test('詰めない（既定）: ペインを動かすと、ぶつかった相手は下へ押される。大きさは変わらない', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 10, 8), cell('b', 12, 0, 10, 8)]);
  const step = await colStep(page);
  await dragPane(page, 'a', Math.round(12 * step), 4);
  await expect.poll(async () => (await itemOf(page, 'a')).x).toBeGreaterThanOrEqual(10);
  const a = await itemOf(page, 'a');
  const b = await itemOf(page, 'b');
  expect([a.w, a.h, b.w, b.h]).toEqual([10, 8, 10, 8]);
  expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
  // 押された側が下へ動いた（押しのけは詰めない時も残る）
  expect(Math.max(a.y, b.y)).toBeGreaterThan(0);
});

test('詰めない（既定）: 大きくしてぶつかった相手は下へ押され、縮め直しても元の所へ戻らない', async ({ page }) => {
  await open(page, ['a', 'c'], [cell('a', 0, 0, 12, 6), cell('c', 0, 8, 12, 6)]);
  await dragHandle(page, 'a', 's', 0, 5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(11);
  const c = await itemOf(page, 'c');
  expect(c.y).toBe(11);
  expect([c.w, c.h]).toEqual([12, 6]);
  await dragHandle(page, 'a', 's', 0, -5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(6);
  expect((await itemOf(page, 'c')).y).toBe(11);
});

test('詰める設定: 縮めた所へ下のペインが上がる', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], COLUMN, undefined, true);
  await dragHandle(page, 'a', 's', 0, -5 * ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBe(5);
  expect(await itemOf(page, 'c')).toEqual(cell('c', 0, 5, 12, 6));
});

test('切り替え: 並びを書き換えない。詰める間は表示だけが詰まり、戻すと空きが戻る。元に戻すで1回ずつ戻る', async ({ page }) => {
  const gapped = [cell('a', 0, 0, 12, 5), cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)];
  await open(page, ['a', 'b', 'c'], gapped);
  const gap = await drawnTop(page, 'c') - await drawnTop(page, 'a');
  expect(gap).toBe(10 * ROW_STEP);

  await toggleCompact(page);
  expect(await stored(page)).toEqual(gapped);
  expect((await workspaces(page))[0]!.compactPanes).toBe(true);
  expect(await drawnTop(page, 'c') - await drawnTop(page, 'a')).toBe(5 * ROW_STEP);

  await toggleCompact(page);
  expect(await stored(page)).toEqual(gapped);
  expect((await workspaces(page))[0]!.compactPanes).toBeUndefined();
  expect(await drawnTop(page, 'c') - await drawnTop(page, 'a')).toBe(gap);

  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await workspaces(page))[0]!.compactPanes).toBe(true);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await workspaces(page))[0]!.compactPanes).toBeUndefined();
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await workspaces(page))[0]!.compactPanes).toBe(true);
  expect(await stored(page)).toEqual(gapped);
});

test('詰める設定へ切り替えた後にペインを動かすと、その時に詰めた並びが書かれる', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], [cell('a', 0, 0, 12, 5), cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)]);
  await toggleCompact(page);
  await dragHandle(page, 'b', 's', 0, ROW_STEP);
  await expect.poll(async () => (await itemOf(page, 'b')).h).toBe(17);
  expect(await itemOf(page, 'c')).toEqual(cell('c', 0, 5, 12, 6));
});

test('設定は保存され、メニューに今の状態が出る。Workspaceの複製にも写る', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 12, 8)]);
  await menuButton(page).click();
  await expect(compactItem(page)).toHaveAttribute('aria-checked', 'false');
  await compactItem(page).click();

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(1);
  await menuButton(page).click();
  await expect(compactItem(page)).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitem', { name: '複製' }).click();
  await expect.poll(async () => (await workspaces(page)).length).toBe(2);
  expect((await workspaces(page)).map((workspace) => workspace.compactPanes)).toEqual([true, true]);
});

test('縦積み（スマホ幅）: 並びを書き換えず、設定の切り替えも使える。広げ直すと保存した並びで描かれる', async ({ page }) => {
  const gapped = [cell('a', 0, 0, 12, 5), cell('b', 12, 0, 12, 16), cell('c', 0, 10, 12, 6)];
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, {
    id: 'g',
    name: '格子',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: ['a', 'b', 'c'].map((id) => ({ id, analyzerId: 'blank', binding: { mode: 'none' } })),
    grid: gapped,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('[data-workspace-stack]')).toBeVisible();
  await toggleCompact(page);
  expect(await stored(page)).toEqual(gapped);
  await toggleCompact(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await settle(page);
  expect(await stored(page)).toEqual(gapped);
  expect(await drawnTop(page, 'c') - await drawnTop(page, 'a')).toBe(10 * ROW_STEP);
});

test('拡大表示: 拡大しても戻しても、保存した並びも空きも変わらない', async ({ page }) => {
  const gapped = [cell('a', 0, 0, 12, 16), cell('b', 12, 0, 12, 16), cell('c', 0, 20, 24, 16)];
  const fixed = (id: string) => ({
    id,
    analyzerId: 'bigram-flow',
    binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } },
  });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, {
    id: 'g',
    name: '格子',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: ['a', 'b', 'c'].map(fixed),
    grid: gapped,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await settle(page);
  const gap = await drawnTop(page, 'c') - await drawnTop(page, 'a');
  expect(gap).toBe(20 * ROW_STEP);

  await page.locator('.workspace-grid-item[data-pane-id="a"] .pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(page.locator('.workspace-grid-item[data-maximized]')).toHaveCount(1);
  expect(await stored(page)).toEqual(gapped);
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-grid-item[data-maximized]')).toHaveCount(0);
  await settle(page);
  expect(await stored(page)).toEqual(gapped);
  expect(await drawnTop(page, 'c') - await drawnTop(page, 'a')).toBe(gap);
});

interface Rect { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

async function drawnRects(page: Page): Promise<Rect[]> {
  return page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute('data-pane-id')!, x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  }));
}

function overlapping(rects: readonly Rect[]): string[] {
  const found: string[] = [];
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    // つかんで動かしている・大きさを変えているペインは、ライブラリが指の位置の画素で描き、他のペインは升目で動く。
    // その差（1升未満）は重なりとみなさず、1升以上の重なりを見つける
    const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (width >= ROW_STEP && height >= ROW_STEP) found.push(`${a.id}/${b.id}`);
  }));
  return found;
}

/**
 * つかんだ点から`dx`・`dy`だけ数回に分けて動かし、動かすたびに落ち着いてから描かれた矩形が重ならないことを確かめる。
 * 離す直前と直後で、動かしていないペインの位置が飛ばないことも確かめる。
 */
async function dragWhileChecking(page: Page, grab: { x: number; y: number }, dx: number, dy: number, moving: string): Promise<void> {
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(grab.x + (dx * i) / steps, grab.y + (dy * i) / steps);
    await page.waitForTimeout(350);
    expect(overlapping(await drawnRects(page)), `途中${i}/${steps}で重なる`).toEqual([]);
  }
  const before = await drawnRects(page);
  await page.mouse.up();
  await settle(page);
  const after = await drawnRects(page);
  expect(overlapping(after)).toEqual([]);
  for (const rect of before.filter((r) => r.id !== moving)) {
    expect(after.find((r) => r.id === rect.id), `${rect.id}が離した瞬間に飛ぶ`).toEqual(rect);
  }
}

test('詰めない（既定）: 大きさを変える途中でペインが重ならず、離しても位置が飛ばない', async ({ page }) => {
  await open(page, ['a', 'c'], [cell('a', 0, 0, 12, 6), cell('c', 0, 8, 12, 6)]);
  const box = (await page.locator('.workspace-grid-item[data-pane-id="a"] .react-resizable-handle-s').boundingBox())!;
  await dragWhileChecking(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 0, 5 * ROW_STEP, 'a');
});

test('詰めない（既定）: 動かす途中でペインが重ならず、離しても位置が飛ばない', async ({ page }) => {
  await open(page, ['a', 'b', 'd'], [cell('a', 0, 0, 8, 12), cell('b', 12, 0, 8, 3), cell('d', 12, 3, 8, 3)]);
  const grab = (await page.locator('.workspace-grid-item[data-pane-id="a"] .workspace-drag-handle').boundingBox())!;
  const step = await colStep(page);
  await dragWhileChecking(page, { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 }, Math.round(12 * step), 0, 'a');
});

test('⋯をキーボードで開くと、先頭の「空いた所に詰める」へフォーカスが行く', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 12, 8)]);
  await menuButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(compactItem(page)).toBeFocused();
});

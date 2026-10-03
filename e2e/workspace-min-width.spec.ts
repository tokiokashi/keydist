import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの横幅の下限（24列のうち2列）。下限は見やすさのためではなく、操作できなくなるのを防ぐためだけに置く。
 * FHD（1920x1080、左のメニューを開いた状態）で、2列まで縮められること、その幅でも⋯・大きさを変えるつまみ・
 * ドラッグのつかみに届き、操作できることを確かめる。
 */

const FHD = { width: 1920, height: 1080 };
const WORKSPACES_KEY = 'keydist:workspaces';
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const pane = (id: string, analyzerId = 'bigram-flow') => ({
  id,
  analyzerId,
  binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } },
});

async function open(page: Page, theme: 'light' | 'dark' = 'light', size = FHD, grid?: readonly object[]): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript(({ key, value, theme }) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
      localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, appearance: { theme } }));
    }
  }, {
    key: WORKSPACES_KEY,
    theme,
    value: {
      id: 'narrow',
      name: '細いペイン',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [pane('a'), pane('b'), pane('c')],
      grid: grid ?? [
        { id: 'a', x: 0, y: 0, w: 8, h: 16 },
        { id: 'b', x: 8, y: 0, w: 8, h: 16 },
        { id: 'c', x: 16, y: 0, w: 8, h: 16 },
      ],
    },
  });
  await page.goto('/workspace/narrow');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await expect(page.locator('.app-sidebar')).toBeVisible();
  await settle(page);
}

/** ライブラリの配置の動き（200ms）が済むまで待つ。 */
async function settle(page: Page): Promise<void> {
  const signature = () => page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
  }).join('|'));
  let last = await signature();
  let stable = 0;
  while (stable < 4) {
    await page.waitForTimeout(100);
    const now = await signature();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

async function stored(page: Page): Promise<{ id: string; x: number; y: number; w: number; h: number }[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return JSON.parse(raw!).workspaces[0].grid;
}

const itemOf = async (page: Page, id: string) => (await stored(page)).find((item) => item.id === id)!;

const itemLocator = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
  await settle(page);
}

const center = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** 点にある一番手前の要素が、`target`自身かその中の要素か。上に別の部品が重なって押せない状態を見つける。 */
async function topmostIsWithin(target: Locator, point: { x: number; y: number }): Promise<boolean> {
  return target.evaluate((el, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    return hit !== null && el.contains(hit);
  }, point);
}

test('FHDで、ペインを2列まで縮められる。それ以上は縮まらない', async ({ page }) => {
  await open(page);
  const grid = await page.locator('.workspace-grid-area').boundingBox();
  const handle = (await itemLocator(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
  // 右の辺を、ペインの幅より大きく左へ引く
  await dragBy(page, center(handle), -1000, 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(2);
  expect(await itemOf(page, 'a')).toEqual({ id: 'a', x: 0, y: 0, w: 2, h: 16 });
  // 2列は面の1/12。ペインの外形で測っても同じになる（列の数が下限で止まっている）
  const box = (await itemLocator(page, 'a').boundingBox())!;
  const colStep = (grid!.width - 16 - 23 * 8) / 24 + 8;
  expect(Math.abs(box.width - (2 * colStep - 8))).toBeLessThanOrEqual(1);
  // 他のペインの大きさは変わらない
  expect((await itemOf(page, 'b')).w).toBe(8);
});

test('FHDで2列のペインでも、⋯のメニュー・大きさを変えるつまみ・ドラッグのつかみが操作できる', async ({ page }) => {
  await open(page);
  const handle = (await itemLocator(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
  await dragBy(page, center(handle), -1000, 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(2);
  const item = itemLocator(page, 'a');
  const frame = (await item.boundingBox())!;
  const inside = (box: { x: number; y: number; width: number; height: number }) =>
    box.x >= frame.x - 0.5 && box.x + box.width <= frame.x + frame.width + 0.5;

  // ⋯: ペインの枠の中にあり、押せて、メニューが開く
  const menu = item.getByRole('button', { name: /の操作$/ });
  const menuBox = (await menu.boundingBox())!;
  expect(inside(menuBox)).toBe(true);
  expect(await topmostIsWithin(menu, center(menuBox))).toBe(true);
  await menu.click();
  const close = page.getByRole('menuitem', { name: /閉じる/ });
  await expect(close).toBeVisible();
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.x).toBeGreaterThanOrEqual(0);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(FHD.width);
  await page.keyboard.press('Escape');
  await expect(close).toBeHidden();

  // つかみ: 絵が見えて、一番手前にあり、つかんで動かせる
  const grab = item.locator('.workspace-drag-handle');
  const grabBox = (await grab.boundingBox())!;
  expect(inside(grabBox)).toBe(true);
  expect(grabBox.width).toBeGreaterThan(16);
  expect(await topmostIsWithin(grab, { x: grabBox.x + 8, y: grabBox.y + grabBox.height / 2 })).toBe(true);
  const colStep = ((await page.locator('.workspace-grid-area').boundingBox())!.width - 16 - 23 * 8) / 24 + 8;
  await dragBy(page, { x: grabBox.x + 8, y: grabBox.y + grabBox.height / 2 }, Math.round(2 * colStep), 0);
  await expect.poll(async () => (await itemOf(page, 'a')).x).toBeGreaterThan(0);
  expect((await itemOf(page, 'a')).w).toBe(2);

  // 大きさを変えるつまみ: 4つとも、その位置の一番手前で、別のつまみに隠されない
  for (const axis of ['s', 'e', 'w', 'se'] as const) {
    const handleBox = (await item.locator(`.react-resizable-handle-${axis}`).boundingBox())!;
    expect(handleBox.width, axis).toBeGreaterThan(0);
    expect(handleBox.height, axis).toBeGreaterThan(0);
    expect(await topmostIsWithin(item.locator(`.react-resizable-handle-${axis}`), center(handleBox)), axis).toBe(true);
  }
  // 広げ直せる（2列から右の辺で広げる）
  const moved = (await item.boundingBox())!;
  const east = (await item.locator('.react-resizable-handle-e').boundingBox())!;
  await dragBy(page, center(east), Math.round(3 * colStep), 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(5);
  expect((await item.boundingBox())!.width).toBeGreaterThan(moved.width);
});

test('面が狭い時（縦積みに切り替わる760pxの直上）は、2列では⋯に届かないので、届く幅の列数で止まる', async ({ page }) => {
  await open(page, 'light', { width: 761, height: 900 });
  const handle = (await itemLocator(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
  await dragBy(page, center(handle), -1000, 0);
  const item = itemLocator(page, 'a');
  const frame = (await item.boundingBox())!;
  // 2列（35px前後）ではなく、100px以上で止まる
  expect((await itemOf(page, 'a')).w).toBeGreaterThan(2);
  expect(frame.width).toBeGreaterThanOrEqual(100);
  // ⋯は枠の中にあり、右の辺のつまみ（6px）に重ならず、押してメニューが開く
  const menu = item.getByRole('button', { name: /の操作$/ });
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(frame.x);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(frame.x + frame.width - 6);
  expect(await topmostIsWithin(menu, center(menuBox))).toBe(true);
  await menu.click();
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // つかみの絵は一番手前にある
  const grip = item.locator('.workspace-grip-icon');
  expect(await topmostIsWithin(item.locator('.workspace-drag-handle'), center((await grip.boundingBox())!))).toBe(true);
});

test('保存した幅が今の下限より狭くても、下の辺を引くと高さだけが変わる（幅は広がらない）', async ({ page }) => {
  await open(page, 'light', { width: 761, height: 900 }, [
    { id: 'a', x: 0, y: 0, w: 2, h: 16 },
    { id: 'b', x: 8, y: 0, w: 8, h: 16 },
    { id: 'c', x: 16, y: 0, w: 8, h: 16 },
  ]);
  const south = (await itemLocator(page, 'a').locator('.react-resizable-handle-s').boundingBox())!;
  await dragBy(page, center(south), 0, 80);
  await expect.poll(async () => (await itemOf(page, 'a')).h).toBeGreaterThan(16);
  expect(await itemOf(page, 'a')).toMatchObject({ x: 0, w: 2 });
});

test('下限の列数は、面の幅が変わると計算し直される（左のメニューの固定・固定を外す）', async ({ page }) => {
  await open(page, 'light', { width: 1500, height: 900 });
  const pin = page.getByRole('button', { name: 'サイドバーを固定' });
  const shrink = async () => {
    const handle = (await itemLocator(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
    await dragBy(page, center(handle), -1000, 0);
  };
  // 左のメニューを固定している間は面が1260px。2列は96pxで足りないので3列で止まる
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await shrink();
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(3);
  // 固定を外すと面が広がり、2列で足りる
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await settle(page);
  await shrink();
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBe(2);
});

test('保存した高さが今の下限より低くても、右の辺を引くと幅だけが変わる（高さは広がらない）', async ({ page }) => {
  await open(page, 'light', FHD, [
    { id: 'a', x: 0, y: 0, w: 8, h: 4 },
    { id: 'b', x: 8, y: 0, w: 8, h: 16 },
    { id: 'c', x: 16, y: 0, w: 8, h: 16 },
  ]);
  const east = (await itemLocator(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
  await dragBy(page, center(east), -80, 0);
  await expect.poll(async () => (await itemOf(page, 'a')).w).toBeLessThan(8);
  expect(await itemOf(page, 'a')).toMatchObject({ x: 0, h: 4 });
});

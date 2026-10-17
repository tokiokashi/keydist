import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { COL_STEP, cell, dragPane, itemOf, open, settle, stored } from './workspace-grid-helper.ts';

/**
 * Workspaceの列の幅は面の幅に依らない固定の値。ペインの画素の幅は持っている列の数だけで決まり、
 * 並びが面より広い時だけ面の中で横にスクロールする。面が並びより広ければ右に空きが残り、そこへ置ける。
 */

const area = (page: Page): Locator => page.locator('.workspace-grid-area');
const item = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

/** 面の中で横にスクロールできるか（並びが面より広いか）。 */
const scrollsX = (page: Page) => area(page).evaluate((el) => el.scrollWidth > el.clientWidth + 1);

/** 面の左端を基準にした、ペインの左端と幅（スクロールの分を含む。画素）。 */
const placeOf = (page: Page, id: string) =>
  item(page, id).evaluate((el) => {
    const areaRect = el.closest('.workspace-grid-area')!.getBoundingClientRect();
    const scrollLeft = el.closest('.workspace-grid-area')!.scrollLeft;
    const rect = el.getBoundingClientRect();
    return { left: Math.round(rect.left - areaRect.left + scrollLeft), width: Math.round(rect.width) };
  });

const THREE = [cell('a', 0, 0, 6, 8), cell('b', 6, 0, 12, 8), cell('c', 18, 0, 6, 8)];

test('面の幅を変えても、ペインの画素の幅と面に対する位置は変わらず、並びも書き換わらない。狭めてから戻しても同じ', async ({ page }) => {
  await open(page, ['a', 'b', 'c'], THREE, { width: 2560, height: 900 });
  const gridBefore = await stored(page);
  const expected = async () => {
    const places = [];
    for (const { id, x, w } of THREE) places.push({ id, ...(await placeOf(page, id)), x, w });
    return places;
  };
  const check = async (label: string) => {
    for (const place of await expected()) {
      expect(Math.abs(place.width - (place.w * COL_STEP - 8)), `${label}: ${place.id}の幅`).toBeLessThanOrEqual(1);
      expect(Math.abs(place.left - (8 + place.x * COL_STEP)), `${label}: ${place.id}の位置`).toBeLessThanOrEqual(1);
    }
  };
  await check('2560');
  for (const width of [1920, 1280, 1000, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await check(String(width));
    expect(await stored(page), `${width}`).toEqual(gridBefore);
  }
});

test('並びが面に収まる時は横にスクロールせず、面より広い時だけ横にスクロールして、はみ出したペインを操作できる', async ({ page }) => {
  // 24列はFHD（1920px）でサイドバーを固定した面に、縦のスクロールバーがあっても収まる
  await open(page, ['a', 'b', 'c'], THREE, { width: 1920, height: 600 });
  expect(await scrollsX(page)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1100, height: 600 });
  await settle(page);
  expect(await scrollsX(page)).toBe(true);
  // 文脈バーとページは横にはみ出さない
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.locator('.context-bar').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

  // 右端のペインは、スクロールするまで面の外にある
  const frame = (await area(page).boundingBox())!;
  expect((await item(page, 'c').boundingBox())!.x).toBeGreaterThanOrEqual(frame.x + frame.width);
  await area(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await settle(page);
  const c = (await item(page, 'c').boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(c.x).toBeGreaterThanOrEqual(frame.x - 1);

  // はみ出していたペインの操作（⋯のメニュー）と、ドラッグ（2列左へ）が効く
  await item(page, 'c')
    .getByRole('button', { name: /の操作$/ })
    .click();
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await dragPane(page, 'c', -2 * COL_STEP, 0);
  await expect.poll(async () => (await itemOf(page, 'c')).x).toBe(16);
});

test('面が並びより広い時は、右の空き（24列より右）へペインを動かせ、読み込み直しても位置が保たれる', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 6, 8)], { width: 2560, height: 900 });
  // 24列に収まるサンプルより広い面。右に空きが残る
  expect(await scrollsX(page)).toBe(false);
  await dragPane(page, 'a', 26 * COL_STEP, 0);
  await expect.poll(async () => (await itemOf(page, 'a')).x).toBeGreaterThan(24);
  const moved = await itemOf(page, 'a');
  expect(moved.x + moved.w).toBeGreaterThan(24);
  expect(moved.w).toBe(6);
  await page.reload();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(1);
  await settle(page);
  expect(await itemOf(page, 'a')).toEqual(moved);
  const place = await placeOf(page, 'a');
  expect(Math.abs(place.left - (8 + moved.x * COL_STEP))).toBeLessThanOrEqual(1);
});

test('見えている範囲より右へは、ドラッグで枠が右端に届くと列が伸び、端に近づけたまま待つと面が横にスクロールして、置ける', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 6, 8)], { width: 1280, height: 900 });
  expect(await scrollsX(page)).toBe(false);
  const frame = (await area(page).boundingBox())!;
  const visibleCols = Math.floor((frame.width - 8) / COL_STEP);
  const grab = (await item(page, 'a').locator('.workspace-drag-handle').boundingBox())!;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(grab.x + grab.width / 2, y);
  await page.mouse.down();
  const edgeX = frame.x + frame.width - 20;
  await page.mouse.move(edgeX, y, { steps: 12 });
  // 端に近づけたまま、面が横にスクロールするまで待つ（ポインタを少し動かし続ける）
  let jitter = 0;
  await expect
    .poll(
      async () => {
        jitter = 1 - jitter;
        await page.mouse.move(edgeX + jitter, y);
        return area(page).evaluate((el) => el.scrollLeft);
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(2 * COL_STEP);
  await page.mouse.up();
  await settle(page);
  const placed = await itemOf(page, 'a');
  expect(placed.x + placed.w).toBeGreaterThan(visibleCols);
  expect(placed.w).toBe(6);
  // 離すと、並びの右端までの幅になる。読み込み直しても位置が保たれる
  expect(await scrollsX(page)).toBe(true);
  await page.reload();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(1);
  await settle(page);
  expect(await itemOf(page, 'a')).toEqual(placed);
});

test('見えている範囲より右へは、右の辺で広げても伸ばせる', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 6, 8)], { width: 1280, height: 900 });
  const frame = (await area(page).boundingBox())!;
  const visibleCols = Math.floor((frame.width - 8) / COL_STEP);
  const east = (await item(page, 'a').locator('.react-resizable-handle-e').boundingBox())!;
  const y = east.y + east.height / 2;
  await page.mouse.move(east.x + east.width / 2, y);
  await page.mouse.down();
  const edgeX = frame.x + frame.width - 20;
  await page.mouse.move(edgeX, y, { steps: 12 });
  let jitter = 0;
  await expect
    .poll(
      async () => {
        jitter = 1 - jitter;
        await page.mouse.move(edgeX + jitter, y);
        return area(page).evaluate((el) => el.scrollLeft);
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(2 * COL_STEP);
  await page.mouse.up();
  await settle(page);
  const placed = await itemOf(page, 'a');
  expect(placed.x).toBe(0);
  expect(placed.w).toBeGreaterThan(visibleCols);
});

/** ペインの左右が、面の見えている範囲の中にあるか。 */
async function isHorizontallyVisible(page: Page, id: string): Promise<boolean> {
  const frame = (await area(page).boundingBox())!;
  const box = (await item(page, id).boundingBox())!;
  return box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1;
}

async function openScrolledRight(page: Page): Promise<void> {
  // 24列の並びを、面が16列ぶんの幅で開く。右へスクロールして、左のペインの一部が隠れる状態にする
  await open(page, ['a', 'b'], [cell('a', 0, 0, 12, 8), cell('b', 12, 0, 12, 8)], { width: 1400, height: 900 });
  expect(await scrollsX(page)).toBe(true);
  await area(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await settle(page);
  expect(await isHorizontallyVisible(page, 'a')).toBe(false);
}

test('ペインを足した時は、横にスクロールした面の今見えている範囲に出る', async ({ page }) => {
  await openScrolledRight(page);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  const added = (await stored(page)).find((entry) => entry.id !== 'a' && entry.id !== 'b')!;
  // 既定の幅（12列）が、見えている範囲（左の欠けた列を除く）の左端から、並びの下に置かれる
  expect(added.w).toBe(12);
  expect(added.x).toBeGreaterThan(0);
  expect(await isHorizontallyVisible(page, added.id)).toBe(true);
  // 他のペインは動かない
  expect(await itemOf(page, 'a')).toEqual(cell('a', 0, 0, 12, 8));
});

test('ペインを複製した時は、横にスクロールした面の今見えている範囲に出る', async ({ page }) => {
  await openScrolledRight(page);
  // bの右隣は見えている範囲の外。見えている範囲の中（真下）に置く
  await item(page, 'b')
    .getByRole('button', { name: /の操作$/ })
    .click();
  await page.getByRole('menuitem', { name: /複製/ }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  const copy = (await stored(page)).find((entry) => entry.id !== 'a' && entry.id !== 'b')!;
  expect([copy.x, copy.y, copy.w, copy.h]).toEqual([12, 8, 12, 8]);
  expect(await isHorizontallyVisible(page, copy.id)).toBe(true);
});

test('縦に長い並びで横にスクロールする時、横のスクロールバーは画面の下端に出る（ページの一番下まで行かなくても届く）', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 12, 40), cell('b', 12, 0, 12, 40)], { width: 1000, height: 700 });
  expect(await scrollsX(page)).toBe(true);
  const metrics = await page.evaluate(() => {
    const el = document.querySelector('.workspace-grid-area')!;
    const rect = el.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      innerHeight: window.innerHeight,
      pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
      areaScrollable: el.scrollHeight - el.clientHeight,
    };
  });
  // 面の下端が画面の中にあり、ページ自体は縦にスクロールしない。縦は面の中でスクロールする
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
  expect(metrics.areaScrollable).toBeGreaterThan(0);
});

test('横にスクロールした状態から拡大しても、拡大したペインは面の左端と帯の下から画面の右下までを使い、戻すとスクロールの位置も並びも保たれる', async ({
  page,
}) => {
  // 拡大できるのはAnalyzerのペインだけ（余白のペインには拡大の項目が無い）
  const flow = (id: string) => ({
    id,
    analyzerId: 'bigram-flow',
    binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } },
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(
    (value) => {
      if (localStorage.getItem('keydist:workspaces') === null)
        localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    },
    {
      id: 'g',
      name: '格子',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [flow('a'), flow('b')],
      grid: [cell('a', 0, 0, 12, 16), cell('b', 12, 0, 12, 16)],
    },
  );
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(2, { timeout: 15_000 });
  await settle(page);
  expect(await scrollsX(page)).toBe(true);
  await area(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await settle(page);
  const scrollBefore = await area(page).evaluate((el) => el.scrollLeft);
  const gridBefore = await stored(page);
  await item(page, 'b')
    .getByRole('button', { name: /の操作$/ })
    .click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect.poll(() => item(page, 'b').evaluate((el) => el.hasAttribute('data-maximized'))).toBe(true);
  await settle(page);
  const frame = (await area(page).boundingBox())!;
  const bar = (await page.locator('.context-bar').boundingBox())!;
  const box = (await item(page, 'b').boundingBox())!;
  const view = page.viewportSize()!;
  // 面の左端・帯の下から、画面の右下まで（外周の余白8pxを除く）。横にスクロールした位置には依らない
  expect(Math.abs(box.x - (frame.x + 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - (bar.y + bar.height + 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x + box.width - (view.width - 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height - (view.height - 8))).toBeLessThanOrEqual(1);
  // 文脈バーとページは横にはみ出さない
  expect(await page.locator('.context-bar').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.keyboard.press('Escape');
  await expect.poll(() => item(page, 'b').evaluate((el) => el.hasAttribute('data-maximized'))).toBe(false);
  await settle(page);
  expect(await area(page).evaluate((el) => el.scrollLeft)).toBe(scrollBefore);
  expect(await stored(page)).toEqual(gridBefore);
});

/** ペインの上端（画面の上からの画素）。縦に動いたかを、スクロールの有無に依らず測る。 */
const viewportTop = (page: Page, id: string) => item(page, id).evaluate((el) => Math.round(el.getBoundingClientRect().top));

const TALL = [cell('a', 0, 0, 12, 20), cell('b', 12, 0, 12, 20), cell('c', 0, 20, 12, 20)];

/** 24列が収まる幅で縦に長い並びを開き、ページを縦に600px下げる。 */
async function openScrolledDown(page: Page): Promise<void> {
  await open(page, ['a', 'b', 'c'], TALL, { width: 1920, height: 700 });
  expect(await scrollsX(page)).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
}

/** 縦に動かしていないことを、保存した並びで確かめる。 */
async function expectRowsKept(page: Page): Promise<void> {
  const rows = await stored(page);
  expect(rows.find((entry) => entry.id === 'c')!.y).toBe(20);
  expect(rows.find((entry) => entry.id === 'a')!.y).toBe(0);
  expect(rows.find((entry) => entry.id === 'b')!.y).toBe(0);
}

test('縦にスクロールした状態からつかみ所で右端まで動かして列が伸びても、枠はポインタの下に残り、他の枠は縦に動かない', async ({ page }) => {
  await openScrolledDown(page);
  const before = await viewportTop(page, 'c');
  const grab = (await item(page, 'c').locator('.workspace-drag-handle').boundingBox())!;
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12 * COL_STEP, y, { steps: 12 });
  // 列が伸びて横にスクロールする状態になっても、枠の高さの位置は変わらない
  await expect.poll(() => scrollsX(page)).toBe(true);
  await settle(page);
  expect(Math.abs((await viewportTop(page, 'c')) - before)).toBeLessThanOrEqual(2);
  await page.mouse.up();
  await settle(page);
  await expectRowsKept(page);
});

test('縦にスクロールした状態から右の辺で広げて列が伸びても、枠はポインタの下に残り、他の枠は縦に動かない', async ({ page }) => {
  await openScrolledDown(page);
  const before = await viewportTop(page, 'c');
  const east = (await item(page, 'c').locator('.react-resizable-handle-e').boundingBox())!;
  const x = east.x + east.width / 2;
  const y = east.y + east.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12 * COL_STEP, y, { steps: 12 });
  await expect.poll(() => scrollsX(page)).toBe(true);
  await settle(page);
  expect(Math.abs((await viewportTop(page, 'c')) - before)).toBeLessThanOrEqual(2);
  await page.mouse.up();
  await settle(page);
  await expectRowsKept(page);
});

test('横にスクロールしない幅と横にスクロールする幅の間で窓の幅を変えても、見えている行は変わらない', async ({ page }) => {
  await openScrolledDown(page);
  const before = await viewportTop(page, 'c');
  await page.setViewportSize({ width: 1500, height: 700 });
  await settle(page);
  expect(await scrollsX(page)).toBe(true);
  expect(Math.abs((await viewportTop(page, 'c')) - before)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 1920, height: 700 });
  await settle(page);
  expect(await scrollsX(page)).toBe(false);
  expect(Math.abs((await viewportTop(page, 'c')) - before)).toBeLessThanOrEqual(2);
});

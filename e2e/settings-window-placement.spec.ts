import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 解析設定の小窓は、ペインの右上の操作（Bigram Flowの図の「表示」ボタン等）を覆わない位置に出る（#887）。
 * 縦積みのBigram Flowは、図の見出し行の右端に表示ボタンがあり、小窓が「解析設定」の真下に右端を揃えて出ると重なっていた。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const pane = {
  id: 'a',
  analyzerId: 'bigram-flow',
  binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } },
};

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openWorkspace(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
  }, {
    key: WORKSPACES_KEY,
    value: {
      id: 'm',
      name: '小窓',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [pane],
      grid: [{ id: 'a', x: 0, y: 0, w: 12, h: 20 }],
      groups: [{ id: 'g1', target: { single: QWERTY } }],
    },
  });
  await page.goto('/workspace/m');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(1, { timeout: 15_000 });
}

/** 小窓を開き、図の「表示」ボタンすべてと小窓の矩形を測る（位置が落ち着くまで待つ）。 */
async function openAndMeasure(page: Page) {
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const win = page.locator('[data-settings-window="true"]');
  await expect(win).toBeVisible();
  const buttons = page.locator('.pane-frame button[aria-label$="の表示"]');
  await expect(buttons).toHaveCount(2);
  await page.waitForTimeout(500);
  const windowBox = (await win.boundingBox())!;
  const boxes: Box[] = [];
  for (let i = 0; i < 2; i += 1) boxes.push((await buttons.nth(i).boundingBox())!);
  return { windowBox, boxes, buttons };
}

async function expectClear(page: Page): Promise<void> {
  const { windowBox, boxes, buttons } = await openAndMeasure(page);
  const view = page.viewportSize()!;
  for (const box of boxes) {
    expect(overlaps(windowBox, box), `小窓 ${JSON.stringify(windowBox)} が表示ボタン ${JSON.stringify(box)} を覆う`).toBe(false);
  }
  // 画面の外へはみ出さない
  expect(windowBox.x).toBeGreaterThanOrEqual(0);
  expect(windowBox.y).toBeGreaterThanOrEqual(0);
  expect(windowBox.x + windowBox.width).toBeLessThanOrEqual(view.width);
  expect(windowBox.y + windowBox.height).toBeLessThanOrEqual(view.height + 1);
  // 押せる（実際に届く）
  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute('aria-expanded', 'true');
}

test('1920×1080でペイン1つのBigram Flow。小窓は表示ボタンを覆わない', async ({ page }) => {
  await openWorkspace(page, { width: 1920, height: 1080 });
  await expectClear(page);
});

test('1440×900でペイン1つを拡大表示。小窓は表示ボタンを覆わない。Escapeは小窓だけ閉じる', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  await page.locator('.workspace-grid-item[data-pane-id="a"] .pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(page.locator('.workspace-grid-item[data-maximized]')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expectClear(page);
  // 図の表示を開いたあと、小窓へフォーカスを戻してEscape: 小窓だけ閉じ、拡大は残る
  await page.locator('[data-settings-window="true"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-settings-window="true"]')).toHaveCount(0);
  await expect(page.locator('.workspace-grid-item[data-maximized]')).toHaveCount(1);
});

test('個別画面（1920×1080）でも、小窓は表示ボタンを覆わない', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(1, { timeout: 15_000 });
  await expectClear(page);
});

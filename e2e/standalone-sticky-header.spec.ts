import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings, openTargetSelection, targetButton } from './pane-helper.ts';

/**
 * 個別画面では、ペインの見出し（Analyzer名 / 対象 / 解析設定 / ⋯）を文脈バーの下に一緒に固定する。
 * 図を下までスクロールしても対象と解析設定を変えられること、開いた選択・小窓が見出しからずれないことを確かめる。
 */

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} が見えない`);
  return box;
}

/** ページを下までスクロールする。スクロールできる高さが無ければ固定の検証にならないので失敗させる。 */
async function scrollDown(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
}

async function expectHeaderPinnedBelowContextBar(page: Page) {
  const bar = await boxOf(page, '.context-bar');
  const header = await boxOf(page, '.pane-frame-header');
  expect(Math.abs(header.y - (bar.y + bar.height))).toBeLessThanOrEqual(1.5);
}

test('スクロールしても見出しが文脈バーの下に残り、対象の選択・解析設定が見出しの近くに出る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });

  await scrollDown(page);
  await expectHeaderPinnedBelowContextBar(page);
  await expect(targetButton(page)).toBeInViewport();

  // スクロール後に開く: 見出しの直下に出る。
  const panel = await openTargetSelection(page);
  const header = await boxOf(page, '.pane-frame-header');
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(Math.abs(panelBox!.y - (header.y + header.height))).toBeLessThanOrEqual(24);

  // 開いたままスクロールしても、同じ位置にある。
  const before = panelBox!.y;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => Math.abs(((await panel.boundingBox())?.y ?? -1000) - before)).toBeLessThanOrEqual(1.5);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // 解析設定の小窓はボタンの下に出る。開いたままスクロールしても、ボタンが動かないので位置関係は保たれる。
  const settings = await openSettings(page);
  const button = await boxOf(page, '.pane-settings-button');
  const windowBox = await settings.boundingBox();
  expect(windowBox).not.toBeNull();
  expect(Math.abs(windowBox!.y - (button.y + button.height))).toBeLessThanOrEqual(12);
  await page.evaluate(() => window.scrollTo(0, 0));
  const button2 = await boxOf(page, '.pane-settings-button');
  const windowBox2 = await settings.boundingBox();
  expect(Math.abs(windowBox2!.y - (button2.y + button2.height))).toBeLessThanOrEqual(12);
});

test('スマホ幅でも見出しは文脈バーの下に残る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await scrollDown(page);
  await expectHeaderPinnedBelowContextBar(page);
  await expect(targetButton(page)).toBeInViewport();
});

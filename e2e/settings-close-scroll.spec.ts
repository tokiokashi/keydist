import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings } from './pane-helper.ts';

/**
 * 見出しを固定しないペイン（Workspaceのペイン）で、解析設定の小窓を閉じてもスクロール位置が動かないこと。
 * 閉じたあとボタンへフォーカスを戻す時に、ブラウザが先頭までスクロールしてしまう不具合の再発を防ぐ。
 * 今の個別画面は見出しを固定するので症状が出ない。固定をCSSで外して、固定しないペインの状態を作る。
 */

async function openBelowFold(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await page.addStyleTag({ content: '.pane-frame-header[data-sticky] { position: static !important; }' });
  // 小窓はボタンの下に出るので、ボタンが見える位置で開いてから、下へスクロールする（開いたままでも小窓は残る）。
  await openSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect(page.locator('.pane-settings-button')).not.toBeInViewport();
}

test('解析設定をEscapeで閉じても、スクロール位置が動かない', async ({ page }) => {
  await openBelowFold(page);
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('[data-settings-window="true"]').press('Escape');
  await expect(page.locator('[data-settings-window="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('解析設定を閉じるボタンで閉じても、スクロール位置が動かない', async ({ page }) => {
  await openBelowFold(page);
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(page.locator('[data-settings-window="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

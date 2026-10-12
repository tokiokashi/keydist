import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
const S = '/tmp/claude-0/-home-user/a907044a-d758-5dd8-8f2c-b4117996792a/scratchpad';
test('shot workspace phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /打鍵再生/ }).click();
  const f = page.locator('[data-react-feature="playback"]');
  await expect(f).toBeVisible({ timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: S + '/c203-workspace-phone-closed.png', fullPage: true });
  await f.getByRole('button', { name: '配列図の表示', exact: true }).click();
  await page.screenshot({ path: S + '/c203-workspace-phone-open.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

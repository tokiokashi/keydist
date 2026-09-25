import { expect, test } from '@playwright/test';
import { gotoAnalyzer } from './analyzer-helper.ts';

test('Conditions content is React-hosted and restores defaults from AppState', async ({ page }) => {
  await gotoAnalyzer(page);

  await page.locator('#conditions-open').click();
  const conditions = page.locator('[data-react-feature="conditions"]');
  await expect(conditions).toBeVisible();

  const defaultWindow = conditions.locator('.condition-grid tbody tr').first().locator('input[type="number"]').first();
  await expect(defaultWindow).toBeVisible();
  await defaultWindow.fill('5');
  await defaultWindow.blur();

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).conditions?.defaults?.windowSize ?? null : null;
  })).toBe(5);

  await page.reload();
  await page.locator('#conditions-open').click();

  await expect(
    page.locator('[data-react-feature="conditions"] .condition-grid tbody tr')
      .first()
      .locator('input[type="number"]')
      .first(),
  ).toHaveValue('5');
});

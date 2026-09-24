import { expect, test } from '@playwright/test';

test('remaining Analyzer controls are React-owned and detail selection restores from AppState', async ({ page }) => {
  await page.goto('/legacy.html');

  const sidebar = page.locator('[data-react-feature="sidebar-controls"]');
  const geometry = page.locator('[data-react-feature="geometry-controls"]');
  await expect(sidebar).toBeVisible();
  await expect(geometry).toBeVisible();

  const detail = sidebar.locator('#detail-layout');
  const optionCount = await detail.locator('option').count();
  expect(optionCount).toBeGreaterThan(0);

  const target = await detail.locator('option').nth(Math.min(1, optionCount - 1)).getAttribute('value');
  expect(target).toBeTruthy();
  await detail.selectOption(target!);

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.layouts?.detailByMode?.ja ?? null : null;
  })).toBe(target);

  await page.reload();
  await expect(page.locator('[data-react-feature="sidebar-controls"] #detail-layout')).toHaveValue(target!);
});

test('How and Conditions dialog shells are React-owned', async ({ page }) => {
  await page.goto('/legacy.html');

  await page.locator('#how-open').click();
  await expect(page.locator('#how-dialog')).toHaveAttribute('open', '');
  await expect(page.locator('[data-react-feature="how-dialog"]')).toBeVisible();
  await page.locator('[data-react-feature="how-dialog"] #how-close').click();

  await page.locator('#conditions-open').click();
  await expect(page.locator('#conditions-dialog')).toHaveAttribute('open', '');
  await expect(page.locator('[data-react-feature="conditions-dialog"]')).toBeVisible();
  await expect(page.locator('[data-react-feature="conditions"]')).toBeVisible();
  await page.locator('[data-react-feature="conditions-dialog"] #conditions-close').click();
});

test('legacy panel open state is coordinated by React and restores through AppState', async ({ page }) => {
  await page.goto('/legacy.html');

  const textPanel = page.locator('#text-panel');
  await expect(textPanel).toHaveAttribute('open', '');

  await textPanel.locator('summary').click();
  await expect(textPanel).not.toHaveAttribute('open', '');

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.panels?.text ?? null : null;
  })).toBe(false);

  await page.reload();
  await expect(page.locator('#text-panel')).not.toHaveAttribute('open', '');
});

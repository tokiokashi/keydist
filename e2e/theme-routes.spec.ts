import { expect, test } from '@playwright/test';

test('theme authority survives SPA route transitions and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Analyzer', exact: true }).click();

  const controls = page.locator('[data-react-feature="theme-controls"]');
  await expect(controls).toBeVisible();
  await controls.locator('[data-theme-set="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('link', { name: 'Tester' }).click();
  await expect(page).toHaveURL(/\/input$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('explicit light overrides a dark OS preference and system follows it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/input');
  await page.evaluate(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe('light');

  await page.evaluate(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'system' },
    }));
  });
  await page.reload();

  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe('dark');
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
  )).toBe('#1c1c1a');
});

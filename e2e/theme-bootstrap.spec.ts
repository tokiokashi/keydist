import { expect, test } from '@playwright/test';

test('explicit theme is applied by the head bootstrap before client scripts run', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'dark' },
    }));
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/input', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

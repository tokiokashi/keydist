import { expect, test } from '@playwright/test';

test('explicit theme is applied by the head bootstrap before client scripts run', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:app-state',
      JSON.stringify({
        version: 2,
        appearance: { theme: 'dark' },
      }),
    );
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

test('an invalid appearance.theme leaves the system theme even when analyzer.theme holds a valid one', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:app-state',
      JSON.stringify({
        version: 2,
        appearance: { theme: 'not-a-real-theme' },
        analyzer: { theme: 'dark' },
      }),
    );
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/input', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('the legacy ui-state and theme keys are not read as the theme before client scripts run', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:ui-state', JSON.stringify({ version: 1, ui: { theme: 'dark' } }));
    localStorage.setItem('keydist:theme', 'dark');
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/input', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

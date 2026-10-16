import { expect, test } from '@playwright/test';

/**
 * 別のタブでテーマを変えたら、サイドバーのテーマ切替がstorageイベントで追従する。
 */
test('a theme change in another tab syncs the controls via the storage event', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await pageA.goto('/input');
  await pageB.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await pageB.goto('/input');

  await expect(
    pageA.locator('#app-sidebar [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    pageB.locator('#app-sidebar [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await pageA.locator('#app-sidebar [data-theme-set="dark"]').click();

  // pageBはstorage eventを受けてタブを跨いで自動的に追従する。
  await expect(
    pageB.locator('#app-sidebar [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(pageB.locator('html')).toHaveAttribute('data-theme', 'dark');
});

import { expect, test } from '@playwright/test';

test('Playback surface is React-hosted and panel state restores from AppState', async ({ page }) => {
  await page.goto('/legacy.html');

  const surface = page.locator('[data-react-feature="playback"]');
  await expect(surface).toBeVisible();

  const panel = surface.locator('.playback-panel');
  await expect(panel).not.toHaveAttribute('open', '');

  await panel.locator(':scope > summary').click();
  await expect(panel).toHaveAttribute('open', '');

  const position = surface.locator('[data-playback-position]');
  await surface.getByRole('button', { name: /1 ステップ進む/ }).click();
  await expect(position).toHaveText(/^1 \/ /);

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.panels?.playback : null;
  })).toBe(true);

  await page.reload();

  await expect(page.locator('[data-react-feature="playback"] .playback-panel'))
    .toHaveAttribute('open', '');
});

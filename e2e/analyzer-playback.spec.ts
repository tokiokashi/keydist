import { expect, test } from '@playwright/test';
import { gotoAnalyzer } from './analyzer-helper.ts';

test('Playback surface is React-hosted and panel state restores from AppState', async ({ page }) => {
  await gotoAnalyzer(page);

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

test('Playback settings are React-hosted and restore through the AppState playback slice', async ({ page }) => {
  await gotoAnalyzer(page);

  const surface = page.locator('[data-react-feature="playback"]');
  await expect(surface).toBeVisible();

  const panel = surface.locator('.playback-panel');
  if (!(await panel.getAttribute('open'))) {
    await panel.locator(':scope > summary').click();
  }
  await surface.locator('[data-playback-settings-open]').click();
  const settings = page.locator('[data-react-feature="playback-settings"]');
  await expect(settings).toBeVisible();

  const trail = settings.locator('input[data-playback-trail]');
  const next = !(await trail.isChecked());
  await trail.setChecked(next);

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).playback?.showTrail ?? null : null;
  })).toBe(next);

  await page.reload();
  await page.locator('[data-react-feature="playback"] [data-playback-settings-open]').click();
  await expect(page.locator('[data-react-feature="playback-settings"] input[data-playback-trail]'))
    .toBeChecked({ checked: next });
});

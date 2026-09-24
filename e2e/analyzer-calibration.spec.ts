import { expect, test } from '@playwright/test';

test('Calibration dialog is React-owned and opens through Playback settings', async ({ page }) => {
  await page.goto('/legacy.html');

  const calibration = page.locator('[data-react-feature="calibration"]');
  await expect(calibration).toHaveCount(1);

  const playback = page.locator('[data-react-feature="playback"]');
  const playbackPanel = playback.locator('.playback-panel');
  if (!(await playbackPanel.getAttribute('open'))) {
    await playbackPanel.locator(':scope > summary').click();
  }
  await playback.locator('[data-playback-settings-open]').click();

  const settings = page.locator('[data-react-feature="playback-settings"]');
  await settings.locator('[data-playback-settings-tab="conditions"]').click();
  await settings.locator('[data-playback-action="calibration-edit"]').click();

  const dialog = page.locator('#playback-calibration-dialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(calibration.locator('#playback-calibration-start')).toBeVisible();
  await expect(calibration.locator('#playback-calibration-instruction')).toContainText('通常の打鍵速度');

  await calibration.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');
});

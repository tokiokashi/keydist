import { expect, test } from '@playwright/test';

test('Input Converter keeps browser key lifecycle consistent', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', /.+/);
  await page.getByLabel('配列').selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');

  const capture = page.getByRole('textbox', { name: '物理キー入力エリア' });
  const output = page.getByLabel('自由入力テキスト');
  const pressed = page.locator('.input-inspector section').first().locator('p');

  await capture.click();
  await expect(capture).toContainText('入力受付中');

  await page.keyboard.press('h');
  await expect(output).toHaveValue('く');

  await page.getByRole('button', { name: 'クリア' }).click();
  await capture.click();
  await page.keyboard.press('s');
  await expect(output).toHaveValue('か');
  await page.keyboard.press('l');
  await expect(output).toHaveValue('が');

  await page.keyboard.down('d');
  await expect(pressed).toHaveText('d');

  await page.getByLabel('配列').focus();
  await expect(pressed).toHaveText('—');

  await capture.click();
  await page.keyboard.down('h');
  await expect(pressed).toHaveText('h');

  await page.keyboard.down('Control');
  await page.keyboard.up('h');
  await page.keyboard.up('Control');
  await expect(pressed).toHaveText('—');

  await page.getByRole('button', { name: 'クリア' }).click();
  await page.getByLabel('配列').selectOption('qwerty');
  await expect(feature).toHaveAttribute('data-input-ready', 'qwerty');
  await capture.click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('a');
  await page.keyboard.up('Shift');
  await expect(output).toHaveValue('A');
});

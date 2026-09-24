import { expect, test } from '@playwright/test';

test('Romaji editor dialog is React-owned and preserves editor interactions', async ({ page }) => {
  await page.goto('/legacy.html');

  await page.locator('#romaji-settings').click();

  const dialog = page.locator('#romaji-dialog');
  const editor = dialog.locator('[data-react-feature="romaji-dialog"]');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: '新しい綴りを作る' }).click();
  await expect(editor.locator('#romaji-name')).toBeFocused();
  await expect(editor.locator('#romaji-edit')).toHaveValue('');

  await editor.locator('#romaji-base').selectOption('azik');
  await expect(editor.locator('#romaji-sokuon')).not.toBeChecked();

  await editor.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');
});

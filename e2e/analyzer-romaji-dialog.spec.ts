import { expect, test } from '@playwright/test';

test('Romaji editor dialog is React-owned and preserves editor interactions', async ({ page }) => {
  await page.goto('/analyzer');

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

  await editor.locator('#romaji-name').fill('React移行テスト');
  await editor.locator('#romaji-overrides').fill('しゃ = sha');
  await editor.getByRole('button', { name: 'この内容を保存する' }).click();
  await expect(editor.locator('#romaji-edit')).toHaveValue(/^custom-/);

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:romaji-rules');
    if (!raw) return null;
    const settings = JSON.parse(raw);
    return settings.rules?.find((rule: { name?: string }) => rule.name === 'React移行テスト') ?? null;
  })).toMatchObject({
    name: 'React移行テスト',
    base: 'azik',
    generateSokuon: false,
    overrides: { しゃ: 'sha' },
  });

  await editor.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');
});

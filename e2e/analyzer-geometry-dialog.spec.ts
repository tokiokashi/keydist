import { expect, test } from '@playwright/test';

test('Geometry editor dialog is React-owned and keeps existing editor behavior', async ({ page }) => {
  await page.goto('/legacy.html');

  const panel = page.locator('#geometry-panel');
  if (!(await panel.getAttribute('open'))) {
    await panel.locator(':scope > summary').click();
  }
  await page.locator('#geometry-edit').click();

  const dialog = page.locator('#geometry-dialog');
  const editor = dialog.locator('[data-react-feature="geometry-dialog"]');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(editor).toBeVisible();

  const name = editor.locator('#geometry-modal-name');
  await expect(name).not.toHaveValue('');

  const unit = editor.locator('#geometry-modal-unit');
  await unit.selectOption('u');
  await expect(unit).toHaveValue('u');
  await expect(editor.locator('#geometry-modal-editor')).not.toBeEmpty();

  await editor.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');
});

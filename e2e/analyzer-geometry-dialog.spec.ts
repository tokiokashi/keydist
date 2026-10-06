import { expect, test } from '@playwright/test';
import { gotoAnalyzer } from './analyzer-helper.ts';

test('Geometry editor dialog is React-owned and keeps existing editor behavior', async ({ page }) => {
  await gotoAnalyzer(page);

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

  const paintFinger = editor.locator('.assignment-fields .ctl select');
  await paintFinger.selectOption('RI');
  const firstKey = editor.locator('.assignment-key').first();
  await firstKey.click();
  await expect(firstKey).toHaveAttribute('data-finger', 'RI');

  await name.fill('E2E Geometry');
  await editor.getByRole('button', { name: '名前を付けて保存' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:geometry-shapes');
    if (!raw) return false;
    const shapes = JSON.parse(raw) as Array<{ name?: string }>;
    return shapes.some((shape) => shape.name === 'E2E Geometry');
  })).toBe(true);
});

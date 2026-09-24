import { expect, test } from '@playwright/test';

test('Layout editor is React-owned and new layout selection restores through AppState', async ({ page }) => {
  await page.goto('/analyzer');

  const panel = page.locator('#add-panel');
  if (!(await panel.getAttribute('open'))) await panel.locator('summary').click();

  const editor = page.locator('[data-react-feature="layout-editor"]');
  await expect(editor).toBeVisible();

  await editor.locator('#new-name').fill('Phase9 Test Layout');
  const rows = editor.locator('#new-rows input');
  await rows.nth(2).fill('asdfghjkl');
  await editor.locator('#add-layout').click();

  const pickerRow = page.locator('#layout-picker label').filter({ hasText: 'Phase9 Test Layout' });
  await expect(pickerRow).toBeVisible();
  await expect(pickerRow.getByRole('checkbox')).toBeChecked();

  const stored = await page.evaluate(() => {
    const layouts = JSON.parse(localStorage.getItem('keydist:layouts') ?? '[]');
    const layout = layouts.find((item: { name?: string }) => item.name === 'Phase9 Test Layout');
    const app = JSON.parse(localStorage.getItem('keydist:app-state') ?? '{}');
    return {
      id: layout?.id ?? null,
      en: app.analyzer?.layouts?.selectedByMode?.en ?? [],
      ja: app.analyzer?.layouts?.selectedByMode?.ja ?? [],
    };
  });

  expect(stored.id).toBeTruthy();
  expect(stored.en).toContain(stored.id);
  expect(stored.ja).toContain(stored.id);

  await page.reload();
  await expect(page.locator('#layout-picker label').filter({ hasText: 'Phase9 Test Layout' }))
    .toBeVisible();
});

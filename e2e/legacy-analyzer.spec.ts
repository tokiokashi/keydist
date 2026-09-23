import { expect, test } from '@playwright/test';

test('legacy Analyzer stays operational when shared layer/picker helpers change', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    console.error('[legacy pageerror]', error.stack ?? error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[legacy console]', message.text());
  });

  await page.goto('legacy.html');
  await page.waitForTimeout(250);
  expect(pageErrors, 'legacy startup must not throw before controls initialize').toEqual([]);

  await expect(page.locator('#analyzer-react-shell')).toHaveAttribute('data-analyzer-react-shell', 'mounted');
  const mode = page.locator('#mode');
  await expect(mode).toHaveValue('ja');
  await mode.selectOption('en');
  await expect(mode).toHaveValue('en');
  await mode.selectOption('ja');

  const text = page.locator('#text');
  const sample = page.locator('#sample');
  await expect(text).toBeVisible();
  await expect(sample).toHaveValue('legacy');

  await text.fill('custom analyzer input');
  await text.blur();
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:ui-state');
    return raw ? JSON.parse(raw).ui.input.customText : null;
  })).toBe('custom analyzer input');

  await mode.selectOption('en');
  await expect(text).toHaveValue('custom analyzer input');
  await page.locator('#sample-reset').click();
  await expect(text).not.toHaveValue('custom analyzer input');
  await mode.selectOption('ja');

  const layout = page.locator('#detail-layout');
  await expect(layout).toBeVisible();
  await expect(layout.locator('option[value="naginata-v18"]')).toHaveCount(1);
  await expect(page.locator('#heatmap svg').first()).toBeVisible();

  // detail-layoutは「選択中の配列」だけを出す。月は既定選択ではないのでpickerから有効化する。
  const tsukiPicker = page.locator('#layout-picker label').filter({ hasText: '月配列2-263式' });
  await expect(tsukiPicker).toBeVisible();
  await tsukiPicker.getByRole('checkbox').check();
  await expect(layout.locator('option[value="tsuki-2-263"]')).toHaveCount(1);

  await layout.selectOption('tsuki-2-263');
  await expect(layout).toHaveValue('tsuki-2-263');
  await expect(page.locator('#heatmap svg').first()).toBeVisible();

  await layout.selectOption('naginata-v18');
  await expect(layout).toHaveValue('naginata-v18');
  await expect(page.locator('#heatmap svg').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

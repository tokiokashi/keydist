import { expect, test } from '@playwright/test';
import { gotoAnalyzer, waitForAnalyzerRuntime } from './analyzer-helper.ts';

test('Analyzer route stays operational when shared layer/picker helpers change', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    console.error('[analyzer pageerror]', error.stack ?? error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[analyzer console]', message.text());
  });

  await gotoAnalyzer(page);
  await page.waitForTimeout(250);
  expect(pageErrors, 'Analyzer startup must not throw before controls initialize').toEqual([]);

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
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.input?.customText ?? null : null;
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


test('legacy Analyzer URL redirects to the React Analyzer route', async ({ page }) => {
  await page.goto('/legacy.html');
  await expect(page).toHaveURL(/\/analyzer\/?$/);
  await waitForAnalyzerRuntime(page);
});


test('Analyzer runtime remounts after SPA navigation away and back', async ({ page }) => {
  await page.goto('/input');
  await page.getByRole('link', { name: 'Analyzer' }).click();
  await expect(page).toHaveURL(/\/analyzer\/?$/);
  await waitForAnalyzerRuntime(page);
  await expect(page.locator('#mode')).toHaveValue('ja');

  await page.goBack();
  await expect(page).toHaveURL(/\/input\/?$/);
  await expect(page.locator('.input-feature')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/analyzer\/?$/);
  await waitForAnalyzerRuntime(page);
  await expect(page.locator('#mode')).toHaveValue('ja');
  await expect(page.locator('#heatmap svg').first()).toBeVisible();
});

test('Analyzer topbar title returns to the app root', async ({ page }) => {
  await gotoAnalyzer(page);
  await expect(page.locator('.app-header')).toHaveCount(0);

  await page.locator('.topbar').getByRole('link', { name: 'keydist', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.app-header')).toBeVisible();
});

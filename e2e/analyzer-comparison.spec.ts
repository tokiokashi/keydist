import { expect, test } from '@playwright/test';

test('comparison and sensitivity controls are React-owned and restore from AppState', async ({ page }) => {
  await page.goto('/legacy.html');

  const comparison = page.locator('[data-react-feature="comparison-metrics"]');
  await expect(comparison).toBeVisible();

  const baseline = page.locator('#compare-baseline');
  const baselineValue = await baseline.locator('option').nth(1).getAttribute('value');
  expect(baselineValue).toBeTruthy();
  await baseline.selectOption(baselineValue!);

  const chartMetric = page.locator('#compare-chart-metric');
  await chartMetric.selectOption('2');

  const sensitivity = page.locator('[data-react-feature="sensitivity-scale"]');
  await sensitivity.getByRole('button', { name: '絶対 [u]' }).click();

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    if (!raw) return null;
    const state = JSON.parse(raw);
    return {
      baseline: state.analyzer?.comparison?.baselineByMode?.ja ?? null,
      chartColumn: state.analyzer?.comparison?.chartColumn ?? null,
      sensitivity: state.analyzer?.sensitivity?.scale ?? null,
    };
  })).toEqual({
    baseline: baselineValue,
    chartColumn: 2,
    sensitivity: 'absolute',
  });

  await page.reload();

  await expect(page.locator('#compare-baseline')).toHaveValue(baselineValue!);
  await expect(page.locator('#compare-chart-metric')).toHaveValue('2');
  await expect(
    page.locator('[data-react-feature="sensitivity-scale"]').getByRole('button', { name: '絶対 [u]' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

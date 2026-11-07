import { expect, test } from './fixtures.ts';

test('Tester restores selected layout and physical geometry after reload', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const geometrySelect = page.getByLabel('物理配列');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await layoutSelect.selectOption('tsuki-2-263');
  await geometrySelect.selectOption('column-staggered');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await expect(layoutSelect).toHaveValue('tsuki-2-263');
  await expect(geometrySelect).toHaveValue('column-staggered');

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('keydist:app-state');
        return raw === null ? null : JSON.parse(raw).inputConverter;
      }),
    )
    .toMatchObject({
      version: 2,
      layoutId: 'tsuki-2-263',
      geometryId: 'column-staggered',
      layouts: {
        'tsuki-2-263': {
          showDynamicGuide: true,
          showLayerGuide: true,
          showLayerKeys: true,
          showShiftKeys: false,
          inputText: '',
          practiceText: '',
          randomPracticeMode: null,
        },
      },
    });

  await page.reload();

  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await expect(layoutSelect).toHaveValue('tsuki-2-263');
  await expect(geometrySelect).toHaveValue('column-staggered');
});

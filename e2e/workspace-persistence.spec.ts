import { expect, test } from './fixtures.ts';
import { collectBrowserErrors } from './browser-errors-helper.ts';

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

test('practice environment persists per layout while physical geometry stays global', async ({ page }) => {
  const browserErrors = await collectBrowserErrors(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const geometrySelect = page.getByLabel('物理配列', { exact: true });
  const output = page.getByLabel('自由入力テキスト');
  const practice = page.getByLabel('打ちたい文字');
  const dynamicGuideToggle = page.getByLabel('動的ガイド', { exact: true });
  const layerKeysToggle = page.getByLabel('レイヤーキー', { exact: true });

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  // 物理配列はTester全体で共有する。
  await geometrySelect.selectOption('column-staggered');

  // 配列Aの練習環境。
  await dynamicGuideToggle.uncheck();
  await practice.fill('かな');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');

  // 配列Bは初期状態から始まり、geometryだけAから引き継ぐ。
  await layoutSelect.selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).toBeChecked();
  await expect(layerKeysToggle).toBeChecked();
  await expect(practice).toHaveValue('');
  await expect(output).toHaveValue('');

  await layerKeysToggle.uncheck();
  await practice.fill('ことば');

  // Aへ戻るとAのKeyboard View / Input Text / Practice Textが復元される。
  await layoutSelect.selectOption('naginata-v18');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).not.toBeChecked();
  await expect(layerKeysToggle).toBeChecked();
  await expect(practice).toHaveValue('かな');
  await expect(output).toHaveValue('か');

  browserErrors.clear();
  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).not.toBeChecked();
  await expect(practice).toHaveValue('かな');
  await expect(output).toHaveValue('か');

  // reload後もBの環境は独立して残る。
  await layoutSelect.selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).toBeChecked();
  await expect(layerKeysToggle).not.toBeChecked();
  await expect(practice).toHaveValue('ことば');
  await expect(output).toHaveValue('');

  expect(browserErrors.hydration(), 'Hydrationの不一致が出ない').toEqual([]);
});

import { expect, PAGE_TAG, test } from './fixtures.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * 箱ひげ図のe2e。分位点・座標・目盛りはunit testで固定しているので、
 * ここでは画面の配線（配列ごとの箱が出る・列を押すと5つの値が出る）だけを見る。
 */

const feature = (page: import('@playwright/test').Page) => page.locator('[data-react-feature="box-plot"]');

test.beforeEach(async ({ page }) => {
  await useShortText(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:multi-target-selection') === null) {
      localStorage.setItem(
        'keydist:multi-target-selection',
        JSON.stringify({
          version: 1,
          targets: [
            { kind: 'layout', layoutId: 'qwerty' },
            { kind: 'layout', layoutId: 'jis-kana' },
            { kind: 'layout', layoutId: 'dvorak' },
          ],
        }),
      );
    }
  });
});

test('配列ごとに箱が出て、列を押すとその配列の5つの値が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/box-plot');
  const rows = feature(page).locator('[data-box-plot-row]');
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(feature(page).locator('[data-box-plot-box]')).toHaveCount(3);
  await expect(feature(page).locator('[data-box-plot-segment-count]')).toBeVisible();
  await expect(feature(page).locator('[data-box-plot-detail]')).toHaveCount(0);

  const jis = feature(page).locator('[data-box-plot-row="layout:jis-kana"]');
  await jis.focus();
  await page.keyboard.press('Enter');
  const detail = feature(page).locator('[data-box-plot-detail="layout:jis-kana"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-box-plot-detail-row]')).toHaveCount(5);
});

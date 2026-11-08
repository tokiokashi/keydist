import { expect, PAGE_TAG, test } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * 帯グラフのe2e。区分の割合・座標・折り返しはunit testで固定しているので、
 * ここでは画面の配線（配列ごとの帯が出る・行を押すと割合が出る）だけを見る。
 */

const feature = (page: import('@playwright/test').Page) => page.locator('[data-react-feature="band-chart"]');

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

test('配列ごとに帯が出て、行を押すとその配列の4区分の割合が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/band-chart');
  const rows = feature(page).locator('[data-band-row]');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });
  await expect(feature(page).locator('[data-band-legend-item]')).toHaveCount(4);
  await expect(feature(page).locator('[data-band-detail]')).toHaveCount(0);

  const jis = feature(page).locator('[data-band-row="layout:jis-kana"]');
  await jis.focus();
  await page.keyboard.press('Enter');
  const detail = feature(page).locator('[data-band-detail="layout:jis-kana"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-band-detail-row]')).toHaveCount(4);

  // 区分に重ねると、区分の名前と割合が出る
  await feature(page).locator('[data-band-segment="layout:qwerty:1"]').hover();
  await expect(feature(page).locator('[data-band-tooltip]')).toContainText('0.5〜1.5u');

  // 量を切り替えても帯が出続ける
  const settings = await openSettings(page);
  await settings.getByLabel('量', { exact: true }).selectOption('hand');
  await expect(rows).toHaveCount(3);
  await expect(feature(page).locator('[data-band-segment]').first()).toBeVisible();
});

test('URLの量を読み、開き直しても同じ量が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/band-chart?quantity=row');
  await expect(feature(page).locator('[data-band-row]')).toHaveCount(3, { timeout: 15_000 });
  await expect(feature(page).locator('[data-band-caption]')).toHaveText('押したキーの段の割合');
  await expect(feature(page).locator('[data-band-legend]')).toContainText('数字段');
  await page.reload();
  await expect(feature(page).locator('[data-band-caption]')).toHaveText('押したキーの段の割合');
});

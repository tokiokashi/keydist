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

test('列を押して選んだ配列だけの図が下に出て、その図の列を押すと5つの値が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/box-plot');
  const rows = feature(page).locator('[data-box-plot-row]');
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(feature(page).locator('[data-box-plot-box]')).toHaveCount(3);
  await expect(feature(page).locator('[data-box-plot-segment-count]')).toBeVisible();
  await expect(feature(page).locator('[data-box-plot-focus-row]')).toHaveCount(0);

  // 全体の図で選ぶと、選んだ配列だけの図が出る。全体の図の列を押しても表は出ない
  const row = (key: string) => feature(page).locator(`[data-box-plot-row="${key}"]`);
  await row('layout:qwerty').click();
  await row('layout:jis-kana').click();
  await expect(feature(page).locator('[data-box-plot-focus-row]')).toHaveCount(2);
  await expect(feature(page).locator('[data-box-plot-detail]')).toHaveCount(0);

  // 選んだ配列の図の列を押すと、その配列の5つの値が出る
  const jis = feature(page).locator('[data-box-plot-focus-row="layout:jis-kana"]');
  await jis.focus();
  await page.keyboard.press('Enter');
  const detail = feature(page).locator('[data-box-plot-detail="layout:jis-kana"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-box-plot-detail-row]')).toHaveCount(5);

  // 全体の図で外すと、選んだ配列の図からも表からも消える。まとめて外すと図が消える
  await row('layout:jis-kana').click();
  await expect(feature(page).locator('[data-box-plot-focus-row]')).toHaveCount(1);
  await expect(feature(page).locator('[data-box-plot-detail]')).toHaveCount(0);
  await feature(page).getByRole('button', { name: '選んだ配列を外す' }).click();
  await expect(feature(page).locator('[data-box-plot-focus-row]')).toHaveCount(0);
});

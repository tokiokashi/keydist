import { expect, PAGE_TAG, test } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';

/**
 * 指ごとの距離の個別画面のE2E。値の正しさは抽出のunit testで固定しているので、
 * ここでは既定の縦棒グラフが出ることと、見る量を切り替えると棒が替わることだけを見る。
 */
test('既定では指ごとの縦棒グラフが出て、見る量を隣り合う指の組にすると6本の棒になる', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/finger-distance');
  await expect(
    page.getByRole('heading', {
      name: '指ごとの距離',
      exact: true,
      level: 1,
    }),
  ).toBeVisible();

  const feature = page.locator('[data-react-feature="finger-distance"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });
  await expect(feature.locator('[data-chart-bar]')).toHaveCount(10);

  await (await openSettings(page)).getByLabel('見る量', { exact: true }).selectOption({ label: '標準偏差' });
  await expect(feature.locator('[data-chart-bar]')).toHaveCount(6);
});

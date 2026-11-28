import { expect, PAGE_TAG, test } from './fixtures.ts';
import { useKanaText } from './kana-text-helper.ts';

/**
 * 文節の表による解析のe2e。値はunit testで固定しているので、ここでは画面の配線を見る。
 * 表の元を選んだテキストにして、そのテキストから作った表と今の解析の値を並べた結果の表と2つの図が出て、テキストの選択が現れることを見る。
 */

test('表の元を選んだテキストにすると、そのテキストから作った表で、結果の表と2つの分布の図が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await useKanaText(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:multi-target-selection') === null) {
      localStorage.setItem(
        'keydist:multi-target-selection',
        JSON.stringify({
          version: 1,
          targets: [
            { kind: 'layout', layoutId: 'qwerty' },
            { kind: 'layout', layoutId: 'dvorak' },
          ],
        }),
      );
    }
  });
  await page.goto('/analyzer/ngram-table?source=text');
  const feature = page.locator('[data-react-feature="ngram-table"]');
  const results = feature.locator('[data-ngram-table-results]');
  await expect(results).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.context-bar button.text-chip')).toBeVisible();
  // 配列ごとに、表による解析の行と、同じテキストを今の解析で測った行が並ぶ
  await expect(results.locator('[data-ngram-table-analysis="table"]')).toHaveCount(2);
  await expect(results.locator('[data-ngram-table-analysis="current"]')).toHaveCount(2);
  await expect(results.locator('[data-ngram-table-analysis="current"] td[aria-busy]')).toHaveCount(0, { timeout: 120_000 });
  await expect(feature.locator('[data-ngram-table-distribution="distance"] [data-box-plot-box]')).toHaveCount(2);
  await expect(feature.locator('[data-ngram-table-distribution="perKana"] [data-box-plot-box]')).toHaveCount(2);
});

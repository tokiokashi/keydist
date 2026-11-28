import { expect, PAGE_TAG, test } from './fixtures.ts';

/**
 * 文節の表による解析のe2e。値はunit testで固定しているので、ここでは画面の配線（表の取得・図と表の切り替え・
 * 先読みの変更・表を取得できない時の知らせ）だけを見る。
 */

const feature = (page: import('@playwright/test').Page) => page.locator('[data-react-feature="ngram-table"]');

const TABLE_URL = /standard-corpus-bunsetsu[^?]*\.json(\?import&raw)?$/;

test.beforeEach(async ({ page }) => {
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
});

test('表を取得して、総移動距離の表と2つの分布の図が出て、先読みを変えても結果が残る', { tag: PAGE_TAG }, async ({ page }) => {
  const tableRequests: string[] = [];
  page.on('request', (request) => {
    if (TABLE_URL.test(request.url())) tableRequests.push(request.url());
  });
  await page.goto('/analyzer/ngram-table');
  const results = feature(page).locator('[data-ngram-table-results]');
  await expect(results).toBeVisible({ timeout: 120_000 });
  await expect(results.locator('tbody tr')).toHaveCount(2);
  await expect(feature(page).locator('[data-ngram-table-distribution="distance"]')).toBeVisible();
  await expect(feature(page).locator('[data-ngram-table-distribution="perKana"]')).toBeVisible();
  await expect(feature(page).locator('[data-ngram-table-distribution="distance"] [data-box-plot-box]')).toHaveCount(2);
  expect(tableRequests.length).toBeGreaterThan(0);

  // 0次の表では先読みを変えても値は変わらない（仕様 §13.3）。変えた後も結果が出ている
  const before = await results.textContent();
  await page
    .getByRole('button', { name: /文節の先読み/ })
    .first()
    .click();
  await page.getByRole('option', { name: '先読み 4文節' }).click();
  await expect(results).toBeVisible({ timeout: 120_000 });
  expect(await results.textContent()).toBe(before);

  // 列を押すと、その配列の分布の値が出る
  await feature(page).locator('[data-ngram-table-distribution="distance"] [data-box-plot-row="layout:qwerty"]').click();
  await expect(feature(page).locator('[data-ngram-table-detail="layout:qwerty"] [data-ngram-table-detail-row]')).toHaveCount(8);
});

test('表を取得できない時は、値を出さず、取得できなかったことを知らせる', { tag: PAGE_TAG }, async ({ page }) => {
  await page.route(TABLE_URL, (route) => route.abort());
  await page.goto('/analyzer/ngram-table');
  await expect(feature(page).locator('[data-ngram-table-unavailable]')).toBeVisible({ timeout: 30_000 });
  await expect(feature(page).locator('[data-ngram-table-results]')).toHaveCount(0);
});

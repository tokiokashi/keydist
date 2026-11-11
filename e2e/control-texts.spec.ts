import { expect, test, PAGE_TAG, type Page } from './fixtures.ts';

/**
 * 対照テキストとの比較のe2e。値の定義はunit testで固定しているので、ここでは画面の配線
 * （対象ごとに実文・順序破壊・一様ランダムの3行が出て、対照テキストの値に条件が付く）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="control-texts"]');

test.describe('個別画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('keydist:multi-target-selection') === null) {
        localStorage.setItem(
          'keydist:multi-target-selection',
          JSON.stringify({
            version: 1,
            targets: [
              { kind: 'layout', layoutId: 'qwerty' },
              { kind: 'layout', layoutId: 'jis-kana' },
            ],
          }),
        );
      }
    });
    await page.goto('/analyzer/control-texts');
    await expect(feature(page).locator('[data-control-texts-table]')).toBeVisible({ timeout: 30_000 });
  });

  test('対象ごとに実文と対照テキストの値が並び、条件の文に対照テキストで測った値であることと種の組が出る', { tag: PAGE_TAG }, async ({ page }) => {
    const table = feature(page).locator('[data-control-texts-table]');
    await expect(table.locator('tbody tr[data-control-texts-row="actual"]')).toHaveCount(2, { timeout: 60_000 });
    await expect(table.locator('tbody tr[data-control-texts-row="shuffled"]')).toHaveCount(2);
    await expect(table.locator('tbody tr[data-control-texts-row="uniform"]')).toHaveCount(2);
    await expect(feature(page).locator('[data-control-texts-condition]')).toContainText('対照テキストで測った値');
    await expect(feature(page).locator('[data-control-texts-condition]')).toContainText('種1〜20の20個');
    // 実文は標準偏差を持たず、対照テキストは標準偏差の値を持つ
    const actual = table.locator('tbody tr[data-control-texts-row="actual"]').first();
    await expect(actual.locator('td[data-empty]')).toHaveCount(5);
    await expect(table.locator('tbody tr[data-control-texts-row="shuffled"]').first().locator('td[data-empty]')).toHaveCount(0);
  });
});

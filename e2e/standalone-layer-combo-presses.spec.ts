import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { expectChosenTarget, toggleTarget } from './pane-helper.ts';

/**
 * レイヤーとコンボのキー数のE2E。押下数と割合はunit test（`extract.test.ts`・`engine-path.test.ts`）で固定しているので、
 * ここでは画面の配線（表の行・合計の行・コンボの行の有無）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="layer-combo-presses"]');
const table = (page: Page) => feature(page).locator('[data-layer-combo-presses-table]');

test('コンボを持つ配列: 表にコンボの行が出て、押下数の和が合計の行と一致する', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/layer-combo-presses');
  await expect(
    page.getByRole('heading', {
      name: 'レイヤーとコンボのキー数',
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await toggleTarget(page, 'layout:kawasemi-plus');
  await expectChosenTarget(page, 'layout:kawasemi-plus');

  await expect(table(page).locator('tbody tr')).toHaveCount(18);
  await expect(table(page).locator('[data-attribution-row="combo"]')).toBeVisible();
  // 行指定キーの面は、作者の呼び名の層として載る
  await expect(table(page).locator('tbody tr', { hasText: 'か行' })).toHaveCount(1);
  const presses = await table(page).locator('tbody tr td:nth-child(2)').allTextContents();
  const total = await table(page).locator('tfoot td:nth-child(2)').textContent();
  expect(presses.reduce((sum, text) => sum + Number(text), 0)).toBe(Number(total));
  // 切り替えのキーを使った打鍵の表も出る
  await expect(feature(page).locator('[data-trigger-participation-table]')).toBeVisible();
});

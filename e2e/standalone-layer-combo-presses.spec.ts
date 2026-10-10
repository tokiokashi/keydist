import { expect, test, type Page } from '@playwright/test';

/**
 * レイヤーとコンボの押下数のE2E。押下数と割合はunit test（`extract.test.ts`・`engine-path.test.ts`）で固定しているので、
 * ここでは画面の配線（表の行・合計の行・コンボの行の有無）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="layer-combo-presses"]');
const table = (page: Page) => feature(page).locator('[data-layer-combo-presses-table]');

test('コンボを持つ配列: 表にコンボの行が出て、押下数の和が合計の行と一致する', async ({ page }) => {
  await selectLayout(page, 'kawasemi-plus');
  await page.goto('/standalone/layer-combo-presses');
  await expect(page.getByRole('heading', { name: 'レイヤーとコンボの押下数', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });

  await expect(table(page).locator('tbody tr')).toHaveCount(18);
  await expect(table(page).locator('[data-attribution-row="combo"]')).toBeVisible();
  // 行指定キーの面は、作者の呼び名の層として載る
  await expect(table(page).locator('tbody tr', { hasText: 'か行' })).toHaveCount(1);
  const presses = await table(page).locator('tbody tr td:nth-child(2)').allTextContents();
  const total = await table(page).locator('tfoot td:nth-child(2)').textContent();
  expect(presses.reduce((sum, text) => sum + Number(text), 0)).toBe(Number(total));
});

test('文字キーの同時押しを層に数える配列: 層の行に載り、コンボの行は無い', async ({ page }) => {
  await selectLayout(page, 'shin-koume');
  await page.goto('/standalone/layer-combo-presses');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(table(page).locator('tbody tr')).toHaveCount(17);
  await expect(table(page).locator('[data-attribution-row="combo"]')).toHaveCount(0);
});

test('レイヤーもコンボも持たない配列: 単打を含む行だけが並ぶ', async ({ page }) => {
  await selectLayout(page, 'nicola');
  await page.goto('/standalone/layer-combo-presses');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(table(page).locator('tbody tr')).toHaveCount(3);
});

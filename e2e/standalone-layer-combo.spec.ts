import { expect, test, type Page } from '@playwright/test';

/**
 * レイヤーとコンボのE2E。押下数・コンボ表の行数・英文でのコンボの除外は unit test
 * （`extract.test.ts`・`layout-breakdown.test.ts`）で固定しているので、ここでは画面の配線
 * （帰属先の表・修飾・コンボ表・配列図・該当が無い時の文）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="layer-combo"]');

test('コンボを持つ配列: 帰属先の表の合計とコンボ表と配列図が出る', async ({ page }) => {
  await selectLayout(page, 'shin-koume');
  await page.goto('/standalone/layer-combo');
  await expect(page.getByRole('heading', { name: 'レイヤーとコンボ', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });

  const attribution = feature(page).locator('[data-layer-combo-table="attribution"]');
  await expect(attribution.locator('tbody tr')).toHaveCount(4);
  await expect(attribution.locator('[data-attribution-row="combo"]')).toBeVisible();
  // 帰属先ごとの押下数の和が、合計の行と一致する
  const presses = await attribution.locator('tbody tr td:nth-child(2)').allTextContents();
  const total = await attribution.locator('tfoot td:nth-child(2)').textContent();
  expect(presses.reduce((sum, text) => sum + Number(text), 0)).toBe(Number(total));

  await expect(feature(page).locator('[data-layer-combo-table="combo"] tbody tr')).toHaveCount(14);
  await expect(feature(page).locator('[data-layer-combo-diagram] svg')).toBeVisible();
  await expect(feature(page).getByText('この配列は修飾のレイヤーを持ちません。')).toBeVisible();
});

test('修飾のレイヤーを持つ配列: 修飾の一覧が出て、コンボは無いと分かる', async ({ page }) => {
  await selectLayout(page, 'naginata-v18');
  await page.goto('/standalone/layer-combo');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-layer-combo-table="modifier"] tbody tr').first()).toBeVisible();
  await expect(feature(page).getByText('この打ち方で使えるコンボはありません。')).toBeVisible();
  await expect(feature(page).locator('[data-layer-combo-diagram]')).toHaveCount(0);
});

test('どちらも持たない配列: 帰属先の表だけに行があり、修飾とコンボには無いと分かる', async ({ page }) => {
  await selectLayout(page, 'nicola');
  await page.goto('/standalone/layer-combo');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-layer-combo-table="attribution"] tbody tr')).toHaveCount(3);
  await expect(feature(page).getByText('この配列は修飾のレイヤーを持ちません。')).toBeVisible();
  await expect(feature(page).getByText('この打ち方で使えるコンボはありません。')).toBeVisible();
});

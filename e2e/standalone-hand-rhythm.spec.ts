import { expect, test, type Page } from './fixtures.ts';

/**
 * 左右の手の交互のE2E。数の定義はunit test（`extract.test.ts`・`interpretation/structure/hand-rhythm.test.ts`）で固定しているので、
 * ここではペインが開いて値と分布が出ることだけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="hand-rhythm"]');
const value = (page: Page, id: string) => feature(page).locator(`[data-hand-rhythm-value="${id}"] dd`);

test('両手の打鍵を持たない配列: 値が出て、両手の打鍵は0になる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/analyzer/hand-rhythm');
  await expect(page.getByRole('heading', { name: '左右の手の交互', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });

  await expect(value(page, 'both-hand-strokes')).toHaveText('0打鍵');
  await expect(value(page, 'both-hand-pairs')).toHaveText(/^0組/);
  await expect(value(page, 'switches')).not.toHaveText('0組');
  await expect(value(page, 'alternation-runs')).not.toHaveText('0件');
  await expect(feature(page).locator('[data-hand-rhythm-distribution="alternation"] [data-run-length]').first()).toBeVisible();
  await expect(feature(page).locator('[data-hand-rhythm-distribution="same-hand"] [data-run-length="1"]')).toBeVisible();
});

test('両手の打鍵を含む組の多い配列: 両手の打鍵を含む組が0でない', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/analyzer/hand-rhythm');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(value(page, 'both-hand-pairs')).not.toHaveText(/^0組/);
  await expect(value(page, 'both-mixed')).not.toHaveText('0打鍵');
});

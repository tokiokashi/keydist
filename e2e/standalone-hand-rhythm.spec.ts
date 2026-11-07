import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { expectChosenTarget, toggleTarget } from './pane-helper.ts';

/**
 * 左右の手の交互のE2E。数の定義はunit test（`extract.test.ts`・`interpretation/structure/hand-rhythm.test.ts`）で固定しているので、
 * ここではペインが開いて値と分布が出ることだけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="hand-rhythm"]');
const value = (page: Page, id: string) => feature(page).locator(`[data-hand-rhythm-value="${id}"] dd`);

test('両手のアクションを持たない配列: 値が出て、両手のアクションは0になる', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/hand-rhythm');
  await expect(
    page.getByRole('heading', {
      name: '左右の手の交互',
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await toggleTarget(page, 'layout:dvorak');
  await expectChosenTarget(page, 'layout:dvorak');

  await expect(value(page, 'both-hand-strokes')).toHaveText('0アクション');
  await expect(value(page, 'both-hand-pairs')).toHaveText(/^0組/);
  await expect(value(page, 'switches')).not.toHaveText('0.0回');
  await expect(value(page, 'alternation-runs')).not.toHaveText('0件');
  await expect(feature(page).locator('[data-hand-rhythm-distribution="alternation"] [data-run-length]').first()).toBeVisible();
  await expect(feature(page).locator('[data-hand-rhythm-distribution="same-hand"] [data-run-length="1"]')).toBeVisible();
});

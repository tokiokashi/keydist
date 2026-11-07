import { expect, PAGE_TAG, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { expectTargetNames } from './pane-helper.ts';

/**
 * トップで気になる配列を1つ選ぶと、Single（Bigram Flow）の対象になる。
 */
test('トップで選んだ配列が、Bigram Flowに出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);

  // 選ぶまでは Analyzer へのリンクを出さない
  const hero = page.locator('.hero');
  await expect(hero.locator('.top-pick-links')).toHaveCount(0);

  await hero.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:colemak-dh"]').click();
  await expect(hero.locator('.top-pick-links')).toBeVisible();

  await hero.locator('.top-pick-links').getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page).toHaveURL(/\/analyzer\/bigram-flow$/);
  await expect(page.getByRole('heading', { name: 'Bigram Flow', level: 1, exact: true })).toBeVisible();
  await expectTargetNames(page, ['Colemak-DH']);
});

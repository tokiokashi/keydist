import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { expectTargetNames, targetButton, targetChoice, targetNames } from './pane-helper.ts';

/**
 * トップで気になる配列を1つ選ぶと、Single（Bigram Flow）の対象になり、Multi（比較表）の組にも入る。
 */
test('トップで選んだ配列が、Bigram Flow と比較表の両方に出る', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);

  // 選ぶまでは Analyzer へのリンクを出さない
  const hero = page.locator('.hero');
  await expect(hero.locator('.top-pick-links')).toHaveCount(0);

  await hero.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:colemak-dh"]').click();
  await expect(hero.locator('.top-pick-links')).toBeVisible();

  await hero.getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/bigram-flow$/);
  await expect(page.getByRole('heading', { name: 'Bigram Flow', level: 1, exact: true })).toBeVisible();
  await expectTargetNames(page, ['Colemak-DH']);

  await page.goto('/');
  await waitForHydration(page);
  await hero.getByRole('link', { name: '比較表', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  await expect(page.getByRole('heading', { name: '比較表', level: 1, exact: true })).toBeVisible();
  await expectTargetNames(page, ['Colemak-DH']);
});

test('Multi にすでにある配列を選んでも重複しない', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:multi-target-selection') !== null) return;
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'layout', layoutId: 'colemak-dh' }] }),
    );
  });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:colemak-dh"]').click();

  await page.locator('.hero').getByRole('link', { name: '比較表', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  await expect(page.getByRole('heading', { name: '比較表', level: 1, exact: true })).toBeVisible();
  await expect.poll(async () => (await targetNames(page)).length).toBe(2);
  // 選んだ配列は Single 側にも入っている
  await page.goto('/standalone/bigram-flow');
  await expect(page.getByRole('heading', { name: 'Bigram Flow', level: 1, exact: true })).toBeVisible();
  await expectTargetNames(page, ['Colemak-DH']);
  await expect(await targetChoice(page, 'layout:colemak-dh')).toBeChecked();
});

test('Setup を選んだ時の名前は、Bigram Flow の見出しと同じ（名前だけ）', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:setup-library') !== null) return;
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({ version: 1, setups: [{ id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' }], overrides: {} }),
    );
  });
  await page.goto('/');
  await waitForHydration(page);
  const hero = page.locator('.hero');
  await hero.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="setup:fixed-b"]').click();
  await expect(hero.locator('.top-pick-links')).toBeVisible();
  const topLabel = await hero.getByRole('button', { name: /^対象: / }).getAttribute('aria-label');

  await hero.getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bigram Flow', level: 1, exact: true })).toBeVisible();
  await expect.poll(async () => targetButton(page).getAttribute('aria-label')).toBe(topLabel);
  expect(topLabel).not.toContain('/');
});

test('資産の自作の配列が対象の選択に並び、選んだ配列が比較表に出る', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:user-layouts') !== null) return;
    localStorage.setItem(
      'keydist:user-layouts',
      JSON.stringify({
        version: 1,
        layouts: [{
          id: 'user-e2e',
          name: '自作のテスト配列',
          rows: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
          romaji: 'kunrei',
        }],
      }),
    );
  });
  await page.goto('/');
  await waitForHydration(page);

  const hero = page.locator('.hero');
  await hero.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:user-e2e"]').click();
  await hero.getByRole('link', { name: '比較表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '比較表', level: 1, exact: true })).toBeVisible();
  await expectTargetNames(page, ['自作のテスト配列']);
});

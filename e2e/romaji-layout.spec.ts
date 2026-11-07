import { expect, PAGE_TAG, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ローマ字配列の画面のE2E。検査の分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: 不備の場所が出る、不備を直して作れる、保存先に反映される。
 */

const STORAGE_KEY = 'keydist:user-layouts';

test('不備を直して配列を作ると、保存先に反映される', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);

  // 何も入れていない間は保存できない。名前と英字の段が悪いと出る
  const submit = page.locator('[data-layout-submit]');
  await expect(submit).toBeDisabled();
  await expect(page.locator('[data-layout-problem="error"]')).toHaveCount(2);

  await page.getByLabel('名前', { exact: true }).fill('私のDvorak');
  await page.locator('[data-layout-row="0"]').fill('1234567890[]');
  // 長すぎる段は、その段の下に理由が出る
  await page.locator('[data-layout-row="1"]').fill("',.pyfgcrl/=x");
  await expect(page.getByRole('alert').filter({ hasText: '上段が13文字' })).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.locator('[data-layout-row="1"]').fill("',.pyfgcrl/=");
  await page.locator('[data-layout-row="2"]').fill('aoeuidhtns-');
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwvz');
  await expect(page.locator('[data-layout-problem="error"]')).toHaveCount(0);
  await expect(submit).toBeEnabled();

  // 同じ文字を別のキーに置いても保存はできる。重なったキーが示される
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwva');
  await expect(page.locator('[data-layout-problem="warning"]')).toContainText('「a」');
  await expect(submit).toBeEnabled();
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwvz');

  await page.locator('[data-layout-home="RI"]').selectOption('h');
  await submit.click();
  await expect(page.locator('[data-layout-pick]')).toHaveValue(/^user-/);
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await expect.poll(stored).toContain('私のDvorak');
  await expect.poll(stored).toContain('"RI":"h"');
});

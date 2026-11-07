import { expect, PAGE_TAG, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * かな配列の画面のE2E。検査の分岐と保存の中身はunit testが持つので、
 * ここでは画面の配線を見る: 図の上でキーを選んで出力を置ける、保存先に反映される。
 */

const STORAGE_KEY = 'keydist:user-layouts';

test('図の上でキーに出力を置いて保存でき、保存先に反映される', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);

  // 何も入れていない間は保存できない
  const submit = page.locator('[data-face-submit]');
  await expect(submit).toBeDisabled();
  await page.locator('[data-face-name]').fill('私のかな配列');

  // 図のキーを押して、そのキーの出力を書く
  const key = (id: string) => page.locator(`[data-face-figure] [data-key-id="${id}"]`);
  await key('a').click();
  await page.locator('[data-face-output]').fill('あ');
  await key('s').click();
  await page.locator('[data-face-output]').fill('か');
  await expect(key('a').locator('.physical-keyboard-legend')).toHaveText('あ');
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page.locator('[data-kana-pick]')).toHaveValue(/^user-/);
  const stored = () => page.evaluate((storageKey) => localStorage.getItem(storageKey), STORAGE_KEY);
  await expect.poll(stored).toContain('私のかな配列');
  await expect(submit).toBeDisabled();
});

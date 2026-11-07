import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指の割り当ての画面のE2E。割り当ての書き換えの分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: 作る・名前を変える・キーを編集する、保存先に反映される。
 */

const STORAGE_KEY = 'keydist:finger-assignments';

const keyLegend = (page: Page, keyId: string) => page.locator(`.physical-keyboard-key[data-key-id="${keyId}"] .physical-keyboard-legend`);

test('割り当てを作り、キーの担当を編集できる', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);

  await page.locator('[data-finger-assignment-create]').click();
  await expect(page.getByLabel('割り当てを選ぶ')).toHaveValue(/finger-/);
  const name = page.getByLabel('名前', { exact: true });
  await expect(name).toHaveValue('新しい指の割り当て');
  await name.fill('私の運指');
  await name.press('Enter');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('私の運指');

  // 新規作成の元は、選んでいる物理配列（ANSI）の既定の割り当て
  await expect(keyLegend(page, 'q')).toHaveText('左小');

  // キー単位: Qを右小指だけの担当にする（右小指を足してから、前の左小指を外す）
  await page.locator('.physical-keyboard-key[data-key-id="q"]').click();
  await page.getByRole('checkbox', { name: '右小指', exact: true }).check();
  await page.getByRole('checkbox', { name: '左小指', exact: true }).uncheck();
  await expect(keyLegend(page, 'q')).toHaveText('右小');
});

import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指の割り当ての画面のE2E。割り当ての書き換えの分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、作る・名前を変える・キーと列を編集する・既定へ戻す、
 * 保存先に反映される、条件のモーダルで選べる、/assetsの一覧から削除できる。
 */

const STORAGE_KEY = 'keydist:finger-assignments';

const keyLegend = (page: Page, keyId: string) => page.locator(`.physical-keyboard-key[data-key-id="${keyId}"] .physical-keyboard-legend`);

test('割り当てを作り、キーと列を編集し、既定へ戻せる。条件のモーダルで選べて、/assetsから削除できる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: '指の割り当て', exact: true }).click();
  await expect(page).toHaveURL(/\/finger-assignment$/);

  await page.locator('[data-finger-assignment-create]').click();
  await expect(page.getByLabel('編集する割り当て')).toHaveValue(/finger-/);
  const name = page.getByLabel('名前', { exact: true });
  await expect(name).toHaveValue('新しい指の割り当て');
  await name.fill('私の運指');
  await name.press('Enter');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('私の運指');

  // 新規作成の元は、選んでいる物理配列（ANSI）の既定の割り当て
  await expect(keyLegend(page, 'q')).toHaveText('左小');

  // キー単位: Qを右小指にする
  await page.locator('.physical-keyboard-key[data-key-id="q"]').click();
  await page.getByLabel('選んだキーの指').selectOption('RP');
  await expect(keyLegend(page, 'q')).toHaveText('右小');

  // 列の一括: 2列目（W・S・Xの列）を左小指にする
  await page.getByLabel('列を選ぶ', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('列の指').selectOption('LP');
  for (const id of ['2', 'w', 's', 'x']) await expect(keyLegend(page, id)).toHaveText('左小');

  // 既定へ戻す: 全てのキーが既定に戻る
  await page.locator('[data-finger-assignment-reset]').click();
  await expect(keyLegend(page, 'q')).toHaveText('左小');
  await expect(keyLegend(page, 'w')).toHaveText('左薬');

  // 元に戻すで、既定へ戻す前に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(keyLegend(page, 'w')).toHaveText('左小');

  // 条件のモーダルで選べる
  await page.locator('#app-sidebar').getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await page.locator('.pane-frame .pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal.getByLabel('指の割当', { exact: true }).locator('option', { hasText: '私の運指' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // /assetsの一覧から削除できる
  await page.goto('/assets');
  await waitForHydration(page);
  const section = page.locator('[data-user-assets-section="finger-assignment"]');
  await expect(section.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(section).toContainText('削除すると、この割り当てを選んでいる場所は既定の割り当てで測ります');
  await section.getByRole('button', { name: '「私の運指」を削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(section.locator('[data-user-asset-row]')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toContain('私の運指');
});

test('割り当てが1つも無い間も物理配列を選べて、選んだ物理配列の既定から作れる', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.getByLabel('物理配列を選ぶ').selectOption('jis-row-staggered');
  await page.locator('[data-finger-assignment-create]').click();
  // JISの物理配列にだけあるキーが、JIS既定の指で描かれる
  await expect(keyLegend(page, 'r0c12')).toHaveText('右小');
});

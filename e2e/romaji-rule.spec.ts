import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ローマ字の綴りの画面のE2E。規則の書き換えの分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、作る・名前を変える・綴りを書き換える・基底を変える、
 * 一覧が基底との違いを示す、保存先に反映される、条件のモーダルで選べる。
 */

const STORAGE_KEY = 'keydist:user-romaji-rules';

test('規則を作り、綴りを書き換えて、基底との違いが一覧に出る。条件のモーダルで選べる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: 'ローマ字の綴り', exact: true }).click();
  await expect(page).toHaveURL(/\/romaji-rule$/);

  await page.locator('[data-romaji-rule-create]').click();
  await expect(page.getByLabel('編集する綴り')).toHaveValue(/romaji-/);
  const name = page.getByLabel('名前', { exact: true });
  await expect(name).toHaveValue('新しいローマ字の綴り');
  await name.fill('私の綴り');
  await name.press('Enter');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('私の綴り');

  // 作った直後は差分が無く、基底と違う行も無い
  const row = page.locator('[data-romaji-rule-row="し"]');
  await expect(row.locator('td').first()).toHaveText('si');
  await expect(page.locator('[data-romaji-rule-row][data-differs="true"]')).toHaveCount(0);

  // 綴りを書き換えると、その行が基底と違う行になる
  await page.getByLabel('しの綴り').fill('shi');
  await page.getByLabel('しの綴り').press('Enter');
  await expect(row).toHaveAttribute('data-differs', 'true');
  await expect(row).toContainText('基底と違う');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('"し":"shi"');

  // 置けない綴りは保存せず、理由を示す
  await page.getByLabel('ちの綴り').fill('c h i');
  await page.getByLabel('ちの綴り').press('Enter');
  await expect(page.getByRole('alert')).toContainText('綴りは');
  await expect(page.locator('[data-romaji-rule-row="ち"]')).toHaveAttribute('data-differs', 'false');

  // 一覧に無いかなを足すと、一覧の末尾に出る
  await page.locator('[data-romaji-rule-add]').getByLabel('かな').fill('きゃ');
  await page.locator('[data-romaji-rule-add]').getByLabel('綴り').fill('kixya');
  await page.locator('[data-romaji-rule-add-submit]').click();
  await expect(page.locator('[data-romaji-rule-row="きゃ"]')).toHaveAttribute('data-differs', 'true');

  // 空にすると基底の綴りへ戻る
  await page.getByLabel('しの綴り').fill('');
  await page.getByLabel('しの綴り').press('Enter');
  await expect(row).toHaveAttribute('data-differs', 'false');
  await expect(page.getByLabel('しの綴り')).toHaveValue('si');

  // 基底を大西式にすると、基底の綴りが変わる
  await expect(page.locator('[data-romaji-rule-row="しゃ"] td').first()).toHaveText('sya');
  await page.getByLabel('基底のルール').selectOption('oonishi');
  await expect(page.locator('[data-romaji-rule-row="しゃ"] td').first()).toHaveText('sha');

  // 元に戻すで、基底を変える前に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[data-romaji-rule-row="しゃ"] td').first()).toHaveText('sya');

  // 条件のモーダルで選べる
  await page.locator('#app-sidebar').getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await page.locator('.pane-frame .pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal.getByLabel('ローマ字規則', { exact: true }).locator('option', { hasText: '私の綴り' })).toHaveCount(1);
});

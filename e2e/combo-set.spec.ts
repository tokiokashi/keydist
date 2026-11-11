import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * コンボの組の画面のE2E。コンボの展開と計算への反映はunit testが持つので、
 * ここでは画面の配線を見る: 組を作ってコンボを足すと保存先に入り、Setupで選ぶと参照が保存される。
 */

interface StoredComboSets {
  readonly comboSets: readonly { id: string; romajiRuleId: string; combos: readonly { keys: readonly string[]; output: string }[] }[];
}

const storedSets = async (page: Page): Promise<StoredComboSets> =>
  JSON.parse((await page.evaluate(() => localStorage.getItem('keydist:combo-sets'))) ?? '{"comboSets":[]}');

const storedSetups = async (page: Page): Promise<{ setups: readonly { comboSetId?: string }[] }> =>
  JSON.parse((await page.evaluate(() => localStorage.getItem('keydist:setup-library'))) ?? '{"setups":[]}');

test('組を作ってコンボを足し、Setupで選ぶと保存先に入る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/combo-set');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'コンボの組', level: 1 })).toBeVisible();

  await page.locator('[data-combo-set-create]').click();
  await expect(page.locator('[data-combo-set-table]')).toBeVisible();
  await page.getByLabel('押すキー').fill('st');
  await page.getByLabel('出力のかな').fill('して');
  await page.locator('[data-combo-set-add-submit]').click();
  await expect(page.locator('[data-combo-set-row="site"]')).toBeVisible();
  await expect
    .poll(async () => (await storedSets(page)).comboSets.map((set) => [set.romajiRuleId, set.combos.map((combo) => [combo.keys.join(''), combo.output])]))
    .toEqual([['kunrei', [['st', 'site']]]]);

  await page.goto('/setup');
  await waitForHydration(page);
  await page.getByLabel('作るSetupの物理配列を選ぶ').selectOption({ label: 'ロウスタッガード（ANSI）' });
  await page.locator('[data-setup-create]').click();
  await expect(page.locator('[data-setup-row]')).toHaveCount(1);
  await page.getByLabel('このSetupのコンボの組を選ぶ').selectOption({ label: '新しいコンボの組' });
  await expect.poll(async () => (await storedSetups(page)).setups[0]?.comboSetId).toBeTruthy();
});

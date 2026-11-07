import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Setupの画面のE2E。作成・複製・付け替えの分岐と取り消しの照合はunit testが持つので、
 * ここでは画面の配線を見る: Setupを作ると画面に並び、保存先に入る。
 */

const STORAGE_KEY = 'keydist:setup-library';

interface StoredSetups {
  readonly setups: readonly { id: string; number: number; layoutId: string; shapeId: string; label?: string }[];
}

const stored = async (page: Page): Promise<StoredSetups> =>
  JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)) ?? '{"setups":[]}');

async function createSetup(page: Page, shapeName: string, name?: string): Promise<void> {
  await page.getByLabel('作るSetupの物理配列を選ぶ').selectOption({ label: shapeName });
  if (name !== undefined) await page.getByLabel('Setupの名前').fill(name);
  await page.locator('[data-setup-create]').click();
}

test('Setupを作ると一覧に並び、保存先に入る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/setup');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Setup', exact: true, level: 1 })).toBeVisible();

  await createSetup(page, 'ロウスタッガード（ANSI）', '練習用');
  await expect(page.locator('[data-setup-row]')).toHaveCount(1);
  await expect.poll(async () => (await stored(page)).setups.map((setup) => [setup.layoutId, setup.label])).toEqual([['qwerty', '練習用']]);
});

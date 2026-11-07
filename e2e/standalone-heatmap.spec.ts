import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';

/**
 * ヒートマップのE2E。押下数の値はunit test（`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（並べる配列を選ぶと格子の図が出る）だけを見る。
 */

const SINGLE_KEY = 'keydist:single-target-selection';
const MULTI_KEY = 'keydist:multi-target-selection';

async function seedSelections(page: Page, single: string, multi: readonly string[]) {
  await page.addInitScript(
    ([singleId, multiIds, singleKey, multiKey]) => {
      localStorage.setItem(
        singleKey,
        JSON.stringify({
          version: 1,
          target: { kind: 'layout', layoutId: singleId },
        }),
      );
      localStorage.setItem(
        multiKey,
        JSON.stringify({
          version: 1,
          targets: multiIds.map((layoutId) => ({ kind: 'layout', layoutId })),
          colorSlots: {},
        }),
      );
    },
    [single, multi, SINGLE_KEY, MULTI_KEY] as const,
  );
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap"]');
const cells = (page: Page) => feature(page).locator('[data-heatmap-set-target]');

/** 格子に並べる配列を選ぶ操作（Multiの集合の書き換え）。Singleの対象の選択とは別の部品 */
const setPicker = (page: Page) => feature(page).getByRole('button', { name: /^並べる配列: / });
const setDialog = (page: Page) => page.getByRole('dialog', { name: '並べる配列の選択' });

test('集合が空でも、並べる配列を選ぶ操作だけが出る。選ぶと格子が出る。Singleの対象は変わらない', { tag: PAGE_TAG }, async ({ page }) => {
  await seedSelections(page, 'qwerty', []);
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(cells(page)).toHaveCount(0);
  await expect(setPicker(page)).toHaveAttribute('aria-label', '並べる配列: 未選択');
  // 見出しのSingleの対象の選択は別のボタンで、名前で区別できる
  await expect(page.getByRole('button', { name: /^対象: / })).toHaveCount(1);
  // 選択の小窓は自動で開かない
  await expect(setDialog(page)).toHaveCount(0);

  await setPicker(page).click();
  await setDialog(page).locator('input[value="layout:dvorak"]').click();
  await setDialog(page).locator('input[value="layout:colemak-dh"]').click();
  await expect(cells(page)).toHaveCount(2);
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  expect(await page.evaluate((key) => localStorage.getItem(key), SINGLE_KEY)).toContain('qwerty');

  // 選択の中の名前と格子の図の名前が同じ
  const gridNames = await cells(page).locator('.heatmap-set-name').allTextContents();
  const summary = (await setPicker(page).getAttribute('aria-label'))!.replace('並べる配列: ', '');
  for (const name of gridNames) expect(summary).toContain(name.trim());
});

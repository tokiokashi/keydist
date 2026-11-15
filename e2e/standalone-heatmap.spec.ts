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

test('見出しのボタンで、図を表に切り替えられる。格子の図は対象ごとの表になり、図へ戻せる', { tag: PAGE_TAG }, async ({ page }) => {
  await seedSelections(page, 'qwerty', ['dvorak']);
  await page.goto('/analyzer/heatmap?flowLines=true');
  await expect(cells(page).locator('[data-heatmap-diagram]')).toHaveCount(1, { timeout: 15_000 });

  const toggle = feature(page).getByRole('button', { name: '打鍵頻度を表で見る' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(feature(page).locator('table.figure-table')).toHaveCount(0);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // 一番上の図は押下数の表と2打鍵の線の表、格子の図は対象ごとに同じ組の表になる
  await expect(feature(page).locator('[data-heatmap-diagram]')).toHaveCount(0);
  await expect(feature(page).locator('table.figure-table')).toHaveCount(4);
  const captions = feature(page).locator('table.figure-table caption');
  await expect(captions.first()).toHaveText('打鍵頻度');
  await expect(captions.nth(1)).toContainText('2打鍵の線');
  await expect(cells(page).first().locator('table.figure-table')).toHaveCount(2);

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(feature(page).locator('table.figure-table')).toHaveCount(0);
  await expect(cells(page).locator('[data-heatmap-diagram]')).toHaveCount(1);
});

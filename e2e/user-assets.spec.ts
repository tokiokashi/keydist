import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * データ・設定の管理の一覧と削除の画面のE2E。
 * 削除そのものの分岐（存在しないid・元に戻す）はunit testが持つので、ここでは画面の配線を見る:
 * 一覧から消せる、保存先に反映される、消した配列を対象にした画面に旨が出る、元に戻すで戻る。
 */

/** 自作の配列2つ・規則1つと、配列「自作A」を対象にした状態を保存先へ入れる。 */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // リロードのたびに種まきし直すと、削除が巻き戻る。最初の1回だけ書く。
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    const rows = ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
    localStorage.setItem(
      'keydist:user-layouts',
      JSON.stringify({
        version: 1,
        layouts: [
          { kind: 'alpha', id: 'user-a', name: '自作A', rows, romaji: 'rule-a' },
          { kind: 'alpha', id: 'user-b', name: '自作B', rows, romaji: 'kunrei' },
        ],
      }),
    );
    localStorage.setItem(
      'keydist:user-romaji-rules',
      JSON.stringify({
        version: 1,
        rules: [{ id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true }],
      }),
    );
    localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: 'user-a' } }));
  });
}

test('配列を削除すると保存先から消え、その配列を対象にした画面に旨が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  const layouts = page.locator('[data-user-assets-section="layout"]');
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);

  await layouts.getByRole('button', { name: '「自作A」を削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(1);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);
  await layouts.getByRole('button', { name: '「自作A」を削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(page.locator('.user-assets-message')).toHaveText('「自作A」を削除しました');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('keydist:user-layouts'))).not.toContain('user-a');

  // 対象にしていた画面へ移ると、配列が見つからない旨が出る
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('.pane-frame')).toContainText('配列が見つかりません', { timeout: 10_000 });
});

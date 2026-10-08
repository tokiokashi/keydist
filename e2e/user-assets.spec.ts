import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 自作の配列・規則の一覧と削除の画面のE2E。
 * 削除そのものの分岐（存在しないid・元に戻す）はunit testが持つので、ここでは画面の配線を見る:
 * サイドバーから開ける、一覧から消せる、保存先に反映される、消した配列を対象にした画面に旨が出る、
 * 元に戻すで戻る。
 */

/** 自作の配列2つ・規則1つと、配列「自作A」を対象にした状態を保存先へ入れる。 */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // リロードのたびに種まきし直すと、削除が巻き戻る。最初の1回だけ書く。
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    const rows = ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
    localStorage.setItem('keydist:user-layouts', JSON.stringify({
      version: 1,
      layouts: [
        { id: 'user-a', name: '自作A', rows, romaji: 'rule-a' },
        { id: 'user-b', name: '自作B', rows, romaji: 'kunrei' },
      ],
    }));
    localStorage.setItem('keydist:user-romaji-rules', JSON.stringify({
      version: 1,
      rules: [{ id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true }],
    }));
    localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: 'user-a' } }));
  });
}

test('サイドバーのAssetsから開き、自作の配列と規則を一覧できる', async ({ page }) => {
  await seed(page);
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  await sidebar.getByRole('link', { name: '自作の配列・規則', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);

  const layouts = page.locator('[data-user-assets-section="layout"]');
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);
  await expect(layouts.locator('[data-user-asset-row="user-a"]')).toContainText('推奨のローマ字規則: 自作の規則');
  const rules = page.locator('[data-user-assets-section="romaji-rule"]');
  await expect(rules.locator('[data-user-asset-row="rule-a"]')).toContainText('推奨に使っている配列: 自作A');
});

test('配列を削除すると保存先から消え、その配列を対象にした画面に旨が出る', async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  const layouts = page.locator('[data-user-assets-section="layout"]');
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);

  await layouts.getByRole('button', { name: '「自作A」を削除' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(1);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);
  await layouts.getByRole('button', { name: '「自作A」を削除' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('「自作A」を削除した');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('keydist:user-layouts')))
    .not.toContain('user-a');

  // 対象にしていた画面へ移ると、配列が見つからない旨が出る
  await page.locator('#app-sidebar').getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page.locator('.pane-frame')).toContainText('配列が見つからない', { timeout: 10_000 });
});

test('削除した直後は元に戻すで一覧と保存先が戻り、やり直すで再び消える', async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  const rules = page.locator('[data-user-assets-section="romaji-rule"]');
  await rules.getByRole('button', { name: '「自作の規則」を削除' }).click();
  await expect(rules.locator('[data-user-asset-row]')).toHaveCount(0);
  // 規則を推奨にしていた配列は残り、全体の値の規則で打つ旨が出る
  await expect(page.locator('[data-user-asset-row="user-a"]')).toContainText('全体の値の規則で打つ');

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(rules.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(page.locator('[data-user-asset-row="user-a"]')).toContainText('推奨のローマ字規則: 自作の規則');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('keydist:user-romaji-rules')))
    .toContain('rule-a');

  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(rules.locator('[data-user-asset-row]')).toHaveCount(0);
});

test('自作の配列が無ければ、空の旨を出す', async ({ page }) => {
  await page.goto('/assets');
  await waitForHydration(page);
  await expect(page.getByText('自作の配列はありません。')).toBeVisible();
  await expect(page.getByText('自作のローマ字規則はありません。')).toBeVisible();
});

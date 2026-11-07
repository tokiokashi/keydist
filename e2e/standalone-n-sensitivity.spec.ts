import { expect, test, PAGE_TAG } from './fixtures.ts';
import { toggleTarget } from './pane-helper.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * N感度単体ページのE2E。
 * `e2e/standalone-comparison.spec.ts`と同じ形。
 *
 * 対象は配列かSetupの**集合**で、比較表と同じ1つの集合を共有する
 * （`keydist:multi-target-selection`。`engine/multi-target-selection.ts`参照）。
 */

/** 対象を加える（対象の選択でチェックを付ける。付けた瞬間に反映される）。 */
async function addTarget(page: import('@playwright/test').Page, key: string) {
  await toggleTarget(page, key);
}

// 数値でなく図の形を見る検査なので、短い本文で回す
test.beforeEach(async ({ page }) => {
  await useShortText(page);
});
test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに2本の折れ線が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/n-sensitivity');
  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: 'N感度', exact: true, level: 1 })).toBeVisible();

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

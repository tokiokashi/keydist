import { expect, test, PAGE_TAG, type Locator, type Page } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指ごとの比較（配列×指のマトリックス）: 単体ページで面を切り替えると、表の見出しが替わる。
 * 値の計算と割り算は単体テスト（`extract.test.ts`・`display.test.ts`）が検査するので、ここでは配線と操作だけを見る。
 */

const TARGETS = [
  { kind: 'layout', layoutId: 'qwerty' },
  { kind: 'layout', layoutId: 'dvorak' },
  { kind: 'layout', layoutId: 'colemak-dh' },
];

function seedThreeLayouts(targets: readonly unknown[]) {
  localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets, colorSlots: {} }));
}

async function openStandalone(page: Page): Promise<Locator> {
  await page.addInitScript(seedThreeLayouts, TARGETS);
  await page.goto('/analyzer/finger-matrix');
  await waitForHydration(page);
  const table = page.locator('.finger-matrix-table');
  await expect(table.locator('tbody tr[data-finger-matrix-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  return table;
}

async function chooseSurface(page: Page, label: string): Promise<void> {
  const settings = await openSettings(page);
  await settings.getByLabel('見る量', { exact: true }).selectOption({ label });
}

test('単体ページ: 見る量を指間の面に切り替えると、表の見出しが指の組に替わる', { tag: PAGE_TAG }, async ({ page }) => {
  const table = await openStandalone(page);
  // 既定の面は移動距離: 親指を含む10列。見出しは短い名前で、正式な名前が読み上げ名とtitleに出る
  await expect(table.locator('caption')).toContainText('移動距離');
  expect(await table.locator('thead th[scope="col"]').count()).toBe(11);
  const left = table.getByRole('button', { name: '左小指', exact: true });
  await expect(left).toHaveText('左小');
  await expect(left).toHaveAttribute('title', /左小指.*昇順・降順・並び替えなし/);

  await chooseSurface(page, '指間距離の平均');
  expect(await table.locator('thead th[scope="col"]').count()).toBe(7);
  await expect(table.getByRole('button', { name: '左小指と左薬指の間', exact: true })).toHaveText('左小-左薬');
});

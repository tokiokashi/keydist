import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';

/**
 * ヒートマップ（レイヤー）のE2E。押下数と最大値の値はunit test（`layer-view.test.ts`・`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（図・並べ方・まとめ・色の尺度の切り替え・シフトキーの枠色の凡例）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem(
        'keydist:single-target-selection',
        JSON.stringify({
          version: 1,
          target: { kind: 'layout', layoutId: id },
        }),
      );
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap-layers"]');
const diagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]');
const visibleDiagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]:not([hidden])');

test('層が複数の配列: 並置で全部の層が見え、解析設定でタブにすると1枚だけ見える', { tag: PAGE_TAG }, async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/analyzer/heatmap-layers');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(5);
  // シフトキーの枠色の凡例が出る
  await expect(feature(page).getByLabel('シフトキーの枠色')).toBeVisible();

  const settings = await openSettings(page);
  await settings.getByRole('group', { name: 'レイヤーの並べ方' }).getByRole('button', { name: 'タブ' }).click();
  await expect(feature(page).getByRole('tab')).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(1);
  await feature(page).getByRole('tab', { name: 'レイヤー3' }).click();
  await expect(feature(page).getByRole('tab', { name: 'レイヤー3' })).toHaveAttribute('aria-selected', 'true');
  await expect(feature(page).locator('[data-heatmap-diagram="layer:薬指シフト"]')).toBeVisible();
  await expect(feature(page).locator('[data-heatmap-diagram="single"]')).toBeHidden();
});

test('見出しのボタンで、図を表に切り替えられ、図へ戻せる', { tag: PAGE_TAG }, async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/analyzer/heatmap-layers');
  await expect(diagrams(page)).toHaveCount(5, { timeout: 15_000 });

  const toggle = feature(page).getByRole('button', { name: 'レイヤーごとの押下数を表で見る' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // 列は図と同じ5レイヤー（行の見出しの列を含めて6列）
  const table = feature(page).locator('table.figure-table');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(6);
  await expect(diagrams(page)).toHaveCount(0);

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(diagrams(page)).toHaveCount(5);
  await expect(table).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ヒートマップのE2E。押下数の値はunit test（`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（図が1枚出る・解析設定の項目が無い・Workspaceに足せる）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap"]');
const diagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]');

test('ヒートマップの図が1枚出て、押したキーにだけヒートが付く。シフトキーの枠は描かない', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap');
  await expect(page.getByRole('heading', { name: 'ヒートマップ', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  await expect(diagrams(page).first().locator('figcaption')).toHaveText('打鍵頻度');
  const heat = (id: string) => diagrams(page).first().locator(`[data-heatmap-key="${id}"]`).getAttribute('data-heat');
  expect(Number(await heat('d'))).toBeGreaterThan(0);
  // 新下駄の中指シフトのトリガー(k)は、ヒートマップ（レイヤー）では枠色が付くが、ヒートマップには付かない
  await expect(diagrams(page).first().locator('[data-heatmap-key="k"] rect').first()).toHaveAttribute('stroke-width', '1');
  await expect(feature(page).getByLabel('シフトキーの枠色')).toHaveCount(0);
  await expect(feature(page).getByRole('tablist')).toHaveCount(0);
});

test('解析設定に項目は無い', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings.getByText('このAnalyzerに解析設定はありません。')).toBeVisible();
  await expect(settings.getByRole('group', { name: '色の尺度' })).toHaveCount(0);
});

test('Workspaceの「ペインを追加」にヒートマップとヒートマップ（レイヤー）の2つが並び、ヒートマップを足せる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await expect(page.getByRole('menuitem', { name: /ヒートマップ（レイヤー）/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
});

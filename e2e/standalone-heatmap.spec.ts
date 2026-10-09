import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ヒートマップのE2E。押下数と最大値の値はunit test（`layer-view.test.ts`・`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（統合図・層別図・並べ方・まとめ・色の尺度の切り替え）だけを見る。
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
const visibleDiagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]:not([hidden])');

test('層が1つの配列: 統合図と層別図が1枚ずつ出て、タブは出ない', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap');
  await expect(page.getByRole('heading', { name: 'ヒートマップ', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(2);
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  await expect(feature(page).getByRole('tablist')).toHaveCount(0);
  // 押下したキーはヒートが付き、押していないキーは付かない
  const heat = (id: string) => diagrams(page).nth(1).locator(`[data-heatmap-key="${id}"]`).getAttribute('data-heat');
  expect(Number(await heat('e'))).toBeGreaterThan(0);
  expect(Number(await heat('1'))).toBe(0);
  // ツールチップは物理キーの名前と押下数だけで、内部のキーidは出さない
  const tip = await diagrams(page).nth(1).locator('[data-heatmap-key="e"] title').textContent();
  expect(tip).toMatch(/^E: \d+打$/);
});

test('層が複数の配列: 並置で全部の層が見え、タブにすると1枚だけ見える', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap?arrange=side-by-side');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  // 統合 + 5層
  await expect(diagrams(page)).toHaveCount(6);
  await expect(visibleDiagrams(page)).toHaveCount(6);

  await page.goto('/standalone/heatmap?arrange=tabs');
  await expect(feature(page).getByRole('tab')).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(2);
  await feature(page).getByRole('tab', { name: 'レイヤー3' }).click();
  await expect(feature(page).getByRole('tab', { name: 'レイヤー3' })).toHaveAttribute('aria-selected', 'true');
  await expect(feature(page).locator('[data-heatmap-diagram="layer:薬指シフト"]')).toBeVisible();
  await expect(feature(page).locator('[data-heatmap-diagram="single"]')).toBeHidden();
});

test('並べ方が自動の時は、5層まで並置', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).getByRole('tab')).toHaveCount(0);
  await expect(visibleDiagrams(page)).toHaveCount(6);
});

test('色の尺度を対数にすると、層別図の色が変わり、統合図は変わらない', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const heats = async () => ({
    integrated: await diagrams(page).first().locator('[data-heatmap-key]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-heat'))),
    layer: await diagrams(page).nth(1).locator('[data-heatmap-key]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-heat'))),
  });
  const linear = await heats();
  await page.goto('/standalone/heatmap?scale=log');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const log = await heats();
  expect(log.integrated).toEqual(linear.integrated);
  expect(log.layer).not.toEqual(linear.layer);
});

test('層をまとめる配列: まとめと詳細を切り替えられ、層の数が変わる', async ({ page }) => {
  await selectLayout(page, 'naginata-v18');
  await page.goto('/standalone/heatmap?arrange=side-by-side');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'レイヤー別ヒートマップの表示', exact: true }).click();
  const box = page.getByRole('group', { name: 'レイヤー別ヒートマップの表示' });
  await box.getByRole('button', { name: '全レイヤー詳細' }).click();
  await expect(diagrams(page)).toHaveCount(32);
  await box.getByRole('button', { name: '2面にまとめる' }).click();
  await expect(diagrams(page)).toHaveCount(3);
});

test('層をまとめる宣言が無い配列には、まとめと詳細の切り替えを出さない', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'レイヤー別ヒートマップの表示' })).toHaveCount(0);
  await expect(feature(page).getByRole('button', { name: '全レイヤー詳細' })).toHaveCount(0);
});

test('Workspaceのペインで、解析設定から層の並べ方と色の尺度を変えられ、タブで層を切り替えられる', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /ヒートマップ/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  await expect(diagrams(page)).toHaveCount(6);
  await expect(feature(page).getByRole('tab')).toHaveCount(0);

  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('group', { name: 'レイヤーの並べ方' }).getByRole('button', { name: 'タブ' }).click();
  await settings.getByRole('group', { name: '色の尺度' }).getByRole('button', { name: '対数' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(feature(page).getByRole('tab')).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(2);
  await feature(page).getByRole('tab', { name: 'レイヤー2' }).click();
  await expect(feature(page).locator('[data-heatmap-diagram="layer:中指シフト"]')).toBeVisible();
  await expect(feature(page).locator('[data-heatmap-diagram="single"]')).toBeHidden();
});

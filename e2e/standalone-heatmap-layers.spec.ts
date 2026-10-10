import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ヒートマップ（レイヤー）のE2E。押下数と最大値の値はunit test（`layer-view.test.ts`・`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（図・並べ方・まとめ・色の尺度の切り替え・シフトキーの枠色の凡例）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap-layers"]');
const diagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]');
const visibleDiagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]:not([hidden])');

test('層が1つの配列: 図が1枚出て、タブも色の決め方の説明の行も出ない', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap-layers');
  await expect(page.getByRole('heading', { name: 'ヒートマップ（レイヤー）', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'single');
  // 図の数は括弧の外に出し、括弧が二重にならない
  await expect(feature(page).getByRole('heading', { level: 3 })).toHaveText('ヒートマップ（レイヤー）・1図');
  await expect(feature(page).getByRole('tablist')).toHaveCount(0);
  // 色の決め方の説明は画面の常時の文に出さず、見出しのⓘで読む
  await expect(page.getByText('全部のレイヤーで最大値をそろえています')).toHaveCount(0);
  await page.getByRole('button', { name: 'ヒートマップ（レイヤー）の説明', exact: true }).click();
  await expect(page.getByText('全部のレイヤーで最大値をそろえています')).toBeVisible();
  // 押下したキーはヒートが付き、押していないキーは付かない
  const heat = (id: string) => diagrams(page).first().locator(`[data-heatmap-key="${id}"]`).getAttribute('data-heat');
  expect(Number(await heat('e'))).toBeGreaterThan(0);
  expect(Number(await heat('1'))).toBe(0);
  // ツールチップの1行目は物理キーの名前と押下数で、内部のキーidは出さない。続く行の値はkey-detail.spec.tsで見る
  const tip = await diagrams(page).first().locator('[data-heatmap-key="e"] title').textContent();
  expect(tip?.split('\n')[0]).toMatch(/^E: \d+打$/);
});

test('層が複数の配列: 並置で全部の層が見え、タブにすると1枚だけ見える', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-layers?arrange=side-by-side');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(5);
  // シフトキーの枠色の凡例が出る
  await expect(feature(page).getByLabel('シフトキーの枠色')).toBeVisible();

  await page.goto('/standalone/heatmap-layers?arrange=tabs');
  await expect(feature(page).getByRole('tab')).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(1);
  await feature(page).getByRole('tab', { name: 'レイヤー3' }).click();
  await expect(feature(page).getByRole('tab', { name: 'レイヤー3' })).toHaveAttribute('aria-selected', 'true');
  await expect(feature(page).locator('[data-heatmap-diagram="layer:薬指シフト"]')).toBeVisible();
  await expect(feature(page).locator('[data-heatmap-diagram="single"]')).toBeHidden();
});

test('並べ方が自動の時は、5層まで並置', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-layers');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).getByRole('tab')).toHaveCount(0);
  await expect(visibleDiagrams(page)).toHaveCount(5);
});

test('色の尺度を対数にすると、図の色が変わる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap-layers');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const heats = () => diagrams(page).first().locator('[data-heatmap-key]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-heat')));
  const linear = await heats();
  await page.goto('/standalone/heatmap-layers?scale=log');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  expect(await heats()).not.toEqual(linear);
});

test('層をまとめる配列: まとめと詳細を切り替えられ、層の数が変わる', async ({ page }) => {
  await selectLayout(page, 'naginata-v18');
  await page.goto('/standalone/heatmap-layers?arrange=side-by-side');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'ヒートマップ（レイヤー）の表示', exact: true }).click();
  const box = page.getByRole('group', { name: 'ヒートマップ（レイヤー）の表示' });
  await box.getByRole('button', { name: '全レイヤー詳細' }).click();
  await expect(diagrams(page)).toHaveCount(31);
  await box.getByRole('button', { name: '2レイヤーにまとめる' }).click();
  await expect(diagrams(page)).toHaveCount(2);
});

test('層をまとめる宣言が無い配列には、まとめと詳細の切り替えを出さない', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-layers');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'ヒートマップ（レイヤー）の表示' })).toHaveCount(0);
  await expect(feature(page).getByRole('button', { name: '全レイヤー詳細' })).toHaveCount(0);
});

test('Workspaceのペインで、解析設定から層の並べ方と色の尺度を変えられ、タブで層を切り替えられる', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /ヒートマップ（レイヤー）/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(5);
  await expect(feature(page).getByRole('tab')).toHaveCount(0);

  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('group', { name: 'レイヤーの並べ方' }).getByRole('button', { name: 'タブ' }).click();
  await settings.getByRole('group', { name: '色の尺度' }).getByRole('button', { name: '対数' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(feature(page).getByRole('tab')).toHaveCount(5);
  await expect(visibleDiagrams(page)).toHaveCount(1);
  await feature(page).getByRole('tab', { name: 'レイヤー2' }).click();
  await expect(feature(page).locator('[data-heatmap-diagram="layer:中指シフト"]')).toBeVisible();
  await expect(feature(page).locator('[data-heatmap-diagram="single"]')).toBeHidden();
});

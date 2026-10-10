import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** 単体の画面でSingleの対象の図の下に並べる、Multiの集合の対象の図 */
const SINGLE_KEY = 'keydist:single-target-selection';
const MULTI_KEY = 'keydist:multi-target-selection';

async function seedSelections(page: Page, single: string, multi: readonly string[]) {
  await page.addInitScript(([singleId, multiIds, singleKey, multiKey]) => {
    localStorage.setItem(singleKey, JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: singleId } }));
    localStorage.setItem(multiKey, JSON.stringify({ version: 1, targets: multiIds.map((layoutId) => ({ kind: 'layout', layoutId })), colorSlots: {} }));
  }, [single, multi, SINGLE_KEY, MULTI_KEY] as const);
}

const cells = (page: Page) => feature(page).locator('[data-heatmap-set-target]');

/** 図のキーごとの、ツールチップ1行目（キーの名前と押下数）と色の強度 */
async function keyReadings(figure: Locator) {
  return figure.locator('[data-heatmap-key]').evaluateAll((keys) => keys.map((key) => ({
    id: key.getAttribute('data-heatmap-key')!,
    tooltip: (key.querySelector('title')?.textContent ?? '').split('\n')[0]!,
    heat: key.getAttribute('data-heat')!,
  })));
}

test('集合の対象の図が、Singleの対象の下に名前と印付きで並ぶ。Singleの対象と同じ対象は並ばない', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak', 'colemak-dh']);
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(cells(page)).toHaveCount(2);
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  for (const cell of await cells(page).all()) {
    await expect(cell.locator('.heatmap-set-name')).not.toHaveText('');
    await expect(cell.locator('.heatmap-set-swatch')).toHaveCount(1);
  }
  const top = await diagrams(page).first().boundingBox();
  const first = await cells(page).first().boundingBox();
  expect(first!.y).toBeGreaterThan(top!.y + top!.height - 1);
});

test('集合が空、またはSingleの対象だけなら、図は1つだけ', async ({ page }) => {
  await seedSelections(page, 'qwerty', []);
  await page.goto('/standalone/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(cells(page)).toHaveCount(0);

  const onlySingle = await page.context().newPage();
  await seedSelections(onlySingle, 'qwerty', ['qwerty']);
  await onlySingle.goto('/standalone/heatmap');
  await expect(feature(onlySingle)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(onlySingle)).toHaveCount(1);
  await expect(cells(onlySingle)).toHaveCount(0);
});

test('格子の図の押下数は、同じ対象をSingleで選んだ時の図と一致する', async ({ page }) => {
  await seedSelections(page, 'colemak-dh', ['colemak-dh']);
  await page.goto('/standalone/heatmap');
  await expect(diagrams(page)).toHaveCount(1, { timeout: 10_000 });
  const asSingle = await keyReadings(diagrams(page).first());

  const grid = await page.context().newPage();
  await seedSelections(grid, 'qwerty', ['qwerty', 'colemak-dh']);
  await grid.goto('/standalone/heatmap');
  const cell = cells(grid).filter({ has: grid.locator('[data-heatmap-diagram]') });
  await expect(cell).toHaveCount(1, { timeout: 10_000 });
  const inGrid = await keyReadings(cell.locator('[data-heatmap-diagram]'));
  expect(inGrid.map(({ id, tooltip }) => ({ id, tooltip }))).toEqual(asSingle.map(({ id, tooltip }) => ({ id, tooltip })));
});

test('色の尺度は全部の図の最大で揃う。最大の違う組では、格子の図の濃さが押下数÷全部の図の最大になる', async ({ page }) => {
  // 既定のテキストで、QWERTYの最大は84、新下駄の最大は47
  await seedSelections(page, 'qwerty', ['shingeta']);
  await page.goto('/standalone/heatmap');
  const cell = cells(page).filter({ has: page.locator('[data-heatmap-diagram]') });
  await expect(cell).toHaveCount(1, { timeout: 10_000 });
  const top = await keyReadings(diagrams(page).first());
  const grid = await keyReadings(cell.locator('[data-heatmap-diagram]'));
  const countOf = (tooltip: string) => Number(tooltip.split(': ')[1]!.replace('打', ''));
  const max = Math.max(...top.map((key) => countOf(key.tooltip)), ...grid.map((key) => countOf(key.tooltip)));
  expect(max).toBe(84);
  expect(Math.max(...grid.map((key) => countOf(key.tooltip)))).toBe(47);
  for (const key of [...top, ...grid]) {
    expect(Math.abs(Number(key.heat) - countOf(key.tooltip) / max)).toBeLessThan(0.002);
  }
  expect(Math.max(...grid.map((key) => Number(key.heat)))).toBeLessThan(0.6);
});

test('格子の図は、1列になる幅でも一番上の図より大きくならない', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await seedSelections(page, 'qwerty', ['dvorak', 'workman']);
  await page.goto('/standalone/heatmap');
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  const top = (await diagrams(page).first().boundingBox())!;
  for (const cell of await cells(page).all()) {
    const box = (await cell.locator('[data-heatmap-diagram]').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(top.width + 1);
  }
});

test('格子の図のツールチップは押下数だけで、キーを押しても小窓は開かない。一番上の図は内訳を出す', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['dvorak']);
  await page.goto('/standalone/heatmap');
  const cell = cells(page).first();
  await expect(cell.locator('[data-heatmap-diagram]')).toBeVisible({ timeout: 10_000 });
  const gridTitles = await cell.locator('[data-heatmap-key] title').allTextContents();
  expect(gridTitles.every((title) => !title.includes('\n'))).toBe(true);
  await expect(cell.locator('[data-heatmap-key][role="button"]')).toHaveCount(0);
  const topTitles = await diagrams(page).first().locator('[data-heatmap-key] title').allTextContents();
  expect(topTitles.some((title) => title.includes('押し方:'))).toBe(true);
});

for (const viewport of [{ name: 'パソコン幅', width: 1440, height: 900 }, { name: 'スマホ幅', width: 390, height: 800 }]) {
  test(`${viewport.name}: 格子の図が画面の幅からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await seedSelections(page, 'qwerty', ['dvorak', 'colemak-dh', 'workman', 'colemak']);
    await page.goto('/standalone/heatmap');
    await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') }).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const figure of await feature(page).locator('[data-heatmap-diagram]').all()) {
      const box = (await figure.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
}

test('Workspaceのペインは、Multiの集合があっても図が1つのまま', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak']);
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(cells(page)).toHaveCount(0);
});

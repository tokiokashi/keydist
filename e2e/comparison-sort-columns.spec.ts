import { expect, test, type Locator, type Page } from '@playwright/test';
import { openSettings, targetNames } from './pane-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 比較表の列の見出し: 並び替え（昇順 → 降順 → 解除）と、列名・列ごとの説明。
 * 並び替えは比較表の表示だけで、対象の集合の順（N感度と共有している）は変えない。
 */

const MULTI_TARGET_SELECTION_KEY = 'keydist:multi-target-selection';
const WORKSPACES_KEY = 'keydist:workspaces';

/** 集合の順（一覧の順）は Dvorak → QWERTY → Colemak-DH の順に並ぶとは限らないので、画面から読む。 */
function seedThreeLayouts() {
  localStorage.setItem(
    'keydist:multi-target-selection',
    JSON.stringify({
      version: 1,
      targets: [
        { kind: 'layout', layoutId: 'qwerty' },
        { kind: 'layout', layoutId: 'dvorak' },
        { kind: 'layout', layoutId: 'colemak-dh' },
      ],
      colorSlots: {},
    }),
  );
}

async function openComparison(page: Page): Promise<Locator> {
  await page.addInitScript(seedThreeLayouts);
  await page.goto('/standalone/comparison');
  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  return table;
}

/** 表の行の名前（上から順）。 */
async function rowNames(table: Locator): Promise<readonly string[]> {
  return (await table.locator('tbody th[scope="row"]').allInnerTexts()).map((text) => text.trim());
}

/** 列（見出しの名前）の数値（上から順）。 */
async function columnValues(table: Locator, header: string): Promise<readonly number[]> {
  const headers = (await table.locator('thead th').allInnerTexts()).map((text) => text.trim());
  const index = headers.findIndex((text) => text.startsWith(header));
  expect(index, header).toBeGreaterThan(0);
  const cells = await table.locator(`tbody tr td:nth-child(${index + 1}) .comparison-value`).allInnerTexts();
  return cells.map((text) => parseFloat(text));
}

function sortButton(table: Locator, label: string): Locator {
  return table.locator('thead th').filter({ has: table.page().getByRole('button', { name: label, exact: true }) }).getByRole('button', { name: label, exact: true });
}

function headerOf(table: Locator, label: string): Locator {
  return table.locator('thead th').filter({ has: table.page().getByRole('button', { name: label, exact: true }) });
}

const ascending = (values: readonly number[]) => [...values].sort((a, b) => a - b);

test('見出しを押すたびに 昇順 → 降順 → 解除（元の順）。向きの印と aria-sort が付く', async ({ page }) => {
  const table = await openComparison(page);
  const original = await rowNames(table);
  expect(original).toHaveLength(3);
  const header = headerOf(table, '距離 [u]');
  await expect(header).not.toHaveAttribute('aria-sort', /.+/);

  await sortButton(table, '距離 [u]').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(header).toContainText('↑');
  expect(await columnValues(table, '距離')).toEqual(ascending(await columnValues(table, '距離')));

  await sortButton(table, '距離 [u]').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(header).toContainText('↓');
  expect(await columnValues(table, '距離')).toEqual(ascending(await columnValues(table, '距離')).reverse());

  await sortButton(table, '距離 [u]').click();
  await expect(header).not.toHaveAttribute('aria-sort', /.+/);
  await expect(header).not.toContainText('↑');
  await expect(header).not.toContainText('↓');
  expect(await rowNames(table)).toEqual(original);
});

test('キーボード（Enter・Space）でも切り替わる。別の列を押すと前の列の印は消えて昇順から', async ({ page }) => {
  const table = await openComparison(page);
  const original = await rowNames(table);
  const distance = headerOf(table, '距離 [u]');
  const sameFinger = headerOf(table, '同指率');

  await sortButton(table, '距離 [u]').focus();
  await page.keyboard.press('Enter');
  await expect(distance).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('Space');
  await expect(distance).toHaveAttribute('aria-sort', 'descending');

  await sortButton(table, '同指率').click();
  await expect(sameFinger).toHaveAttribute('aria-sort', 'ascending');
  await expect(distance).not.toHaveAttribute('aria-sort', /.+/);
  expect(await columnValues(table, '同指率')).toEqual(ascending(await columnValues(table, '同指率')));

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(sameFinger).not.toHaveAttribute('aria-sort', /.+/);
  expect(await rowNames(table)).toEqual(original);
});

test('並び替えは保存され、再読み込みしても残る。解析設定の欄に出て、そこから戻せる', async ({ page }) => {
  const table = await openComparison(page);
  await sortButton(table, '距離 [u]').click();
  await sortButton(table, '距離 [u]').click();
  await expect(headerOf(table, '距離 [u]')).toHaveAttribute('aria-sort', 'descending');
  const sorted = await rowNames(table);

  await page.reload();
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(headerOf(table, '距離 [u]')).toHaveAttribute('aria-sort', 'descending');
  expect(await rowNames(table)).toEqual(sorted);

  const settings = await openSettings(page);
  await expect(settings).toContainText('距離 [u]（降順）');
  await settings.getByRole('button', { name: '並び替えを既定値へ戻す' }).click();
  await expect(settings).toContainText('なし');
  await expect(headerOf(table, '距離 [u]')).not.toHaveAttribute('aria-sort', /.+/);
});

test('共有URLに並び替えが載り、開いた先でも同じ並びになる。解除するとURLに出ない', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const table = await openComparison(page);
  await sortButton(table, '同指率').click();
  await sortButton(table, '同指率').click();
  await expect(headerOf(table, '同指率')).toHaveAttribute('aria-sort', 'descending');
  const sorted = await rowNames(table);

  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).searchParams.get('sort')).toBe('sameFingerRate:desc');

  const other = await context.browser()!.newContext();
  try {
    const opened = await other.newPage();
    await opened.goto(url);
    const openedTable = opened.locator('.comparison-table');
    await expect(openedTable.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
    await expect(headerOf(openedTable, '同指率')).toHaveAttribute('aria-sort', 'descending');
    expect(await rowNames(openedTable)).toEqual(sorted);
  } finally {
    await other.close();
  }

  await sortButton(table, '同指率').click();
  await expect(headerOf(table, '同指率')).not.toHaveAttribute('aria-sort', /.+/);
  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  const cleared = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(cleared).searchParams.has('sort')).toBe(false);
});

test('並び替えても対象の集合の順は変わらず、N感度の対象の順も変わらない', async ({ page }) => {
  const table = await openComparison(page);
  const listOrder = await targetNames(page);
  expect(listOrder).toHaveLength(3);
  const storedBefore = await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY);

  await sortButton(table, '距離 [u]').click();
  await sortButton(table, '距離 [u]').click();
  await expect(headerOf(table, '距離 [u]')).toHaveAttribute('aria-sort', 'descending');
  // 表の行は並び替わるが、見出しの対象の並びは一覧の順のまま。
  expect(await targetNames(page)).toEqual(listOrder);
  expect(await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY)).toBe(storedBefore);

  await page.goto('/standalone/n-sensitivity');
  await expect(page.getByRole('button', { name: /^対象: / })).toBeVisible({ timeout: 15_000 });
  expect(await targetNames(page)).toEqual(listOrder);
});

test('列名は短くそろい、各見出しのⓘに列ごとの説明が出る（内部の語を使わない）', async ({ page }) => {
  const table = await openComparison(page);
  const headers = (await table.locator('thead th').allInnerTexts()).map((text) => text.replace(/[↑↓]/g, '').trim());
  expect(headers).toEqual([
    '対象',
    '動作数',
    '距離 [u]',
    'u/打鍵',
    'u/文字',
    '動作数/文字',
    '押下/文字',
    '単打面率',
    '単打率',
    '1キー率',
    '同指',
    '同指率',
    '指間平均 [u]',
    '指間σ [u]',
  ]);

  const info = page.getByRole('button', { name: '指間平均 [u]の説明' });
  await expect(info).toHaveCount(1);
  await info.focus();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('ホームに置いた時の間隔');
  for (const word of ['Policy', 'fresh', 'Stroke', 'physical', 'mean']) {
    await expect(tip).not.toContainText(word);
  }
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);

  // 列ごとに説明のⓘが1つずつある。
  await expect(table.locator('thead .info-button')).toHaveCount(13);
});

test('Workspace: 並び替えはペインごとに持ち、片方を並べても他方の行の順は変わらない', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let n = 0; n < 2; n += 1) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: /比較表/ }).click();
  }
  const panes = page.locator('.pane-frame');
  await expect(panes).toHaveCount(2);
  // 先頭のペインで対象を選ぶ。2つ目は同じ連動に従う。
  await panes.nth(0).getByRole('button', { name: /^対象: / }).click();
  const dialog = page.getByRole('dialog', { name: '対象の選択' });
  for (const id of ['qwerty', 'dvorak', 'colemak-dh']) await dialog.locator(`input[value="layout:${id}"]`).click();
  await page.keyboard.press('Escape');
  const tables = page.locator('.comparison-table');
  for (let n = 0; n < 2; n += 1) {
    await expect(tables.nth(n).locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  }
  const original = await rowNames(tables.nth(1));

  const first = tables.nth(0);
  await sortButton(first, '距離 [u]').click();
  await sortButton(first, '距離 [u]').click();
  await expect(headerOf(first, '距離 [u]')).toHaveAttribute('aria-sort', 'descending');
  await expect(headerOf(tables.nth(1), '距離 [u]')).not.toHaveAttribute('aria-sort', /.+/);
  expect(await rowNames(tables.nth(1))).toEqual(original);

  // ペインごとに保存され、再読み込みしても先頭のペインだけ並んでいる。
  await expect.poll(async () => {
    const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY)) ?? '{"workspaces":[]}') as {
      workspaces: { panes: { options?: unknown }[] }[];
    };
    return stored.workspaces[0]?.panes.map((p) => JSON.stringify(p.options ?? null).includes('totalUnits'));
  }).toEqual([true, false]);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.comparison-table').nth(0).locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(headerOf(page.locator('.comparison-table').nth(0), '距離 [u]')).toHaveAttribute('aria-sort', 'descending');
  await expect(headerOf(page.locator('.comparison-table').nth(1), '距離 [u]')).not.toHaveAttribute('aria-sort', /.+/);

  // ⋯の「解析設定を初期値に戻す」で、そのペインの並び替えが解除される。
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ }).click();
  await expect(headerOf(page.locator('.comparison-table').nth(0), '距離 [u]')).not.toHaveAttribute('aria-sort', /.+/);
});

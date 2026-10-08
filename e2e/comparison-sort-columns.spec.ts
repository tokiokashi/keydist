import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectTargetNames, openSettings, targetNames } from './pane-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 比較表の列の見出し: 並び替え（昇順 → 降順 → 解除）と、列名。
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
  const header = headerOf(table, '距離');
  await expect(header).not.toHaveAttribute('aria-sort', /.+/);

  await sortButton(table, '距離').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(header).toContainText('↑');
  expect(await columnValues(table, '距離')).toEqual(ascending(await columnValues(table, '距離')));

  await sortButton(table, '距離').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(header).toContainText('↓');
  expect(await columnValues(table, '距離')).toEqual(ascending(await columnValues(table, '距離')).reverse());

  await sortButton(table, '距離').click();
  await expect(header).not.toHaveAttribute('aria-sort', /.+/);
  await expect(header).not.toContainText('↑');
  await expect(header).not.toContainText('↓');
  expect(await rowNames(table)).toEqual(original);
});

test('キーボード（Enter・Space）でも切り替わる。別の列を押すと前の列の印は消えて昇順から', async ({ page }) => {
  const table = await openComparison(page);
  const original = await rowNames(table);
  const distance = headerOf(table, '距離');
  const sameFinger = headerOf(table, '同指率');

  await sortButton(table, '距離').focus();
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
  await sortButton(table, '距離').click();
  await sortButton(table, '距離').click();
  await expect(headerOf(table, '距離')).toHaveAttribute('aria-sort', 'descending');
  const sorted = await rowNames(table);

  await page.reload();
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(headerOf(table, '距離')).toHaveAttribute('aria-sort', 'descending');
  expect(await rowNames(table)).toEqual(sorted);

  const settings = await openSettings(page);
  await expect(settings).toContainText('距離（降順）');
  await settings.getByRole('button', { name: '並び替えを既定値へ戻す' }).click();
  await expect(settings).toContainText('なし');
  await expect(headerOf(table, '距離')).not.toHaveAttribute('aria-sort', /.+/);
});

test('共有URLに並び替えが載り、開いた先でも同じ並びになる。解除するとURLに出ない', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const table = await openComparison(page);
  await sortButton(table, '同指率').click();
  await sortButton(table, '同指率').click();
  await expect(headerOf(table, '同指率')).toHaveAttribute('aria-sort', 'descending');
  const sorted = await rowNames(table);

  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーしました' })).toBeVisible();
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
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーしました' })).toBeVisible();
  const cleared = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(cleared).searchParams.has('sort')).toBe(false);
});

test('並び替えても対象の集合の順は変わらず、N感度の対象の順も変わらない', async ({ page }) => {
  const table = await openComparison(page);
  // 見出しの対象ボタンは描画されても、名前の一覧が埋まるのは少し後になるので、3件になるまで待ってから読む。
  await expect.poll(async () => (await targetNames(page)).length).toBe(3);
  const listOrder = await targetNames(page);
  const storedBefore = await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY);

  await sortButton(table, '距離').click();
  await sortButton(table, '距離').click();
  await expect(headerOf(table, '距離')).toHaveAttribute('aria-sort', 'descending');
  // 表の行は並び替わるが、見出しの対象の並びは一覧の順のまま。
  await expectTargetNames(page, listOrder);
  expect(await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY)).toBe(storedBefore);

  await page.goto('/standalone/n-sensitivity');
  await expect(page.getByRole('button', { name: /^対象: / })).toBeVisible({ timeout: 15_000 });
  await expectTargetNames(page, listOrder);
});

test('列名は短くそろい、見出しのセルにⓘは置かない', async ({ page }) => {
  const table = await openComparison(page);
  const headers = (await table.locator('thead th').allInnerTexts()).map((text) => text.replace(/[↑↓]/g, '').trim());
  expect(headers).toEqual([
    '対象',
    '動作数',
    '距離',
    'u/打鍵',
    'u/文字',
    '動作数/文字',
    '押下/文字',
    '単打面率',
    '単打率',
    '1キー率',
    '同指',
    '同指率',
    '指間平均',
    '指間σ',
    '右手距離率',
    '右手押下率',
  ]);
  // 列ごとの説明は、見出しのⓘから開くモーダルに出る（comparison-column-help.spec.ts）。見出しのセルにⓘは置かない。
  await expect(table.locator('thead .info-button')).toHaveCount(0);
});

/** 見出しのセルの幅（左から順）。 */
async function headerWidths(table: Locator): Promise<readonly number[]> {
  return table.locator('thead th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
}

for (const width of [1500, 390]) {
  test(`向きの印で列の幅が変わらない（解除・昇順・降順。画面の幅${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const table = await openComparison(page);
    const none = await headerWidths(table);
    expect(none).toHaveLength(16);

    // 全列を順に押して、押した列を含む全列の幅が3状態で1px以内で同じことを確かめる。
    const labels = (await table.locator('thead th .comparison-sort-button').allInnerTexts()).map((text) => text.replace(/[↑↓]/g, '').trim());
    expect(labels).toHaveLength(15);
    for (const label of labels) {
      const button = sortButton(table, label);
      await button.scrollIntoViewIfNeeded();
      await button.click();
      const asc = await headerWidths(table);
      await button.click();
      const desc = await headerWidths(table);
      await button.click();
      const cleared = await headerWidths(table);
      for (const [state, widths] of [['昇順', asc], ['降順', desc], ['解除', cleared]] as const) {
        widths.forEach((w, index) => {
          expect(Math.abs(w - none[index]!), `${label} ${state} 列${index}`).toBeLessThanOrEqual(1);
        });
      }
    }
  });
}

/** 比較表を2つ並べ、3つの配列を対象にして、表が出るまで待つ。 */
async function openTwoComparisons(page: Page): Promise<void> {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let n = 0; n < 2; n += 1) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: /比較表/ }).click();
  }
  await expect(page.locator('.pane-frame')).toHaveCount(2);
  // 先頭のペインで対象を選ぶ。2つ目は同じ連動に従う。
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: /^対象: / }).click();
  const dialog = page.getByRole('dialog', { name: '対象の選択' });
  for (const id of ['qwerty', 'dvorak', 'colemak-dh']) await dialog.locator(`input[value="layout:${id}"]`).click();
  await page.keyboard.press('Escape');
  const tables = page.locator('.comparison-table');
  for (let n = 0; n < 2; n += 1) {
    await expect(tables.nth(n).locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  }
}

interface StoredSortWorkspace {
  readonly optionSets?: { options?: unknown }[];
  readonly panes: { options?: unknown; optionsBinding?: { mode: string } }[];
}

async function storedSortState(page: Page): Promise<StoredSortWorkspace | undefined> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return (JSON.parse(raw ?? '{"workspaces":[]}') as { workspaces: StoredSortWorkspace[] }).workspaces[0];
}

const hasSort = (value: unknown) => JSON.stringify(value ?? null).includes('totalUnits');

test('Workspace: 共有に従う2つの比較表では、片方を並べるともう片方も同じ順になる', async ({ page }) => {
  await openTwoComparisons(page);
  const tables = page.locator('.comparison-table');
  const first = tables.nth(0);
  await sortButton(first, '距離').click();
  await sortButton(first, '距離').click();
  await expect(headerOf(first, '距離')).toHaveAttribute('aria-sort', 'descending');
  await expect(headerOf(tables.nth(1), '距離')).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(async () => rowNames(tables.nth(1))).toEqual(await rowNames(first));

  // 並び替えは共有の設定に保存され、ペインの欄には書かれない
  await expect.poll(async () => hasSort((await storedSortState(page))?.optionSets?.map((set) => set.options))).toBe(true);
  expect((await storedSortState(page))?.panes.map((p) => p.options)).toEqual([undefined, undefined]);
  await page.reload();
  await waitForHydration(page);
  for (let n = 0; n < 2; n += 1) {
    await expect(headerOf(page.locator('.comparison-table').nth(n), '距離')).toHaveAttribute('aria-sort', 'descending');
  }

  // ⋯の「解析設定を初期値に戻す」で共有の並び替えが解除され、もう片方も解除される。
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ }).click();
  for (let n = 0; n < 2; n += 1) {
    await expect(headerOf(page.locator('.comparison-table').nth(n), '距離')).not.toHaveAttribute('aria-sort', /.+/);
  }
});

test('Workspace: 「このペインだけ」にしたペインは並び替えを自分で持ち、片方を並べても他方の行の順は変わらない', async ({ page }) => {
  await openTwoComparisons(page);
  const tables = page.locator('.comparison-table');
  const original = await rowNames(tables.nth(1));

  // 2つ目を「このペインだけ」にする
  await page.locator('.pane-frame').nth(1).getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('radio', { name: 'このペインだけ' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  const first = tables.nth(0);
  await sortButton(first, '距離').click();
  await sortButton(first, '距離').click();
  await expect(headerOf(first, '距離')).toHaveAttribute('aria-sort', 'descending');
  await expect(headerOf(tables.nth(1), '距離')).not.toHaveAttribute('aria-sort', /.+/);
  expect(await rowNames(tables.nth(1))).toEqual(original);

  // 並び替えは先頭のペインが従う共有の設定にだけ保存され、再読み込みしても先頭のペインだけ並んでいる。
  await expect.poll(async () => {
    const state = await storedSortState(page);
    return [hasSort(state?.optionSets?.map((set) => set.options)), ...(state?.panes.map((p) => hasSort(p.options)) ?? [])];
  }).toEqual([true, false, false]);
  expect((await storedSortState(page))?.panes.map((p) => p.optionsBinding?.mode)).toEqual(['shared', 'own']);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.comparison-table').nth(0).locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(headerOf(page.locator('.comparison-table').nth(0), '距離')).toHaveAttribute('aria-sort', 'descending');
  await expect(headerOf(page.locator('.comparison-table').nth(1), '距離')).not.toHaveAttribute('aria-sort', /.+/);

  // ⋯の「解析設定を初期値に戻す」で、そのペインの並び替えが解除される。
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ }).click();
  await expect(headerOf(page.locator('.comparison-table').nth(0), '距離')).not.toHaveAttribute('aria-sort', /.+/);
});

test('Workspace: 共有に従う2つの比較表で、間引きの待ちの間に別々のペインで続けて並べても、収まった後は両方の表示と保存値が一致する', async ({ page }) => {
  await openTwoComparisons(page);
  const tables = page.locator('.comparison-table');
  // 保存の間引き（約400ms）の中で、1つ目は「距離」、2つ目は「動作数」を並べる
  await sortButton(tables.nth(0), '距離').click();
  await sortButton(tables.nth(1), '動作数').click();

  await expect(headerOf(tables.nth(0), '動作数')).toHaveAttribute('aria-sort', 'ascending');
  await expect(headerOf(tables.nth(1), '動作数')).toHaveAttribute('aria-sort', 'ascending');
  // 保存が済むまで待ってから、もう一度両方を確かめる（待ちの間の反響で食い違わない）
  await expect.poll(async () => JSON.stringify((await storedSortState(page))?.optionSets)).toContain('"sort"');
  await page.waitForTimeout(1500);
  for (let n = 0; n < 2; n += 1) {
    await expect(headerOf(tables.nth(n), '動作数')).toHaveAttribute('aria-sort', 'ascending');
    await expect(headerOf(tables.nth(n), '距離')).not.toHaveAttribute('aria-sort', /.+/);
  }
  const stored = await storedSortState(page);
  expect(JSON.stringify(stored?.optionSets)).toContain('"sort":{"column":"actions"');
  await page.reload();
  await waitForHydration(page);
  for (let n = 0; n < 2; n += 1) {
    await expect(headerOf(page.locator('.comparison-table').nth(n), '動作数')).toHaveAttribute('aria-sort', 'ascending');
  }
});

test('Workspace: 共有に従う2つの比較表で、項目の違う変更を続けて行っても、両方の変更が残る', async ({ page }) => {
  await openTwoComparisons(page);
  const tables = page.locator('.comparison-table');
  // 2つ目の解析設定を開いておき、1つ目の並び替えと、2つ目の「基準比も表示する」（既定はオン）を外す
  const second = page.locator('.pane-frame').nth(1);
  await second.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings).toBeVisible();
  // DOMのclickで続けて押し、間引きの待ち（約400ms）の間に収める（Playwrightのclickは操作できるまでの待ちで長引く）
  await sortButton(tables.nth(0), '距離').evaluate((element) => (element as HTMLElement).click());
  await settings.getByRole('checkbox', { name: '基準比（%）も表示する' }).evaluate((element) => (element as HTMLElement).click());

  await page.waitForTimeout(1500);
  await expect(headerOf(tables.nth(0), '距離')).toHaveAttribute('aria-sort', 'ascending');
  await expect(headerOf(tables.nth(1), '距離')).toHaveAttribute('aria-sort', 'ascending');
  await expect(settings.getByRole('checkbox', { name: '基準比（%）も表示する' })).not.toBeChecked();
  const stored = JSON.stringify((await storedSortState(page))?.optionSets);
  expect(stored).toContain('"sort":{"column":"totalUnits"');
  expect(stored).toContain('"showBaselineRatio":false');
  await page.reload();
  await waitForHydration(page);
  await expect(headerOf(page.locator('.comparison-table').nth(1), '距離')).toHaveAttribute('aria-sort', 'ascending');
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('checkbox', { name: '基準比（%）も表示する' })).not.toBeChecked();
});

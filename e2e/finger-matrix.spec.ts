import { expect, test, type Locator, type Page } from '@playwright/test';
import { openSettings } from './pane-helper.ts';
import { waitForHydration } from './hydration-helper.ts';
import { holdWorker, installWorkerHold, releaseWorker } from './worker-hold-helper.ts';

/**
 * 指ごとの比較（配列×指のマトリックス）: 単体ページとWorkspaceのペインの配線、面の切り替え、列見出しによる並び替え。
 * 値の計算と割り算は単体テスト（`extract.test.ts`・`display.test.ts`）が検査するので、ここでは配線と操作だけを見る。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const TARGETS = [
  { kind: 'layout', layoutId: 'qwerty' },
  { kind: 'layout', layoutId: 'dvorak' },
  { kind: 'layout', layoutId: 'colemak-dh' },
];

function seedThreeLayouts(targets: readonly unknown[]) {
  localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets, colorSlots: {} }));
}

async function openStandalone(page: Page): Promise<Locator> {
  await installWorkerHold(page);
  await page.addInitScript(seedThreeLayouts, TARGETS);
  await page.goto('/standalone/finger-matrix');
  await waitForHydration(page);
  const table = page.locator('.finger-matrix-table');
  await expect(table.locator('tbody tr[data-finger-matrix-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  return table;
}

async function openInWorkspace(page: Page): Promise<Locator> {
  await installWorkerHold(page);
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
  }, {
    id: 'w',
    name: '指の比較',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: [{ id: 'p', analyzerId: 'finger-matrix', binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: TARGETS } } } }],
    grid: [{ id: 'p', x: 0, y: 0, w: 24, h: 16 }],
  });
  await page.goto('/workspace/w');
  await waitForHydration(page);
  const table = page.locator('.finger-matrix-table');
  await expect(table.locator('tbody tr[data-finger-matrix-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  return table;
}

/** 表の行の名前（上から順）。 */
async function rowNames(table: Locator): Promise<readonly string[]> {
  return (await table.locator('tbody th[scope="row"]').allInnerTexts()).map((text) => text.trim());
}

/** 列（見出しの短い名前）の、セルの文字（上から順）。 */
async function columnTexts(table: Locator, header: string): Promise<readonly string[]> {
  const headers = (await table.locator('thead th').allInnerTexts()).map((text) => text.replace(/[↑↓]/g, '').trim());
  const index = headers.indexOf(header);
  expect(index, header).toBeGreaterThan(0);
  return (await table.locator(`tbody tr td:nth-child(${index + 1})`).allInnerTexts()).map((text) => text.trim());
}

const headerOf = (table: Locator, name: string): Locator =>
  table.locator('thead th').filter({ has: table.page().getByRole('button', { name, exact: true }) });

const sortButton = (table: Locator, name: string): Locator => table.getByRole('button', { name, exact: true });

async function chooseSurface(page: Page, label: string): Promise<void> {
  const settings = await openSettings(page);
  await settings.getByLabel('見る量', { exact: true }).selectOption({ label });
}

async function checkSurfaceSwitchAndSort(page: Page, table: Locator): Promise<void> {
  // 既定の面は移動距離: 親指を含む10列。見出しは短い名前で、正式な名前が読み上げ名とtitleに出る
  await expect(table.locator('caption')).toContainText('移動距離');
  expect(await table.locator('thead th[scope="col"]').count()).toBe(11);
  const left = sortButton(table, '左小指');
  await expect(left).toHaveText('左小');
  await expect(left).toHaveAttribute('title', /左小指.*昇順・降順・並び替えなし/);

  // キーボード（Enter・Space）で 昇順 → 降順 → 解除
  const original = await rowNames(table);
  await left.focus();
  await page.keyboard.press('Enter');
  await expect(headerOf(table, '左小指')).toHaveAttribute('aria-sort', 'ascending');
  const ascending = (await columnTexts(table, '左小')).map(Number);
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  await page.keyboard.press('Space');
  await expect(headerOf(table, '左小指')).toHaveAttribute('aria-sort', 'descending');
  const descending = (await columnTexts(table, '左小')).map(Number);
  expect(descending).toEqual([...descending].sort((a, b) => b - a));
  await page.keyboard.press('Enter');
  await expect(headerOf(table, '左小指')).not.toHaveAttribute('aria-sort', /.+/);
  expect(await rowNames(table)).toEqual(original);

  // 並び替えを入れたまま面を切り替える。計算の依頼は止めてあるので、依頼が出れば計算中になる
  await sortButton(table, '左小指').click();
  await holdWorker(page);
  await chooseSurface(page, '押下数');
  await expect(table.locator('caption')).toContainText('押下数');
  await expect(headerOf(table, '左小指')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready');
  await expect(table.locator('[aria-busy="true"]')).toHaveCount(0);

  // 同指連続の比率でも指の列が並ぶので、並び替えを保つ
  await chooseSurface(page, '同指連続の比率');
  await expect(headerOf(table, '左小指')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready');

  // 指間の面には左小の列が無いので、並び替えていない状態になる。指の面へ戻すと並び替えが戻る
  await chooseSurface(page, '指間距離の平均');
  expect(await table.locator('thead th[scope="col"]').count()).toBe(7);
  await expect(table.locator('thead th[aria-sort]')).toHaveCount(0);
  expect(await rowNames(table)).toEqual(original);
  await expect(sortButton(table, '左小指と左薬指の間')).toHaveText('左小-左薬');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready');
  await chooseSurface(page, '移動距離');
  await expect(headerOf(table, '左小指')).toHaveAttribute('aria-sort', 'ascending');
  await releaseWorker(page);
}

test('単体ページ: 面を切り替えても計算中にならず、列見出しのキーボード操作で並び替えられる', async ({ page }) => {
  const table = await openStandalone(page);
  await checkSurfaceSwitchAndSort(page, table);
});

test('Workspaceのペイン: 面を切り替えても計算中にならず、列見出しのキーボード操作で並び替えられる', async ({ page }) => {
  const table = await openInWorkspace(page);
  await checkSurfaceSwitchAndSort(page, table);
  const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY)) ?? '{}');
  expect(stored.workspaces[0].panes[0].analyzerId).toBe('finger-matrix');
});

test('同指連続の比率の分母の違いは、見出しのⓘの説明で読める', async ({ page }) => {
  await openStandalone(page);
  await page.getByRole('button', { name: '指ごとの比較の説明' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('同指連続の比率');
  await expect(dialog).toContainText('その指で押した回数');
  await expect(dialog).toContainText('押したキーの数');
});

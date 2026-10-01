import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 個別画面の見出しの右端の「Workspaceに追加」（#712）。押すと送り先のメニューが開き、既存のWorkspaceか
 * 新しいWorkspaceへ今のAnalyzerをペインとして足す。追加しても個別画面に留まり、知らせの「開く」で追加先へ移る。
 * Workspaceの中のペインには置かない。
 */

const WORKSPACES_KEY = 'keydist:workspaces';

interface StoredWorkspace {
  id: string;
  name: string;
  panes: { id: string; analyzerId: string; options?: unknown; binding: { mode: string; group?: string } }[];
}

async function storedWorkspaces(page: Page): Promise<StoredWorkspace[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return raw === null ? [] : (JSON.parse(raw) as { workspaces: StoredWorkspace[] }).workspaces;
}

/** 既存のWorkspace（Bigram Flowのペインを1つ持つ）を保存先へ直接書く。 */
function seedWorkspace(page: Page, id = 'w1', name = '比較用'): Promise<void> {
  return page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
  }, {
    key: WORKSPACES_KEY,
    value: {
      id,
      name,
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [{ id: 'existing', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } } }],
      layout: { kind: 'group', paneIds: ['existing'], weight: 1 },
    },
  });
}

async function openStandalone(page: Page, path = '/standalone/n-sensitivity'): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
  await expect(addButton(page)).toBeEnabled({ timeout: 15_000 });
}

function addButton(page: Page) {
  return page.getByRole('button', { name: 'Workspaceに追加' });
}

test('既存のWorkspaceへ追加すると、個別画面に留まって知らせが出て、「開く」で追加先にペインが出る', async ({ page }) => {
  await seedWorkspace(page);
  await openStandalone(page);
  // 見出し（h1）の右端、解析設定のボタンの右にある
  const header = page.locator('.pane-frame-header');
  const settings = await header.getByRole('button', { name: '解析設定' }).boundingBox();
  const add = await addButton(page).boundingBox();
  expect(add!.x).toBeGreaterThan(settings!.x + settings!.width - 1);

  await addButton(page).click();
  await expect(page.getByRole('menuitem')).toHaveText(['比較用', '新しいWorkspaceに追加']);
  await page.getByRole('menuitem', { name: '比較用' }).click();

  const notice = page.locator('[data-added-to-workspace-notice]');
  await expect(notice).toContainText('「比較用」に追加した');
  await expect(page).toHaveURL(/\/standalone\/n-sensitivity$/);
  await expect.poll(async () => (await storedWorkspaces(page))[0]?.panes.map((pane) => pane.analyzerId))
    .toEqual(['bigram-flow', 'n-sensitivity']);
  expect((await storedWorkspaces(page))[0]!.panes[1]!.binding.mode).toBe('follow');

  await notice.getByRole('link', { name: '開く' }).click();
  await expect(page).toHaveURL(/\/workspace\/w1$/);
  await expect(page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: 'N感度', exact: true }) })).toBeVisible({ timeout: 15_000 });
  // Workspaceの中のペインには置かない
  await expect(addButton(page)).toHaveCount(0);
});

test('新しいWorkspaceに追加すると、Workspaceが1つ増えてそのペインが入る', async ({ page }) => {
  await openStandalone(page, '/standalone/bigram-flow');
  await addButton(page).click();
  await expect(page.getByRole('menuitem')).toHaveText(['新しいWorkspaceに追加']);
  await page.getByRole('menuitem', { name: '新しいWorkspaceに追加' }).click();

  const notice = page.locator('[data-added-to-workspace-notice]');
  await expect(notice).toContainText('に追加した');
  await expect(page).toHaveURL(/\/standalone\/bigram-flow$/);
  await expect.poll(async () => (await storedWorkspaces(page)).map((workspace) => workspace.panes.map((pane) => pane.analyzerId)))
    .toEqual([['bigram-flow']]);

  await notice.getByRole('link', { name: '開く' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/);
  await expect(page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true }) })).toBeVisible({ timeout: 15_000 });
});

test('キーボードだけで開いて選べ、Escapeで何も追加せずに閉じてボタンへ戻る', async ({ page }) => {
  await seedWorkspace(page);
  await openStandalone(page, '/standalone/comparison');
  const button = addButton(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Workspaceに追加' })).toBeVisible();
  // 開くと先頭の項目にフォーカスが移る
  await expect(page.getByRole('menuitem', { name: '比較用' })).toBeFocused();

  // 反証: Escapeで閉じても、書き込みは起きない（メニューを開いただけでは追加されない）
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();
  expect((await storedWorkspaces(page)).map((workspace) => workspace.panes.length)).toEqual([1]);
  await expect(page.locator('[data-added-to-workspace-notice]')).toHaveCount(0);

  // もう一度開き、Tabで項目を移ってEnterで選ぶ
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menuitem', { name: '新しいWorkspaceに追加' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-added-to-workspace-notice]')).toContainText('「比較用」に追加した');
  await expect.poll(async () => (await storedWorkspaces(page))[0]?.panes.map((pane) => pane.analyzerId))
    .toEqual(['bigram-flow', 'comparison']);
  expect(await storedWorkspaces(page)).toHaveLength(1);
});

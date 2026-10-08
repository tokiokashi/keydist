import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 個別画面の見出しの右端の「Workspaceに追加」。押すと送り先のメニューが開き、既存のWorkspaceか
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
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
  }, {
    key: WORKSPACES_KEY,
    value: {
      id,
      name,
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [{ id: 'existing', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } } }],
      grid: [{ id: 'existing', x: 0, y: 0, w: 12, h: 15 }],
    },
  });
}

/** 保存先へ、Workspaceを2つ（どちらもBigram Flowのペインを1つ持つ）直接書く。 */
function seedTwoWorkspaces(page: Page): Promise<void> {
  const make = (id: string, name: string) => ({
    id,
    name,
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: [{ id: `${id}-pane`, analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } } }],
    grid: [{ id: `${id}-pane`, x: 0, y: 0, w: 12, h: 15 }],
  });
  return page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: value }));
  }, { key: WORKSPACES_KEY, value: [make('w1', '一つ目'), make('w2', '二つ目')] });
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

test('削除の知らせと追加の知らせが同時に出ても重ならず、両方の操作ボタンが押せる', async ({ page }) => {
  await seedTwoWorkspaces(page);
  await page.goto('/workspace/w1');
  await waitForHydration(page);
  await page.locator('.context-bar').getByRole('button', { name: 'Workspaceの操作' }).click();
  await page.getByRole('menuitem', { name: '削除', exact: true }).click();
  const deleted = page.locator('[data-deleted-workspace-notice]');
  await expect(deleted).toContainText('を削除した');

  // 画面内の移動（読み込み直さない）で個別画面へ移り、そこで追加する
  await page.locator('#app-sidebar').getByRole('link', { name: 'N感度', exact: true }).click();
  await expect(addButton(page)).toBeEnabled({ timeout: 15_000 });
  await addButton(page).click();
  await page.getByRole('menuitem', { name: '二つ目' }).click();
  const added = page.locator('[data-added-to-workspace-notice]');
  await expect(added).toContainText('「二つ目」に追加した');
  await expect(deleted).toBeVisible();

  const a = (await deleted.boundingBox())!;
  const b = (await added.boundingBox())!;
  expect(a.y + a.height <= b.y || b.y + b.height <= a.y, '2つの知らせが縦に重ならない').toBe(true);
  // 実際に押せること（他の知らせに覆われていると、試し押しが失敗する）
  await deleted.getByRole('button', { name: '元に戻す' }).click({ trial: true });
  await added.getByRole('link', { name: '開く' }).click({ trial: true });

  await deleted.getByRole('button', { name: '元に戻す' }).click();
  await expect(page).toHaveURL(/\/workspace\/w1$/);
  expect((await storedWorkspaces(page)).map((workspace) => workspace.id)).toEqual(['w1', 'w2']);
});

test('追加を元に戻すと知らせが消え、やり直すと戻る（「開く」が無いWorkspaceへ移らない）', async ({ page }) => {
  await openStandalone(page, '/standalone/bigram-flow');
  await addButton(page).click();
  await page.getByRole('menuitem', { name: '新しいWorkspaceに追加' }).click();
  const notice = page.locator('[data-added-to-workspace-notice]');
  await expect(notice).toContainText('に追加した');
  expect(await storedWorkspaces(page)).toHaveLength(1);

  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(notice).toHaveCount(0);
  expect(await storedWorkspaces(page)).toHaveLength(0);

  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(notice).toContainText('に追加した');
  expect(await storedWorkspaces(page)).toHaveLength(1);
  await notice.getByRole('link', { name: '開く' }).click();
  await expect(page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true }) })).toBeVisible({ timeout: 15_000 });
});

test('解析設定の書き込みが間引き待ちの間に追加しても、元に戻す1回で追加が戻る', async ({ page }) => {
  // 間引き（400ms）のタイマーを止めて、待ち中の変更を作る
  await page.clock.install();
  await openStandalone(page, '/standalone/bigram-flow');
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);

  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  // まだ書かれていない（待ち中）
  expect(await page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')) ?? '').not.toContain('bigram-flow');

  await addButton(page).click();
  await page.getByRole('menuitem', { name: '新しいWorkspaceに追加' }).click();
  await expect(page.locator('[data-added-to-workspace-notice]')).toContainText('に追加した');
  // 追加の前に、待っていた解析設定が書かれている
  expect(await page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')) ?? '').toContain('bigram-flow');

  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  expect(await storedWorkspaces(page)).toHaveLength(0);
});

/** 共有の設定（Bigram Flowは Within-hand、指ごとの距離は何も変えていない）を持つWorkspaceを保存先へ直接書く。 */
function seedWorkspaceWithSharedOptions(page: Page): Promise<void> {
  const fixedQwerty = { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } };
  return page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
  }, {
    key: WORKSPACES_KEY,
    value: {
      id: 'w1',
      name: '共有あり',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      optionSets: [
        { id: 'bigram-flow-1', analyzerId: 'bigram-flow', options: { source: 'within-hand' } },
        { id: 'finger-distance-1', analyzerId: 'finger-distance' },
      ],
      panes: [
        { id: 'flow', analyzerId: 'bigram-flow', optionsBinding: { mode: 'shared', set: 'bigram-flow-1' }, binding: fixedQwerty },
        { id: 'finger', analyzerId: 'finger-distance', optionsBinding: { mode: 'shared', set: 'finger-distance-1' }, binding: fixedQwerty },
      ],
      grid: [{ id: 'flow', x: 0, y: 0, w: 12, h: 15 }, { id: 'finger', x: 12, y: 0, w: 12, h: 15 }],
    },
  });
}

async function addedPane(page: Page): Promise<{ optionsBinding?: { mode: string; set?: string }; options?: unknown }> {
  await page.locator('[data-added-to-workspace-notice]').waitFor();
  const panes = (await storedWorkspaces(page))[0]!.panes as unknown as { id: string; optionsBinding?: { mode: string; set?: string }; options?: unknown }[];
  return panes[2]!;
}

test('共有の設定がある追加先へ、何も変えていない指ごとの距離を追加すると、共有に従う（保存した形と全項目の下書きは同じ設定として比べる）', async ({ page }) => {
  await seedWorkspaceWithSharedOptions(page);
  await openStandalone(page, '/standalone/finger-distance');
  await addButton(page).click();
  await page.getByRole('menuitem', { name: '共有あり' }).click();
  const pane = await addedPane(page);
  expect(pane.optionsBinding).toEqual({ mode: 'shared', set: 'finger-distance-1' });
  expect(pane.options).toBeUndefined();
});

test('共有の設定と同じWithin-handを選んだBigram Flowを追加すると共有に従い、違う設定なら共有を書き換えずこのペインだけの設定になる', async ({ page }) => {
  await seedWorkspaceWithSharedOptions(page);
  await openStandalone(page, '/standalone/bigram-flow');
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' }).click();
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();
  await addButton(page).click();
  await page.getByRole('menuitem', { name: '共有あり' }).click();
  const same = await addedPane(page);
  expect(same.optionsBinding).toEqual({ mode: 'shared', set: 'bigram-flow-1' });
  expect(same.options).toBeUndefined();

  // 既定の設定（Actual）に戻して追加すると、共有（Within-hand）とは違うのでこのペインだけの設定
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Actual' }).click();
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();
  await addButton(page).click();
  await page.getByRole('menuitem', { name: '共有あり' }).click();
  await expect.poll(async () => (await storedWorkspaces(page))[0]!.panes.length).toBe(4);
  const stored = (await storedWorkspaces(page))[0]! as unknown as { panes: { optionsBinding?: { mode: string } }[]; optionSets: { options?: unknown }[] };
  expect(stored.panes[3]!.optionsBinding).toEqual({ mode: 'own' });
  expect(stored.optionSets[0]!.options).toEqual({ source: 'within-hand' });
});

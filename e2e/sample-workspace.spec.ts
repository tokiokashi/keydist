import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 中身入りのサンプルのWorkspace。トップの「サンプルのWorkspaceを作る」は、比較表・N感度・Bigram Flowを並べた
 * Workspaceを新しく作って開く。空のWorkspaceの中の「サンプルの並びで始める」は、新しく作らず今のWorkspaceに同じ並びを入れる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const GLOBAL_KEYS = ['keydist:setup-library', 'keydist:single-target-selection', 'keydist:multi-target-selection'];

interface StoredWorkspace {
  readonly id: string;
  readonly name: string;
  readonly groups: readonly { id: string; target: { single?: { layoutId?: string }; set?: { targets: { layoutId: string }[] } } }[];
  readonly panes: readonly { id: string; analyzerId: string; options?: unknown; binding: { mode: string; group?: string } }[];
  readonly grid: readonly { id: string; x: number; y: number; w: number; h: number }[];
  readonly conditions?: Record<string, unknown>;
}

async function storedWorkspaces(page: Page): Promise<StoredWorkspace[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return (JSON.parse(raw ?? '{"workspaces":[]}') as { workspaces: StoredWorkspace[] }).workspaces;
}

async function globalSnapshot(page: Page): Promise<(string | null)[]> {
  return page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), GLOBAL_KEYS);
}

/** 作ったサンプルが、決めた並び・対象・連動・解析設定・Workspaceの条件になっていることを確かめる。 */
async function expectSampleWorkspace(page: Page, name: string): Promise<void> {
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expectSampleLayout(page, new URL(page.url()).pathname.split('/').pop()!);
}

/** 保存したWorkspaceが、サンプルの並び・対象・連動・解析設定・Workspaceの条件になっていることを確かめる。 */
async function expectSampleLayout(page: Page, id: string): Promise<void> {
  const workspace = (await storedWorkspaces(page)).find((candidate) => candidate.id === id)!;

  // 並び: 上の段は比較表とN感度、下の段はBigram Flow 4つ
  expect(workspace.panes.map((pane) => pane.analyzerId)).toEqual([
    'comparison', 'n-sensitivity', 'bigram-flow', 'bigram-flow', 'bigram-flow', 'bigram-flow',
  ]);
  // 連動: 比較表・N感度・1つ目のBigram Flowが連動1、残りが連動2〜4
  expect(workspace.panes.map((pane) => pane.binding)).toEqual([
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
  ]);
  // 対象
  expect(workspace.groups[0]!.target.set!.targets.map((target) => target.layoutId)).toEqual([
    'qwerty', 'dvorak', 'oonishi', 'naginata-v18', 'shin-jis-prefix', 'shingeta', 'tsuki-2-263',
  ]);
  expect(workspace.groups.map((group) => group.target.single?.layoutId)).toEqual(['qwerty', 'oonishi', 'tsuki-2-263', 'naginata-v18']);
  // 解析設定: Bigram Flowは2打鍵の取り方を Within-hand
  for (const pane of workspace.panes.filter((candidate) => candidate.analyzerId === 'bigram-flow')) {
    expect(pane.options).toEqual({ source: 'within-hand' });
  }
  // Workspaceの条件
  expect(workspace.conditions).toEqual({ defaultShapeId: 'split-ortholinear' });
  // 格子: 上の段は比較表とN感度が横に並んで24列を使い切り、下の段は同じ幅の4つが横に並ぶ
  const [comparison, nSensitivity, ...lower] = workspace.grid;
  expect([comparison!.x, comparison!.y]).toEqual([0, 0]);
  expect([nSensitivity!.x, nSensitivity!.y]).toEqual([comparison!.w, 0]);
  expect(comparison!.w + nSensitivity!.w).toBe(24);
  expect(nSensitivity!.h).toBe(comparison!.h);
  expect(lower.map((item) => [item.x, item.y, item.w])).toEqual([0, 6, 12, 18].map((x) => [x, comparison!.h, 6]));

  // 画面にも出る
  await expect(page.locator('.pane-frame')).toHaveCount(6);
  await expect(page.locator('.pane-frame').first().getByRole('heading', { level: 2, name: '比較表', exact: true })).toBeVisible();
}

test('トップの「サンプルのWorkspaceを作る」で、サンプルのWorkspaceができて開く。全体の条件は変わらない', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const before = await globalSnapshot(page);
  expect(await storedWorkspaces(page)).toHaveLength(0);

  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  expect(await globalSnapshot(page)).toEqual(before);
  // 普通のWorkspaceと同じく、サイドバーの一覧に出て、再読み込みしても残る
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('#app-sidebar').getByRole('link', { name: 'サンプル', exact: true })).toBeVisible();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

test('空のWorkspaceの「サンプルの並びで始める」で、今のWorkspaceにサンプルの並びが入る。一覧は増えず、元に戻すで空に戻る', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const url = page.url();
  const emptyId = new URL(url).pathname.split('/').pop()!;
  const before = await globalSnapshot(page);

  await page.locator('[data-workspace-empty="true"]').getByRole('button', { name: 'サンプルの並びで始める' }).click();
  // 同じ画面のまま、名前も変わらずに並びが入る
  await expect(page.locator('.pane-frame')).toHaveCount(6);
  expect(page.url()).toBe(url);
  await expectSampleLayout(page, emptyId);
  expect(await globalSnapshot(page)).toEqual(before);
  expect((await storedWorkspaces(page)).map((workspace) => workspace.name)).toEqual(['新しいWorkspace']);
  await expect(page.locator('#app-sidebar').getByRole('link', { name: /Workspace/ })).toHaveCount(1);

  // 元に戻す1回で空に戻る。やり直すで並びが戻る
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const emptied = (await storedWorkspaces(page))[0]!;
  expect(emptied.panes).toHaveLength(0);
  expect(emptied.conditions).toBeUndefined();
  expect(await globalSnapshot(page)).toEqual(before);
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

test('トップから2回作ると、名前は既存のWorkspaceと同じく連番になる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル 2');
});

test('サンプルのWorkspaceは普通のWorkspaceと同じに扱える。Bigram Flowの解析設定は Within-hand、ペインを閉じて元に戻せる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  const bigramFlow = page.locator('.pane-frame').nth(2);
  await bigramFlow.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  // 作った直後の画面の履歴は空（画面を移ると履歴は引き継がない）。以降の変更は元に戻せる
  const bar = page.locator('.context-bar');
  await expect(bar.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await bigramFlow.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(5);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

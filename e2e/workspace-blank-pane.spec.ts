import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/** 余白のペイン（何も表示せず、並びの空きを埋めるだけ）。足す・保存して再読み込みで残る・拡大・閉じる。 */

const WORKSPACES_KEY = 'keydist:workspaces';

async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1 })).toBeVisible();
}

async function addPane(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
}

async function storedPanes(page: Page): Promise<{ analyzerId: string; binding: { mode: string } }[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return JSON.parse(raw ?? '{"workspaces":[{"panes":[]}]}').workspaces[0].panes;
}

test('余白を足すと、名前と×のタブだけが出て本文は空。保存して再読み込みしても残り、拡大・閉じるが他のペインと同じに動く', async ({ page }) => {
  await createWorkspace(page);
  // 最初のペインは空の状態の案内から足す
  await page.locator('[data-workspace-empty]').getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await addPane(page, '余白');

  const tab = page.locator('.dv-default-tab').filter({ hasText: '余白' });
  await expect(tab).toBeVisible();
  const blank = page.locator('[data-blank-pane="true"]');
  await expect(blank).toHaveCount(1);
  // 本文は何も出さない（見出しの行にある⋯のボタンだけ）
  await expect(blank.getByRole('button')).toHaveCount(1);
  await expect(blank.locator('p, table, img, canvas')).toHaveCount(0);

  await expect.poll(async () => (await storedPanes(page)).map((p) => [p.analyzerId, p.binding.mode]))
    .toEqual([['bigram-flow', 'follow'], ['blank', 'none']]);

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-default-tab').filter({ hasText: '余白' })).toBeVisible();
  await expect(page.locator('[data-blank-pane="true"]')).toHaveCount(1);

  // 拡大表示は⋯から。もう一度押すと戻る
  await page.locator('[data-blank-pane="true"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /拡大表示/ }).click();
  await expect(page.locator('.workspace-dock-area[data-maximized]')).toBeVisible();
  await page.locator('[data-blank-pane="true"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /元の大きさに戻す/ }).click();
  await expect(page.locator('.workspace-dock-area[data-maximized]')).toHaveCount(0);

  // タブの×で閉じる。Bigram Flowは残る
  await page.locator('.dv-default-tab').filter({ hasText: '余白' }).getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('[data-blank-pane="true"]')).toHaveCount(0);
  await expect.poll(async () => (await storedPanes(page)).map((p) => p.analyzerId)).toEqual(['bigram-flow']);
});

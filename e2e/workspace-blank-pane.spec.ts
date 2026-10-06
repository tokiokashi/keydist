import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/** 余白のペイン（何も表示せず、並びの空きを埋めるだけ）。足す・保存して再読み込みで残る・複製・閉じる。 */

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

test('余白を足すと、名前と⋯だけが出て本文は空。保存して再読み込みしても残り、複製・閉じるが他のペインと同じに動く', async ({ page }) => {
  await createWorkspace(page);
  // 最初のペインは空の状態の案内から足す
  await page.locator('[data-workspace-empty]').getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await addPane(page, '余白');

  const blank = page.locator('[data-blank-pane="true"]');
  await expect(blank).toHaveCount(1);
  // 見出しの先頭に名前とつかみ所が出る
  await expect(page.locator('.workspace-pane').filter({ has: blank }).locator('.workspace-drag-handle')).toContainText('余白');
  // 本文は何も出さない（見出しの行にある⋯のボタンだけ）
  await expect(blank.getByRole('button', { name: /の操作$/ })).toHaveCount(1);
  await expect(blank.locator('p, table, img, canvas')).toHaveCount(0);

  await expect.poll(async () => (await storedPanes(page)).map((p) => [p.analyzerId, p.binding.mode]))
    .toEqual([['bigram-flow', 'follow'], ['blank', 'none']]);

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('[data-blank-pane="true"]')).toHaveCount(1);

  // 複製は元と同じ大きさ。⋯のメニューに拡大表示は無い
  await page.locator('[data-blank-pane="true"]').getByRole('button', { name: /の操作$/ }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/複製/, /閉じる/]);
  await page.getByRole('menuitem', { name: /複製/ }).click();
  await expect(page.locator('[data-blank-pane="true"]')).toHaveCount(2);
  const sizes = await page.locator('.workspace-pane').filter({ has: page.locator('[data-blank-pane="true"]') }).evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  }));
  expect(sizes[0]).toEqual(sizes[1]);

  // ⋯で閉じる。Bigram Flowは残る
  await page.locator('[data-blank-pane="true"]').nth(1).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await page.locator('[data-blank-pane="true"]').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('[data-blank-pane="true"]')).toHaveCount(0);
  await expect.poll(async () => (await storedPanes(page)).map((p) => p.analyzerId)).toEqual(['bigram-flow']);
});

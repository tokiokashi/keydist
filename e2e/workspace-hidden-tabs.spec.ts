import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 同じグループのタブにしたペインは、隠れている間も組み立てたまま残る。
 * 戻した時に作り直さないので、図の状態・計算の購読・開いている解析設定の小窓が保たれる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';

async function createTabbedWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let n = 0; n < 2; n += 1) {
    await page.getByRole('button', { name: /Analyzerを追加/ }).click();
    await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  }
  await expect(page.locator('.pane-frame').nth(1).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  // 2つのペインを1つのグループのタブにして、読み込み直す
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key)!);
    const workspace = stored.workspaces[0];
    workspace.layout = { kind: 'group', paneIds: workspace.panes.map((pane: { id: string }) => pane.id), weight: 1 };
    localStorage.setItem(key, JSON.stringify(stored));
  }, WORKSPACES_KEY);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-default-tab')).toHaveCount(2);
}

test('タブで隠れたペインは作り直されず、戻すと同じ要素と開いた小窓がそのまま残る', async ({ page }) => {
  await createTabbedWorkspace(page);
  const frames = page.locator('.pane-frame');
  const front = frames.first();
  await expect(front.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  // 前面のペインの解析設定を開き、要素に目印を付ける（作り直されたら目印ごと消える）
  await front.getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(front.getByRole('button', { name: '解析設定', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await front.evaluate((element) => { (element as HTMLElement & { __probe?: string }).__probe = 'kept'; });

  // 別のタブへ切り替える。隠れたペインはDOMに残り、両方のペインが組み立て済みになる
  await page.locator('.dv-default-tab').nth(1).click();
  await expect(front).toBeHidden();
  await expect(frames).toHaveCount(2);
  await expect(frames.nth(1).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  // 戻す。同じ要素で、解析設定の小窓も開いたまま
  await page.locator('.dv-default-tab').nth(0).click();
  await expect(front).toBeVisible();
  expect(await front.evaluate((element) => (element as HTMLElement & { __probe?: string }).__probe)).toBe('kept');
  await expect(front.getByRole('button', { name: '解析設定', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

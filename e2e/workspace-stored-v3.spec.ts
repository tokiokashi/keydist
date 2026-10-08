import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 解析設定の共有を持つ前の版のアプリが保存したWorkspaceを開いても、ペインが落ちない。
 * 中身は、その版のアプリがサンプルのWorkspaceと、手で足したペイン（比較表・N感度・Bigram Flow・指ごとの距離・余白）を保存した値そのまま。
 */

const stored = readFileSync(new URL('../test/fixtures/workspace-library-v3.json', import.meta.url), 'utf8');
const library = JSON.parse(stored) as { workspaces: { id: string; name: string; panes: { analyzerId: string }[] }[] };

for (const workspace of library.workspaces) {
  test(`前の版で保存したWorkspace「${workspace.name}」は、ペインが落ちずに開く`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.addInitScript((raw) => {
      if (localStorage.getItem('keydist:workspaces') === null) localStorage.setItem('keydist:workspaces', raw);
    }, stored);
    await page.goto(`/workspace/${workspace.id}`);
    await waitForHydration(page);

    // 余白のペインは枠を持たない
    const framed = workspace.panes.filter((pane) => pane.analyzerId !== 'blank').length;
    await expect(page.locator('.pane-frame')).toHaveCount(framed, { timeout: 10_000 });
    await expect(page.locator('[data-pane-crashed]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-pane-notice]')).toHaveCount(0);
    // どのペインも、解析設定はそのペインだけのものとして開く
    await page.locator('.pane-frame').first().getByRole('button', { name: /解析設定/ }).click();
    await expect(page.locator('[data-options-binding="own"]')).toBeVisible();
  });
}

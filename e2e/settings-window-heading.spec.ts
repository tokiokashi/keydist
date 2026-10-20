import { expect, test } from './fixtures.ts';
import { openFigureSettings } from './bigram-flow-figure-helper.ts';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings } from './pane-helper.ts';

/**
 * 解析設定と図の表示の小窓は、見出しの語をh2にし、その中のグループの見出しをh3にする。
 * 見出しの階層は画面の並びを読む道具（読み上げ・見出しの一覧）に効くので、DOMの見出しの段で確かめる。
 * 読み上げ名（dialogの名前）は変えていないことも同じテストで確かめる。
 */

test('解析設定の小窓は、見出しの語をh2にし、グループの見出しをその下のh3にする', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const win = await openSettings(page);
  await expect(page.getByRole('dialog', { name: '解析設定', exact: true })).toBeVisible();
  await expect(win.getByRole('heading', { name: '解析設定', level: 2, exact: true })).toBeVisible();
  await expect(win.getByRole('heading', { level: 3 }).first()).toBeVisible();
  // グループの見出しは、見出しの語の下（h3）にだけ並ぶ。h2の下にh4以下を直接置かない
  await expect(win.getByRole('heading', { level: 4 })).toHaveCount(0);
});

test('図の表示の小窓は、見出しの語をh2にする', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const panel = await openFigureSettings(page, 'Keyboard Flow');
  await expect(panel.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(panel.getByRole('heading', { level: 4 })).toHaveCount(0);
});

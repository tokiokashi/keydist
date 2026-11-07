import { expect, PAGE_TAG, test, type Locator, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { SHORT_TEXT_REF } from './short-text-helper.ts';

/**
 * Workspace（Analyzerを並べる器。docs/architecture.md「画面の構成」）のE2E。
 * 保存したWorkspaceを`/workspace/<id>`で開き、個別画面と同じAnalyzerのcomponentをペインとして並べる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';

/** Analyzerを追加（見出しの「ペインを追加」から選ぶ）。 */
async function addAnalyzer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
}

/** Workspaceの中のペイン（Analyzer名のh2で引く）。 */
function pane(page: Page, name: string): Locator {
  return page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });
}

/** 保存したWorkspaceのペインのAnalyzer（decodeせず生のJSON）。 */
async function storedAnalyzerIds(page: Page): Promise<string[] | undefined> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  const stored = JSON.parse(raw ?? '{"workspaces":[]}') as { workspaces: { panes: { analyzerId: string }[] }[] };
  return stored.workspaces[0]?.panes.map((p) => p.analyzerId);
}

test('ペインを追加して並べる。個別画面と同じcomponentが載る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
    },
    { key: WORKSPACES_KEY, value: { id: 'w1', name: '新しいWorkspace', text: { ref: SHORT_TEXT_REF }, panes: [], grid: [], groups: [] } },
  );
  await page.goto('/workspace/w1');
  await waitForHydration(page);
  await expect(page.locator('[data-workspace-empty]')).toContainText('ペインを追加');
  await page
    .locator('[data-workspace-empty]')
    .getByRole('button', { name: /ペインを追加/ })
    .click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await addAnalyzer(page, '比較表');
  await addAnalyzer(page, 'N感度');

  for (const name of ['Bigram Flow', '比較表', 'N感度']) {
    await expect(pane(page, name)).toBeVisible();
  }
  // 個別画面と同じAnalyzerのcomponent（本体の目印が同じ）が載る
  await expect(pane(page, 'Bigram Flow').locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  // ペインはh2（ページのh1は文脈バーのWorkspace名だけ）
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect.poll(() => storedAnalyzerIds(page)).toEqual(['bigram-flow', 'comparison', 'n-sensitivity']);
});

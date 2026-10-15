import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 元に戻す・やり直すの履歴が画面ごとにタブへ残ることのE2E。照らし合わせ・1件だけ戻す処理・キーの判定は
 * unit testが持つので、ここでは画面をまたぐ流れと、キー操作の配線を見る。
 * 画面の移動はサイドバーのリンクで行う（読み込み直すと履歴が消えるため）。
 */

const RULES_KEY = 'keydist:user-romaji-rules';

const storedRules = (page: Page) => page.evaluate((key) => localStorage.getItem(key) ?? '', RULES_KEY);

/** ローマ字の綴りの画面で規則を1つ作る（履歴に1項目積まれる）。 */
async function createRule(page: Page): Promise<void> {
  await page.goto('/romaji-rule');
  await waitForHydration(page);
  await page.locator('[data-romaji-rule-create]').click();
  await expect.poll(() => storedRules(page)).toContain('新しいローマ字の綴り');
}

async function openFromSidebar(page: Page, name: string): Promise<void> {
  await page.locator('#app-sidebar').getByRole('link', { name, exact: true }).click();
}

test('画面を離れても履歴は残り、戻ってきて元に戻す・やり直すができる', async ({ page }) => {
  await createRule(page);

  await openFromSidebar(page, '指の割り当て');
  await expect(page).toHaveURL(/\/finger-assignment$/);
  // 別の画面の履歴は、この画面の元に戻すには入らない
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await openFromSidebar(page, 'ローマ字の綴り');
  await expect(page).toHaveURL(/\/romaji-rule$/);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeEnabled();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(() => storedRules(page)).not.toContain('新しいローマ字の綴り');

  await openFromSidebar(page, '指の割り当て');
  await openFromSidebar(page, 'ローマ字の綴り');
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(() => storedRules(page)).toContain('新しいローマ字の綴り');
});

test('別の画面で同じ資産が書き換わっていたら戻さず、知らせが出て、その項目は履歴から消える', async ({ page }) => {
  await createRule(page);

  // 別の画面（データの管理）で、作った規則を削除する
  await openFromSidebar(page, 'データの管理');
  await expect(page).toHaveURL(/\/assets$/);
  await page.locator('[data-user-assets-section="romaji-rule"]').getByRole('button', { name: /を削除$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect.poll(() => storedRules(page)).not.toContain('新しいローマ字の綴り');

  await openFromSidebar(page, 'ローマ字の綴り');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[data-history-conflict-notice]')).toContainText('元に戻せませんでした');
  // 値は変わらず、その項目は履歴から捨てられる
  expect(await storedRules(page)).not.toContain('新しいローマ字の綴り');
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await page.locator('[data-history-conflict-notice]').getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('[data-history-conflict-notice]')).toHaveCount(0);
});

test('キー操作: Ctrl+Zで元に戻し、Ctrl+Shift+ZとCtrl+Yでやり直す', async ({ page }) => {
  await createRule(page);

  await page.keyboard.press('Control+z');
  await expect.poll(() => storedRules(page)).not.toContain('新しいローマ字の綴り');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => storedRules(page)).toContain('新しいローマ字の綴り');
  await page.keyboard.press('Control+z');
  await expect.poll(() => storedRules(page)).not.toContain('新しいローマ字の綴り');
  await page.keyboard.press('Control+y');
  await expect.poll(() => storedRules(page)).toContain('新しいローマ字の綴り');
});

test('キー操作: 文字を入力する欄では資産の履歴を動かさず、選択欄では動かす', async ({ page }) => {
  await createRule(page);
  const name = page.getByLabel('名前', { exact: true });
  await name.focus();
  await page.keyboard.press('Control+z');
  // 欄の中の元に戻すが優先され、作った規則はそのまま
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeEnabled();
  expect(await storedRules(page)).toContain('新しいローマ字の綴り');

  // 選択欄にフォーカスがある時は、資産の履歴を動かす
  const base = page.getByLabel('基底のルール');
  await base.selectOption('oonishi');
  await expect.poll(() => storedRules(page)).toContain('oonishi');
  await base.focus();
  await page.keyboard.press('Control+z');
  await expect.poll(() => storedRules(page)).not.toContain('oonishi');
  expect(await storedRules(page)).toContain('新しいローマ字の綴り');
});

test('Workspace: サイドバーで別のWorkspaceを作って戻っても、中身の変更をキー操作で戻せる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  await sidebar.getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const firstId = new URL(page.url()).pathname.split('/').pop()!;
  await page.locator('[data-workspace-empty="true"]').getByRole('button', { name: 'サンプルの並びで始める' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(10);

  // 履歴を持たないサイドバーからの書き込み（別のWorkspaceの作成）の後でも、最初のWorkspaceの変更を戻せる
  await sidebar.getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).not.toHaveURL(new RegExp(`/workspace/${firstId}$`));
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  await sidebar.locator(`a[href$="/workspace/${firstId}"]`).click();
  await expect(page.locator('.pane-frame')).toHaveCount(10);

  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(page.locator('.pane-frame')).toHaveCount(10);
});

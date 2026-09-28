import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';

/**
 * シェル（サイドバー・文脈バー）のE2E（docs/architecture.md「画面の構成」）。
 */
const PACKAGE_VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

test('サイドバーは区分ごとのナビゲーションと、最下端の版表示・旧版・テーマ切替を持つ', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).toBeVisible();

  for (const heading of ['Analyze', 'Workspace']) {
    await expect(sidebar.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByRole('link', { name: 'Bigram Flow', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByText('保存したWorkspaceがここに並ぶ。')).toBeVisible();
  await expect(sidebar).toContainText(`v${PACKAGE_VERSION}`);
  await expect(sidebar.getByRole('link', { name: '旧版', exact: true })).toHaveAttribute('href', /classic\/$/);

  await sidebar.getByRole('link', { name: '比較表', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  await expect(page.getByRole('heading', { name: '比較表', level: 1 })).toBeVisible();

  await sidebar.getByRole('button', { name: '暗', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#app-sidebar').getByRole('button', { name: '暗', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('固定を外すとサイドバーは隠れ、ボタンで重ねて出して離れると引っ込む。固定の状態はリロード後も残る', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const sidebar = page.locator('#app-sidebar');
  const toggle = page.getByRole('button', { name: 'サイドバーを開く' });
  await expect(toggle).toBeHidden();

  await sidebar.getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  await expect(sidebar).not.toBeInViewport();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  await expect(sidebar).not.toBeInViewport();

  // 文脈バーのボタンで重ねて出す。
  await expect(page.locator('.context-bar').getByRole('button', { name: 'サイドバーを開く' })).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toBeInViewport();

  // 左端に触れると出て、離れると引っ込む。
  await page.mouse.move(2, 400);
  await expect(sidebar).toBeInViewport();
  await page.mouse.move(100, 400);
  await page.mouse.move(700, 400);
  await expect(sidebar).not.toBeInViewport();

  // 固定し直す。
  await toggle.click();
  await sidebar.getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-sidebar');
  await expect(sidebar).toBeInViewport();
  await expect(toggle).toBeHidden();
});

test('スマホ幅ではサイドバーは引き出しで、リンクを押すと閉じる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).not.toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'サイドバーを固定' })).toBeHidden();

  await page.getByRole('button', { name: 'サイドバーを開く' }).click();
  await expect(sidebar).toBeInViewport();
  await sidebar.getByRole('link', { name: 'N感度', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/n-sensitivity$/);
  await expect(sidebar).not.toBeInViewport();
});

test('文脈バー: テキストのチップは閉じた時1行で、開くと選択・編集が出る。Undo / Redoで選択を戻せる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });
  await expect(chip).toContainText('吾輩は猫である');
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveCount(0);

  const undo = bar.getByRole('button', { name: '元に戻す' });
  const redo = bar.getByRole('button', { name: 'やり直す' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');

  await undo.click();
  await expect(chip).toContainText('吾輩は猫である');
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(chip).toContainText('英文');

  // 既定の物理配列は文脈バーにある。
  await expect(bar.getByLabel('既定の物理配列')).toBeVisible();
});

test('Undoは待ち中の本文の変更を先に書いてから戻す', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const panel = await openTextChip(page);
  const textarea = panel.getByLabel('テキスト', { exact: true });
  const before = await textarea.inputValue();
  await textarea.fill('すぐに戻す編集');
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(before);
  // 戻した後に、待っていた書き込みが遅れて入ることもない。
  await page.waitForTimeout(1200);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(before);
});

test('トップとTesterもシェルに載り、旧Analyzerは載らない', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await page.goto('/input');
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await expect(page.locator('#app-sidebar').getByRole('link', { name: 'Tester', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goto('/analyzer');
  await expect(page.locator('#app-sidebar')).toHaveCount(0);
});

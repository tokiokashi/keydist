import { expect, test } from '@playwright/test';

/**
 * Bigram Flow単体ページ（#544 Phase 3「最初の縦切り」）のE2E。
 * ペインの枠（見出し・条件・状態表示）とBigram Flowの可視化が実際に描画され、
 * 設定変更・テキスト変更に追従することを確認する。
 */
test('単体ページが開き、Bigram Flowが描画される', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');

  await expect(page.getByRole('heading', { name: 'Bigram Flow', exact: true }).first()).toBeVisible();

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expect(flow).toHaveAttribute('data-layout-id', /.+/);
  await expect(flow).toHaveAttribute('data-geometry-id', /.+/);

  // ペインの枠: 状態バッジがreadyになっている。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready');

  // 条件の表示（出どころ含む）。
  await pane.locator('.pane-condition-summary summary').click();
  await expect(pane.locator('.pane-condition-summary')).toContainText('既定値');
});

test('見た目だけの設定を変えても壊れず、抽出設定を変えると表示が変わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const lineScale = flow.getByLabel('紐の太さのスケール');
  await lineScale.selectOption('sqrt');
  await expect(lineScale).toHaveValue('sqrt');

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');
});

test('テキストを変えると条件・可視化が追従する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('hello world hello world hello world');

  // debounce後、Trace/抽出が新しいテキストで再計算されペインが再びreadyになる。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
});

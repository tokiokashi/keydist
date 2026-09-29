import { expect, test } from '@playwright/test';

/**
 * 例外が起きた時のペインの表示。利用者向けの1文だけを見せ、例外の原文（不具合報告用）は
 * 折りたたんだ詳細へ入れる。
 */
const BREAK_MESSAGE = 'キー k_99 の座標が壊れている';

test('計算中の例外: 1文だけ出し、原文は折りたたんだ詳細に入る', async ({ page }) => {
  await page.addInitScript((message) => {
    const original = Math.hypot;
    Math.hypot = (...values: number[]) => {
      if ((window as unknown as { __break?: boolean }).__break) throw new Error(message);
      return original(...values);
    };
  }, BREAK_MESSAGE);
  await page.goto('/standalone/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });

  await page.evaluate(() => { (window as unknown as { __break: boolean }).__break = true; });
  // 設定を変えて抽出か描画をやり直させ、例外を踏ませる。
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');

  const alert = pane.locator('[data-pane-error], [data-pane-crashed]');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert.locator('> p')).toHaveText(/エラーが発生した|表示できなかった/);
  await expect(alert.locator('> p')).not.toContainText(/k_99/);
  const details = alert.locator('details[data-pane-error-details]');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('pre')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('pre')).toContainText(BREAK_MESSAGE);
});

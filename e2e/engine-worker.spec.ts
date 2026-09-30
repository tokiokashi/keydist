import { expect, test } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { toggleTarget } from './pane-helper.ts';

/**
 * 長いテキストの計算はWorkerで走り、計算中も画面（入力・スクロール）が止まらないことの確認。
 * 止まったかどうかは、メインスレッドのタイマーの間隔で見る。計算が1万字×5配列で数秒かかるので、
 * メインスレッドで走れば間隔は数秒になる。CIの負荷でぶれても届かないように、限度は1秒にしてある。
 */
const SENTENCE = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. ';

test('1万字の比較表の計算中も、メインスレッドは止まらない（計算はWorkerで走る）', async ({ page }) => {
  await page.addInitScript(() => {
    const monitor = { last: performance.now(), maxGap: 0 };
    (window as unknown as { __monitor: typeof monitor }).__monitor = monitor;
    setInterval(() => {
      const now = performance.now();
      monitor.maxGap = Math.max(monitor.maxGap, now - monitor.last);
      monitor.last = now;
    }, 20);
  });
  await page.goto('/standalone/comparison');
  for (const id of ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman']) {
    await toggleTarget(page, `layout:${id}`);
  }
  await page.keyboard.press('Escape');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  expect(page.workers().length).toBeGreaterThanOrEqual(1);

  const body = (await openTextChip(page)).getByLabel('テキスト', { exact: true });
  await page.evaluate(() => { (window as unknown as { __monitor: { maxGap: number } }).__monitor.maxGap = 0; });
  await body.fill(SENTENCE.repeat(120));

  // 計算が終わるまで待つ。表の1行目に、1万字ぶんの動作数（5桁の数）が出る。
  await expect(pane.locator('tbody tr').first()).toContainText(/\b\d{5}\b/, { timeout: 60_000 });
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 60_000 });
  const maxGap = await page.evaluate(() => (window as unknown as { __monitor: { maxGap: number } }).__monitor.maxGap);
  expect(maxGap).toBeLessThan(1000);
});

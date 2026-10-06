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

  // 確かめたいのは計算中に止まらないことで、計算が終わることではない。1万字×5配列の計算は
  // 手元でも十数秒、CIで4本並べると30秒の上限を超えるので、終わりは待たない。
  // 計算中（前の結果を出したままの stale）になったのを見てから数秒測り、測り終えても stale のままなら、その間ずっと計算中だったと言える。
  await expect(pane).toHaveAttribute('data-pane-status', 'stale', { timeout: 10_000 });
  // 時間の経過そのものが検査の中身（計算中の3秒間、メインスレッドのタイマーが途切れないこと）なので、実時間で待つ
  await page.waitForTimeout(3000);
  await expect(pane).toHaveAttribute('data-pane-status', 'stale');
  const maxGap = await page.evaluate(() => (window as unknown as { __monitor: { maxGap: number } }).__monitor.maxGap);
  expect(maxGap).toBeLessThan(1000);
});

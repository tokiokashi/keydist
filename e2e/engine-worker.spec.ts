import { expect, test } from './fixtures.ts';
import { openTextChip } from './context-bar-helper.ts';
import { toggleTarget } from './pane-helper.ts';

/**
 * 長いテキストの計算はWorkerで走り、計算中も画面（入力・スクロール）が止まらないことの確認。
 * 止まったかどうかは、メインスレッドのタイマーの間隔で見る。計算が5万字×5配列で数秒かかるので、
 * メインスレッドで走れば間隔は数秒になる。CIの負荷でぶれても届かないように、限度は1秒にしてある。
 * 計算の速さには依らない。計算の依頼がWorkerに届いたことを見てから、一定の時間を測る。
 */
const SENTENCE = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. ';

test('5万字の比較表の計算中も、メインスレッドは止まらない（計算はWorkerで走る）', async ({ page }) => {
  await page.addInitScript(() => {
    const monitor = { last: performance.now(), maxGap: 0, posted: 0 };
    const Original = window.Worker;
    window.Worker = class extends Original {
      override postMessage(message: unknown, ...rest: unknown[]) {
        monitor.posted += 1;
        return (super.postMessage as (...args: unknown[]) => void)(message, ...rest);
      }
    } as typeof Worker;
    (window as unknown as { __monitor: typeof monitor }).__monitor = monitor;
    setInterval(() => {
      const now = performance.now();
      monitor.maxGap = Math.max(monitor.maxGap, now - monitor.last);
      monitor.last = now;
    }, 20);
  });
  await page.goto('/analyzer/comparison');
  for (const id of ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman']) {
    await toggleTarget(page, `layout:${id}`);
  }
  await page.keyboard.press('Escape');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  expect(page.workers().length).toBeGreaterThanOrEqual(1);

  const body = (await openTextChip(page)).getByLabel('テキスト', { exact: true });
  const readMonitor = () => page.evaluate(() => (window as unknown as { __monitor: { maxGap: number; posted: number } }).__monitor);
  await page.evaluate(() => {
    const monitor = (window as unknown as { __monitor: { maxGap: number; posted: number } }).__monitor;
    monitor.maxGap = 0;
    monitor.posted = 0;
  });
  await body.fill(SENTENCE.repeat(600));

  // 確かめたいのは計算中に止まらないことで、計算が終わることではない。5万字×5配列の計算は
  // 手元でも数秒〜十数秒、CIで4本並べると30秒の上限を超えるので、終わりは待たない。
  // 計算の依頼がWorkerへ届いたら、その後の3秒間のメインスレッドのタイマーの途切れを見る。
  // 計算が3秒より早く終わった場合も、その間にメインスレッドが止まらなかったことを確かめられる
  await expect.poll(async () => (await readMonitor()).posted).toBeGreaterThan(0);
  // 時間の経過そのものが検査の中身（計算中の3秒間、メインスレッドのタイマーが途切れないこと）なので、実時間で待つ
  await page.waitForTimeout(3000);
  const maxGap = await page.evaluate(() => (window as unknown as { __monitor: { maxGap: number } }).__monitor.maxGap);
  expect(maxGap).toBeLessThan(1000);
});

import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';

/**
 * 組み込みテキストを書き換えた直後の打鍵が、複製を2つ作らず1つに書かれることの回帰テスト（#707）。
 *
 * 本文の書き込みは打鍵から400ms間引いてから行う。そのタイマーが書き込む経路はReactのイベントの外なので、
 * 描画が次のタスクまで遅れる。その間に届いた打鍵は描画前の宛先（組み込み）を持っていて、
 * 別の複製を作り、打鍵の1つが消えていた。タイマーは手で撃って、書き込みと次の打鍵の間を
 * 描画を挟まずに詰める（挟む場合も確かめる）。
 */

interface RaceWindow {
  __timers: Map<number, () => void>;
  __fire: () => number;
  __type: (s: string) => void;
}

async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as RaceWindow;
    w.__timers = new Map();
    let fake = 1e9;
    const origSet = window.setTimeout.bind(window);
    const origClear = window.clearTimeout.bind(window);
    // 本文のdebounce（400ms）だけ横取りして、テストが撃つまで待たせる。
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === 400) {
        const id = ++fake;
        w.__timers.set(id, fn);
        return id;
      }
      return origSet(fn, ms, ...args);
    };
    (window as unknown as { clearTimeout: unknown }).clearTimeout = (id: number) => {
      if (w.__timers.has(id)) {
        w.__timers.delete(id);
        return;
      }
      origClear(id);
    };
    w.__fire = () => {
      const entries = [...w.__timers.values()];
      w.__timers.clear();
      for (const fn of entries) fn();
      return entries.length;
    };
    // Reactが拾う形で1文字足す（valueのsetterを直接呼び、inputイベントを起こす）。
    w.__type = (s: string) => {
      const ta = document.querySelector('textarea[aria-label="テキスト"]') as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(ta, ta.value + s);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
  });
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
}

async function storedTextCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
  });
}

for (const yieldBetween of [false, true]) {
  test(`タイマーの書き込み直後の打鍵が複製を増やさない（描画を挟む: ${yieldBetween}）`, async ({ page }) => {
    await setup(page);
    await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
    await page.evaluate(async (yieldFirst) => {
      const w = window as unknown as RaceWindow;
      w.__fire();
      if (yieldFirst) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => requestAnimationFrame(() => resolve(null));
          channel.port2.postMessage(0);
        });
      }
      w.__type('b');
    }, yieldBetween);
    await page.evaluate(() => (window as unknown as RaceWindow).__fire());

    const body = page.getByLabel('テキスト', { exact: true });
    await expect.poll(() => storedTextCount(page)).toBe(1);
    await expect(body).toHaveValue(/ab$/);
    await page.waitForTimeout(300);
    expect(await storedTextCount(page)).toBe(1);
    await expect(body).toHaveValue(/ab$/);
  });
}

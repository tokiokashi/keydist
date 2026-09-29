import type { Page } from '@playwright/test';
import { DEFAULT_DEBOUNCE_MS } from '../src/platform/persistence/debounced-scheduler.ts';

/**
 * 本文のdebounceタイマーを、テストが撃つまで保留できるようにする道具（#707・#611）。
 * 時間で競合を作ると環境の遅さでずれるので、「Bは打鍵を保留し、その間にAが書き込む」を
 * タイマーを手で撃つことで決定的に作る。
 */

export interface RaceWindow {
  __timers: Map<number, () => void>;
  __fire: () => number;
  __type: (s: string) => void;
}

/** ページの読み込み前に呼ぶ。以後、本文のdebounceタイマーは`__fire`まで保留される。 */
export async function installTimerCapture(page: Page): Promise<void> {
  await page.addInitScript((debounceMs) => {
    const w = window as unknown as RaceWindow;
    w.__timers = new Map();
    let fake = 1e9;
    const origSet = window.setTimeout.bind(window);
    const origClear = window.clearTimeout.bind(window);
    // 本文のdebounce（`DEFAULT_DEBOUNCE_MS`）だけ横取りして、テストが撃つまで待たせる。
    // 定数が変わっても捕まえ損ねないよう、撃った件数は各テストで検査する。
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === debounceMs) {
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
  }, DEFAULT_DEBOUNCE_MS);
}

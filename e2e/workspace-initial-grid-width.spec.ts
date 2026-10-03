import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceを開いた直後の1コマ目から、格子が落ち着いた後と同じ幅で描かれる。
 * 最初の幅が実際より広いと、ライブラリの配置の動き（200ms）でペインが縮んで見える。
 * ペインの高さが画面を超えて縦のスクロールバーが出る場合も含める（出現で面の幅が変わる）。
 */

const blank = (id: string) => ({ id, analyzerId: 'blank', binding: { mode: 'none' } });

type Rect = readonly [number, number, number, number];

test('開いた直後の最初の描画と落ち着いた後で、ペインの矩形が1px以内で同じ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  const grid = [
    { id: 'a', x: 0, y: 0, w: 12, h: 12 },
    { id: 'b', x: 12, y: 0, w: 12, h: 12 },
    { id: 'c', x: 0, y: 12, w: 24, h: 12 },
  ];
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    // ペインが初めてDOMに現れた時の矩形と、その後の全ての描画コマでの矩形を記録する
    const snap = () => [...document.querySelectorAll('.workspace-grid-item')].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    });
    const w = window as unknown as { __frames: number[][][] };
    w.__frames = [];
    let started = false;
    const loop = () => {
      const s = snap();
      if (s.length > 0) w.__frames.push(s);
      requestAnimationFrame(loop);
    };
    new MutationObserver(() => {
      if (started || document.querySelectorAll('.workspace-grid-item').length === 0) return;
      started = true;
      w.__frames.push(snap());
      requestAnimationFrame(loop);
    }).observe(document, { childList: true, subtree: true });
  }, { id: 'g', name: '格子', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: grid.map((g) => blank(g.id)), grid });
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await page.waitForTimeout(1000);
  const frames = await page.evaluate(() => (window as unknown as { __frames: Rect[][] }).__frames);
  const settled = frames[frames.length - 1]!;
  frames.forEach((frame, index) => {
    frame.forEach((rect, i) => {
      rect.forEach((value, k) => {
        expect(Math.abs(value - settled[i]![k]!), `コマ${index}のペイン${i}の矩形[${k}]`).toBeLessThanOrEqual(1);
      });
    });
  });
});

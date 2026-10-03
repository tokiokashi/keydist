import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { targetButton } from './pane-helper.ts';

/**
 * 読み込みの前後で、見出しの対象ボタンが動かない（#915）。
 * プリレンダー（読み込み前）に状態のバッジ（「未計算」）を出さず、読み込み後の「計算中…」も、
 * 本文が「計算している…」を出している間は見出しに出さない。出すとバッジの幅の分だけ対象ボタンが動いて、
 * 計算が済むと戻る。
 */
const pages = [
  { name: 'Bigram Flow', path: '/standalone/bigram-flow' },
  { name: '比較表', path: '/standalone/comparison' },
  { name: 'N感度', path: '/standalone/n-sensitivity' },
] as const;

for (const width of [390, 1440]) {
  for (const { name, path } of pages) {
    test(`${name}: 読み込みから計算が済むまでの全ての描画で、対象ボタンが読み込み前の位置から動かない（${width}px）`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // スクリプトを止めて、プリレンダーされたHTMLのままの画面を見る
      await page.route('**/assets/*.js', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(path, { waitUntil: 'commit' });
      await expect(targetButton(page)).toBeVisible();
      await expect(page.locator('.pane-status-badge')).toHaveCount(0);
      const before = await targetButton(page).boundingBox();
      expect(before).not.toBeNull();

      // 読み込みを再開する前に、描画ごと（rAF）に対象ボタンの左端・上端を記録し始める
      await page.evaluate(() => {
        const samples: { x: number; y: number; status: string | null }[] = [];
        (window as unknown as { __targetSamples: typeof samples }).__targetSamples = samples;
        const tick = () => {
          const button = [...document.querySelectorAll('button')].find((b) => /^対象: /.test(b.getAttribute('aria-label') ?? ''));
          if (button) {
            const rect = button.getBoundingClientRect();
            samples.push({ x: rect.x, y: rect.y, status: document.querySelector('section.pane-frame')?.getAttribute('data-pane-status') ?? null });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      release();
      await waitForHydration(page);
      await expect(page.locator('[data-pane-status="ready"]')).toBeVisible({ timeout: 20_000 });
      // ready の後の数フレームも見る
      await page.waitForTimeout(200);
      const samples = await page.evaluate(() => (window as unknown as { __targetSamples: { x: number; y: number; status: string | null }[] }).__targetSamples);
      expect(samples.length).toBeGreaterThan(5);
      expect(samples.some((s) => s.status === 'ready')).toBe(true);
      for (const s of samples) {
        expect(Math.abs(s.x - before!.x), `x（status=${s.status}）`).toBeLessThanOrEqual(1);
        expect(Math.abs(s.y - before!.y), `y（status=${s.status}）`).toBeLessThanOrEqual(1);
      }
    });
  }
}

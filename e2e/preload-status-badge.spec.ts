import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { targetButton } from './pane-helper.ts';

/**
 * プリレンダーの見出しに状態のバッジ（「未計算」）を出さない（#915）。
 * 読み込み前は保存済みの結果が無いだけなので「未計算」は誤解を招き、読み込み後にバッジが消えると
 * 見出しの並びが動いて対象ボタンが約59px動いていた。
 */
const pages = [
  { name: 'Bigram Flow', path: '/standalone/bigram-flow' },
  { name: '比較表', path: '/standalone/comparison' },
  { name: 'N感度', path: '/standalone/n-sensitivity' },
] as const;

for (const width of [390, 1440]) {
  for (const { name, path } of pages) {
    test(`${name}: 読み込み前のプリレンダーに状態のバッジが無く、読み込みの前後で対象ボタンが動かない（${width}px）`, async ({ page }) => {
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

      release();
      await waitForHydration(page);
      // 資産の読み込みが済むと、画面の囲い（fieldset disabled）が外れる
      await expect(page.locator('fieldset:disabled')).toHaveCount(0, { timeout: 20_000 });
      const after = await targetButton(page).boundingBox();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
      // 幅は比べない。読み込み後は対象の名前が入るので、ボタン自体は名前の分だけ広がる（#709）。左端と高さが動かなければよい
      expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
    });
  }
}

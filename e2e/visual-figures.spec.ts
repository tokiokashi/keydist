import { expect, test, type Page } from '@playwright/test';
import { fixScreenshotEnvironment, waitForFixedFont } from './screenshot-helper.ts';

/**
 * 可視化の見た目の回帰検査。数値は各Analyzerのunit testとfixtureで固定しているので、
 * ここでは数値が合っていても起きる図の崩れ（重なり・欠け・色・配置のずれ）だけを、基準の画像との比較で見る。
 *
 * 基準の画像はCIの `browser-e2e` と同じ環境（runner・ブラウザ・`CI=1`・本番ビルド）で作る。
 * 手元は環境が違い、描画が1画素ずれるので、比べずに飛ばす（CIでは必ず比べる）。
 * 基準の画像を作り直す手順は `CONTRIBUTING.md` の「ブラウザe2e」。
 */
test.skip(!process.env.CI, 'スクリーンショットの比較は、基準の画像を作ったCIと同じ環境でだけ行う');

async function openAnalyzer(page: Page, path: string, feature: string, layoutId: string): Promise<void> {
  await fixScreenshotEnvironment(page);
  await page.addInitScript((id) => {
    localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
  }, layoutId);
  await page.goto(path);
  const figure = page.locator(`[data-react-feature="${feature}"]`);
  await expect(figure).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await waitForFixedFont(page);
}

test('Bigram Flowの図', async ({ page }) => {
  await openAnalyzer(page, '/analyzer/bigram-flow', 'bigram-flow', 'qwerty');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveScreenshot('bigram-flow.png', { animations: 'disabled' });
});

test('ヒートマップの図', async ({ page }) => {
  await openAnalyzer(page, '/analyzer/heatmap', 'heatmap', 'qwerty');
  await expect(page.locator('[data-react-feature="heatmap"]')).toHaveScreenshot('heatmap.png', { animations: 'disabled' });
});

import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * パソコン幅で、トップと個別画面の内容が本体の右にだけ寄った空白を残さない。
 * 本体（サイドバーを除いた領域）に対する内容の左右の余白が、ほぼ等しいことを見る。
 */
async function sideGaps(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const body = document.querySelector('.shell-body')!.getBoundingClientRect();
    const box = document.querySelector(sel)!.getBoundingClientRect();
    return { left: box.left - body.left, right: body.right - box.right, width: box.width };
  }, selector);
}

const pcWidths = [1280, 1440, 1920];

for (const width of pcWidths) {
  test(`トップの内容は ${width}px で左右の余白が偏らず、読み物の幅は抑えられる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitForHydration(page);
    const gaps = await sideGaps(page, '.hero');
    expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(2);
    // 1行が長くなりすぎない（50rem = 800px）
    expect(gaps.width).toBeLessThanOrEqual(800);
  });

  for (const route of ['bigram-flow', 'comparison', 'n-sensitivity']) {
    test(`個別画面 ${route} の内容は ${width}px で左右の余白が偏らない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/standalone/${route}`);
      await waitForHydration(page);
      const gaps = await sideGaps(page, '.standalone-stage .pane-frame');
      expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(2);
      // 余りを空白にしすぎない: 本体の幅が推奨幅（比較表は96rem、他は64rem）と余白の和以下なら幅いっぱいを使う
      const limit = (route === 'comparison' ? 1536 : 1024) + 48;
      const bodyWidth = gaps.left + gaps.width + gaps.right;
      if (bodyWidth <= limit) expect(gaps.left).toBeLessThanOrEqual(25);
    });
  }
}

import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * サイドバーを固定した中間の幅（761〜1100）でも、文脈バーは1行に収まり、
 * テキストと既定の物理配列のチップが重ならない（バー自身の幅で見た目を切り替える）。
 */
test.use({ viewport: { width: 1100, height: 900 } });

test('サイドバー固定で761〜1100の幅を20px刻みに動かしても、文脈バーが1行で重ならず横にあふれない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
  // サイドバーは固定が既定（本体の幅がその分だけ狭くなる）。
  await expect(page.locator('html')).not.toHaveAttribute('data-sidebar', 'unpinned');

  for (let width = 761; width <= 1100; width += 20) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const bar = rect('.context-bar');
      const text = rect('.context-bar button.text-chip');
      const shape = rect('.context-bar .context-select-chip');
      return {
        barHeight: bar.height,
        overlap: text.left < shape.right - 0.5 && shape.left < text.right - 0.5 && text.top < shape.bottom - 0.5 && shape.top < text.bottom - 0.5,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(layout.barHeight, `幅${width}`).toBeLessThan(60);
    expect(layout.overlap, `幅${width}`).toBe(false);
    expect(layout.overflow, `幅${width}`).toBeLessThanOrEqual(0);
  }
});

test('アイコン化した幅ではテキストのチップの文字が左寄せで、境目付近でもチップが重ならない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
  await page.setViewportSize({ width: 1100, height: 900 });
  const gap = await page.evaluate(() => {
    const value = document.querySelector('.text-chip .context-chip-value')!;
    const range = document.createRange();
    range.selectNodeContents(value);
    return range.getBoundingClientRect().left - value.getBoundingClientRect().left;
  });
  // 中央寄せなら余った幅の半分だけ右へずれる。
  expect(gap).toBeLessThan(2);

  // サイドバーを固定しない時の境目（バーの内幅856px＝画面幅896px）の前後。余裕が小さい側。
  await page.locator('#app-sidebar').getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  for (const width of [895, 897, 899]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const text = document.querySelector('.context-bar button.text-chip')!.getBoundingClientRect();
      const shape = document.querySelector('.context-bar .context-select-chip')!.getBoundingClientRect();
      const actions = document.querySelector('.context-bar-actions')!.getBoundingClientRect();
      return {
        barHeight: document.querySelector('.context-bar')!.getBoundingClientRect().height,
        overlap: text.left < shape.right - 0.5 && shape.left < text.right - 0.5,
        overActions: shape.right > actions.left + 0.5,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(layout.barHeight, `幅${width}`).toBeLessThan(60);
    expect(layout.overlap, `幅${width}`).toBe(false);
    expect(layout.overActions, `幅${width}`).toBe(false);
    expect(layout.overflow, `幅${width}`).toBeLessThanOrEqual(0);
  }
});

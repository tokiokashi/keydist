import { expect, test } from '@playwright/test';
import { targetButton } from './pane-helper.ts';

/**
 * 対象の見出しにある「全部の名前が入るか」を測る見えない全文（.target-selection-measure）が、
 * ページの横幅を広げないこと（#669）。単体ページの幅をまたいで確かめる。
 * 幅が広がると横スクロールが出る。
 */
const MULTI_TARGET_SELECTION_KEY = 'keydist:multi-target-selection';
const LAYOUT_IDS = ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi', 'nicola', 'naginata-v18'];

for (const width of [390, 761, 900, 1440]) {
  test(`比較表で8つ選んでも、幅${width}pxでページの横幅が広がらない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(
      ([key, ids]) => {
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, targets: ids.map((layoutId) => ({ kind: 'layout', layoutId })), colorSlots: {} }),
        );
      },
      [MULTI_TARGET_SELECTION_KEY, LAYOUT_IDS] as const,
    );
    await page.goto('/standalone/comparison');
    await expect(targetButton(page)).toBeVisible();
    await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(8, { timeout: 15_000 });
    const { scroll, inner } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(scroll).toBe(inner);
  });
}

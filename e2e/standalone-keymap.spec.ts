import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';

/**
 * キーマップのE2E。行数や中身はunit test（`layout-breakdown.test.ts`・`key-pattern-selection.test.ts`）で固定しているので、
 * ここでは画面の配線（キーを選んで出る文字を調べる図・修飾・コンボの表と配列図・該当が無い時の文）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem(
        'keydist:single-target-selection',
        JSON.stringify({
          version: 1,
          target: { kind: 'layout', layoutId: id },
        }),
      );
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="keymap"]');

test('キーを選んで出る文字を調べる: キーボードでキーを選ぶと出る文字が候補に出て、Escapeで選択が外れる', { tag: PAGE_TAG }, async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/analyzer/keymap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });

  const pattern = feature(page).locator('[data-keymap-pattern]');
  const result = pattern.locator('[data-keymap-pattern-result]');
  await expect(result).toContainText('選んだキーはありません');

  const shift = pattern.locator('[data-key-id="shift-l"]');
  await shift.focus();
  await page.keyboard.press('Enter');
  await expect(shift).toHaveAttribute('aria-pressed', 'true');
  await expect(result).toContainText('あと1キーで出る文字が決まります');
  await expect(pattern.locator('[data-key-id="a"] text')).toHaveText('A');

  await page.keyboard.press('Escape');
  await expect(shift).toHaveAttribute('aria-pressed', 'false');
  await expect(result).toContainText('選んだキーはありません');
});

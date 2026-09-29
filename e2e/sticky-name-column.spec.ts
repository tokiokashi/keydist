import { expect, test, type Page } from '@playwright/test';
import { toggleTarget } from './pane-helper.ts';

/**
 * 表を横にスクロールしても、行の見出し（対象名）の列が左端に残ること（#750）。
 * 幅を絞って表を横にあふれさせ、スクロール前後で対象名のセルの画面上のxが変わらないことを見る。
 */

test.use({ viewport: { width: 390, height: 800 } });

async function expectNameColumnStays(page: Page, tableSelector: string) {
  await toggleTarget(page, 'layout:qwerty');
  await toggleTarget(page, 'layout:colemak-dh');
  const table = page.locator(tableSelector);
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(2, { timeout: 10_000 });

  const scroller = table.locator('xpath=..');
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeGreaterThan(0);

  const cell = table.locator('tbody th[scope="row"]').first();
  const before = (await cell.boundingBox())!.x;
  await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const after = (await cell.boundingBox())!.x;
  expect(after).toBeCloseTo(before, 0);

  // 狭い幅でも固定した列が画面の半分を超えない（数値の列を読む幅を残す）。
  const width = (await cell.boundingBox())!.width;
  expect(width).toBeLessThan(390 / 2);

  // 固定した列の背景は透けない（数値がその下を通る）。
  const bg = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
}

for (const scheme of ['light', 'dark'] as const) {
  test(`比較表: 横スクロールしても対象名の列が左端に残る（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/standalone/comparison');
    await expectNameColumnStays(page, '.comparison-table');
  });

  test(`N感度の表: 横スクロールしても対象名の列が左端に残る（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/standalone/n-sensitivity');
    await expectNameColumnStays(page, '.n-sensitivity-table');
  });
}

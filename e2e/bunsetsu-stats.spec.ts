import { expect, test, PAGE_TAG, type Page } from './fixtures.ts';

/**
 * 文節ごとの統計のe2e。値の定義・一覧の並びはunit testで固定しているので、ここでは画面の配線
 * （配列ごとの表の並べ替えが、一覧の配列ごとの列の順を変えない）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="bunsetsu-stats"]');

test.describe('個別画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('keydist:multi-target-selection') === null) {
        localStorage.setItem(
          'keydist:multi-target-selection',
          JSON.stringify({
            version: 1,
            targets: [
              { kind: 'layout', layoutId: 'qwerty' },
              { kind: 'layout', layoutId: 'jis-kana' },
            ],
          }),
        );
      }
    });
    await page.goto('/analyzer/bunsetsu-stats');
    await expect(feature(page).locator('[data-bunsetsu-stats-layout-table]')).toBeVisible({ timeout: 30_000 });
  });

  test('配列ごとの表は見出しで並べ替えられ、一覧の配列ごとの列の順は変わらない', { tag: PAGE_TAG }, async ({ page }) => {
    const layout = feature(page).locator('[data-bunsetsu-stats-layout-table]');
    const rowTitles = async () => await layout.locator('tbody th[scope="row"]').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('title')));
    const listTitles = async () =>
      await feature(page)
        .locator('[data-bunsetsu-stats-frequent-segments] thead th[title]')
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('title')));
    const shares = async () =>
      (await layout.locator('tbody tr[data-bunsetsu-stats-row="ok"] td:nth-child(4)').allInnerTexts()).map((text) => parseFloat(text));
    const headerCell = layout.locator('thead th', { has: page.getByRole('button', { name: '文節頭の距離の割合', exact: true }) });
    const button = headerCell.getByRole('button', { name: '文節頭の距離の割合', exact: true });

    const original = await rowTitles();
    expect(original).toHaveLength(2);
    expect(await listTitles()).toEqual(original);
    await expect(headerCell).not.toHaveAttribute('aria-sort', /.+/);

    await button.click();
    await expect(headerCell).toHaveAttribute('aria-sort', 'ascending');
    const ascending = await shares();
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    const ascendingTitles = await rowTitles();
    expect(await listTitles()).toEqual(original);

    await button.click();
    await expect(headerCell).toHaveAttribute('aria-sort', 'descending');
    const descending = await shares();
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(await listTitles()).toEqual(original);
    // 2配列の値が違えば、降順の行の順は昇順の逆になる
    expect(ascending[0]).not.toBe(ascending[1]);
    expect(await rowTitles()).toEqual([...ascendingTitles].reverse());

    await button.click();
    await expect(headerCell).not.toHaveAttribute('aria-sort', /.+/);
    expect(await rowTitles()).toEqual(original);
  });
});

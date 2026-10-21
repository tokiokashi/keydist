import { expect, test, type Page } from './fixtures.ts';

/**
 * 文節ごとの統計のe2e。値の定義・一覧の並びはunit testで固定しているので、ここでは画面の配線
 * （区切りを常に使う・2配列の行と列・区切りの出どころの表示・出さない文言）だけを見る。
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

  test('テキストの表・配列ごとの表・2つの上位の一覧が出て、区切りの出どころと分割器を示す', async ({ page }) => {
    await expect(feature(page).locator('[data-bunsetsu-stats-source]')).toContainText('BudouX 0.10.0');
    await expect(feature(page).locator('[data-bunsetsu-stats-text-table]')).toBeVisible();
    await expect(feature(page).locator('[data-bunsetsu-stats-segment-count]')).not.toHaveText('—');
    await expect(feature(page).locator('[data-bunsetsu-stats-layout-table] [data-bunsetsu-stats-row="ok"]')).toHaveCount(2);
    await expect(feature(page).locator('[data-bunsetsu-stats-frequent-segments] tbody tr')).toHaveCount(20);
    await expect(feature(page).locator('[data-bunsetsu-stats-frequent-bigrams] tbody tr')).toHaveCount(20);
    // 配列ごとの列: 文節の一覧は配列の数、bigramの一覧は配列の数の2倍
    await expect(feature(page).locator('[data-bunsetsu-stats-frequent-segments] thead th')).toHaveCount(2 + 2);
    await expect(feature(page).locator('[data-bunsetsu-stats-frequent-bigrams] thead th')).toHaveCount(3 + 2 + 4);
  });

  test('打ちやすさ・順位・結論を述べる文言を出さない', async ({ page }) => {
    const text = (await feature(page).innerText()).replaceAll(/\s+/g, '');
    for (const word of ['打ちやすい', '打ちにくい', '優れ', '劣', '順位', '結論', '合成スコア', 'おすすめ']) {
      expect(text, word).not.toContain(word);
    }
  });
});

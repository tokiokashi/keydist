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

  test('実装の呼び方を出さず、列のまとまりに罫線を引き、ⓘで定義を出す', async ({ page }) => {
    // 区切りの出どころの文（Run Chartと共有）は実装の語を含むので、表と一覧だけを見る
    const tables = feature(page).locator('table');
    const text = (await tables.allInnerTexts()).join('').replaceAll(/\s+/g, '');
    for (const word of ['境目', '内側', '打鍵できなかった']) {
      expect(text, word).not.toContain(word);
    }
    await expect(feature(page).locator('[data-bunsetsu-stats-layout-note], [data-bunsetsu-stats-list-note]')).toHaveCount(0);
    // まとまりの左右の境（見出しと本文の両方）に縦の罫線が付く
    const heading = feature(page).locator('[data-bunsetsu-stats-layout-table] thead tr:first-child th[scope="colgroup"]').nth(1);
    await expect(heading).toHaveClass(/bunsetsu-stats-edge-start/);
    await expect(heading).toHaveCSS('border-left-width', '1px');
    await expect(feature(page).locator('[data-bunsetsu-stats-layout-table] tbody tr[data-bunsetsu-stats-row="ok"] td').nth(3)).toHaveClass(
      /bunsetsu-stats-edge-start/,
    );
    // 定義は、ペインの見出しのⓘから開く
    await page.getByRole('button', { name: '文節ごとの統計の説明' }).click();
    await expect(page.getByRole('dialog')).toContainText('文字数1の文節は除きます');
  });

  test('打ちやすさ・順位・結論を述べる文言を出さない', async ({ page }) => {
    const text = (await feature(page).innerText()).replaceAll(/\s+/g, '');
    for (const word of ['打ちやすい', '打ちにくい', '優れ', '劣', '順位', '結論', '合成スコア', 'おすすめ']) {
      expect(text, word).not.toContain(word);
    }
  });
});

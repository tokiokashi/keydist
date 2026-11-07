import { expect, test, PAGE_TAG, type Page } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';

/**
 * Run Chartのe2e。区間の集計・目安線・座標の計算はunit testで固定しているので、
 * ここでは画面の配線（指標の切り替えで縦軸の見出しが替わる）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="run-chart"]');

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
    await page.goto('/analyzer/run-chart');
    await expect(feature(page).locator('[data-run-chart-series]')).toHaveCount(2, { timeout: 15_000 });
  });

  test('指標を切り替えると縦軸の見出しが替わる', { tag: PAGE_TAG }, async ({ page }) => {
    const title = feature(page).locator('[data-run-chart-y-title]');
    await expect(title).toContainText('かな1つで動く距離');
    const settings = await openSettings(page);
    await settings.getByLabel('指標').selectOption('sameFingerRate');
    await expect(title).toContainText('同指率');
  });
});

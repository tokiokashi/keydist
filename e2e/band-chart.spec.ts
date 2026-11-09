import { expect, PAGE_TAG, test } from './fixtures.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * 帯グラフのe2e。区分の割合・座標・折り返しはunit testで固定しているので、
 * ここでは画面の配線（配列ごとの帯が出る・行を押すと割合が出る）だけを見る。
 */

const feature = (page: import('@playwright/test').Page) => page.locator('[data-react-feature="band-chart"]');

test.beforeEach(async ({ page }) => {
  await useShortText(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:multi-target-selection') === null) {
      localStorage.setItem(
        'keydist:multi-target-selection',
        JSON.stringify({
          version: 1,
          targets: [
            { kind: 'layout', layoutId: 'qwerty' },
            { kind: 'layout', layoutId: 'jis-kana' },
            { kind: 'layout', layoutId: 'dvorak' },
          ],
        }),
      );
    }
  });
});

test('配列ごとに帯が出て、行を押すとその配列の4区分の割合が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/band-chart');
  const rows = feature(page).locator('[data-band-row]');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });
  await expect(feature(page).locator('[data-band-legend-item]')).toHaveCount(4);
  await expect(feature(page).locator('[data-band-detail]')).toHaveCount(0);

  const jis = feature(page).locator('[data-band-row="layout:jis-kana"]');
  await jis.focus();
  await page.keyboard.press('Enter');
  const detail = feature(page).locator('[data-band-detail="layout:jis-kana"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-band-detail-row]')).toHaveCount(4);

  // 区分に重ねると、区分の名前と割合が出る
  await feature(page).locator('[data-band-segment="layout:qwerty:1"]').hover();
  await expect(feature(page).locator('[data-band-tooltip]')).toContainText('0.5〜1.5u');

  // 見出しで並びの境目を選ぶと向きの札が加わり、選んだ順へ戻すと消える
  const sort = page.locator('.pane-frame-target-extra').getByRole('button', { name: /^並び: / });
  await expect(sort).toHaveAccessibleName('並び: 選んだ順');
  await expect(page.locator('.pane-frame-target-extra').getByRole('button', { name: /^並びの向き: / })).toHaveCount(0);
  await sort.click();
  await page.getByRole('listbox').getByRole('option').nth(1).click();
  await expect(sort).not.toHaveAccessibleName('並び: 選んだ順');
  await expect(page.locator('.pane-frame-target-extra').getByRole('button', { name: '並びの向き: 大きい順' })).toBeVisible();
  await expect(rows).toHaveCount(3);
  await sort.click();
  await page.getByRole('option', { name: '選んだ順' }).click();
  await expect(page.locator('.pane-frame-target-extra').getByRole('button', { name: /^並びの向き: / })).toHaveCount(0);

  // 見出しで量を切り替えても、帯と量の選択が出続ける
  // 同じラベルが解析設定の小窓にも出るので、ペインの見出しの欄に絞る
  const quantity = page.locator('.pane-frame-target-extra').getByRole('button', { name: /^量: / });
  await quantity.click();
  await page.getByRole('option', { name: '段' }).click();
  await expect(feature(page).locator('[data-band-caption]')).toHaveText('押したキーの段の割合');
  await expect(rows).toHaveCount(3);
  await expect(quantity).toHaveAccessibleName('量: 段');
  await expect(feature(page).locator('[data-band-segment]').first()).toBeVisible();

  // キーボードで開いて選び、閉じたら札へフォーカスが戻る
  await quantity.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: '段' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(quantity).toBeFocused();
  await expect(quantity).not.toHaveAccessibleName('量: 段');
});

test('URLの量を読み、開き直しても同じ量が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/band-chart?quantity=row');
  await expect(feature(page).locator('[data-band-row]')).toHaveCount(3, { timeout: 15_000 });
  await expect(feature(page).locator('[data-band-caption]')).toHaveText('押したキーの段の割合');
  await expect(feature(page).locator('[data-band-legend]')).toContainText('数字段');
  await page.reload();
  await expect(feature(page).locator('[data-band-caption]')).toHaveText('押したキーの段の割合');
});

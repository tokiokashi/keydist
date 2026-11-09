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

test('配列ごとに帯が出て、行を押して選んだ配列だけの図が下に出て、その図の行を押すと4区分の割合が出る', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/band-chart');
  const rows = feature(page).locator('[data-band-row]');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });
  await expect(feature(page).locator('[data-band-legend-item]')).toHaveCount(4);
  await expect(feature(page).locator('[data-band-focus-row]')).toHaveCount(0);
  await expect(feature(page).locator('[data-band-detail]')).toHaveCount(0);

  // 全体の図の行を押すと、選んだ配列だけの図が出る。全体の図の行を押しても表は出ない
  const row = (key: string) => feature(page).locator(`[data-band-row="${key}"]`);
  await row('layout:qwerty').click();
  await row('layout:jis-kana').click();
  await expect(feature(page).locator('[data-band-focus-row]')).toHaveCount(2);
  await expect(feature(page).locator('[data-band-detail]')).toHaveCount(0);

  // 選んだ配列の図の行を押すと、その配列の4区分の割合が出る
  const jis = feature(page).locator('[data-band-focus-row="layout:jis-kana"]');
  await jis.focus();
  await page.keyboard.press('Enter');
  const detail = feature(page).locator('[data-band-detail="layout:jis-kana"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-band-detail-row]')).toHaveCount(4);

  // 区分に重ねると、区分の名前と割合が出る
  await feature(page).locator('[data-band-segment="layout:qwerty:1"]').hover();
  await expect(feature(page).locator('[data-band-tooltip]')).toContainText('0.5〜1.5u');

  // 凡例の項目を押すと、そこまでの割合の大きい順・小さい順に並び、3回目で選んだ順へ戻る。右端の項目は押せない
  const labels = () => rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-band-row')));
  const initial = await labels();
  const legendItem = feature(page).locator('[data-band-legend-item="0"]');
  await expect(feature(page).locator('[data-band-legend-item="3"]')).not.toHaveAttribute('role', 'button');
  await legendItem.click();
  await expect(legendItem).toHaveAttribute('data-sort', 'desc');
  const desc = await labels();
  await legendItem.click();
  await expect(legendItem).toHaveAttribute('data-sort', 'asc');
  expect(await labels()).toEqual([...desc].reverse());
  await legendItem.click();
  await expect(legendItem).not.toHaveAttribute('data-sort', /.+/);
  expect(await labels()).toEqual(initial);

  // 並べ替えは選んだ配列の図にも同じ並びで当たる
  const focusLabels = () =>
    feature(page)
      .locator('[data-band-focus-row]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-band-focus-row')));
  await legendItem.click();
  await expect(legendItem).toHaveAttribute('data-sort', 'desc');
  const picked = new Set(['layout:qwerty', 'layout:jis-kana']);
  expect(await focusLabels()).toEqual((await labels()).filter((key) => key !== null && picked.has(key)));
  await legendItem.click();
  await legendItem.click();
  await expect(legendItem).not.toHaveAttribute('data-sort', /.+/);

  // 全体の図で外すと、選んだ配列の図からも表からも消える。まとめて外すと図が消える
  await row('layout:jis-kana').click();
  await expect(feature(page).locator('[data-band-focus-row]')).toHaveCount(1);
  await expect(feature(page).locator('[data-band-detail]')).toHaveCount(0);
  await feature(page).getByRole('button', { name: '選んだ配列を外す' }).click();
  await expect(feature(page).locator('[data-band-focus-row]')).toHaveCount(0);

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

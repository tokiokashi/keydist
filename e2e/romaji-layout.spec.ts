import { expect, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ローマ字配列の画面のE2E。検査の分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、不備の場所が出る、作る・直す・元に戻す、
 * 保存先に反映される、トップの対象の選択に並ぶ、取り込み形式の配列は名前だけを直せる。
 */

const STORAGE_KEY = 'keydist:user-layouts';

test('配列を作り、不備を直し、編集して、元に戻せる。作った配列は対象の選択に並ぶ', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: 'ローマ字配列', exact: true }).click();
  await expect(page).toHaveURL(/\/romaji-layout$/);

  // 何も入れていない間は保存できない。名前と英字の段が悪いと出る
  const submit = page.locator('[data-layout-submit]');
  await expect(submit).toBeDisabled();
  await expect(page.locator('[data-layout-problem="error"]')).toHaveCount(2);

  await page.getByLabel('名前', { exact: true }).fill('私のDvorak');
  await page.locator('[data-layout-row="0"]').fill('1234567890[]');
  // 長すぎる段は、その段の下に理由が出る
  await page.locator('[data-layout-row="1"]').fill("',.pyfgcrl/=x");
  await expect(page.getByRole('alert').filter({ hasText: '上段が13文字' })).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.locator('[data-layout-row="1"]').fill("',.pyfgcrl/=");
  await page.locator('[data-layout-row="2"]').fill('aoeuidhtns-');
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwvz');
  await expect(page.locator('[data-layout-problem="error"]')).toHaveCount(0);
  await expect(submit).toBeEnabled();

  // 同じ文字を別のキーに置いても保存はできる。重なったキーが示される
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwva');
  await expect(page.locator('[data-layout-problem="warning"]')).toContainText('「a」');
  await expect(submit).toBeEnabled();
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwvz');

  await page.locator('[data-layout-home="RI"]').selectOption('h');
  await submit.click();
  await expect(page.locator('[data-layout-pick]')).toHaveValue(/^user-/);
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await expect.poll(stored).toContain('私のDvorak');
  await expect.poll(stored).toContain('"RI":"h"');

  // 開いて直せる。変更が無い間は保存できない
  await expect(submit).toBeDisabled();
  await page.getByLabel('名前', { exact: true }).fill('改名したDvorak');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(stored).toContain('改名したDvorak');
  await expect(submit).toBeDisabled();

  // 元に戻すで、名前が戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('私のDvorak');
  await expect.poll(stored).not.toContain('改名したDvorak');

  // トップの対象の選択に並ぶ
  const id = await page.locator('[data-layout-pick]').inputValue();
  await page.goto('/');
  await waitForHydration(page);
  await page
    .locator('.hero')
    .getByRole('button', { name: /^対象: / })
    .click();
  await expect(page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${id}"]`)).toHaveCount(1);
});

test('指が担当しないキーをホームキーにすると警告が出て、担当するキーに直すと消える。保存はできる', async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);
  await page.getByLabel('名前', { exact: true }).fill('ホームキーの確認');
  await page.locator('[data-layout-row="1"]').fill("',.pyfgcrl/=");
  await page.locator('[data-layout-row="2"]').fill('aoeuidhtns-');
  await page.locator('[data-layout-row="3"]').fill(';qjkxbmwvz');

  const warning = page
    .locator('[data-layout-home="LI"]')
    .locator('xpath=ancestor::div[contains(@class, "romaji-layout-home-item")]')
    .locator('[data-layout-problem="warning"]');
  await expect(warning).toHaveCount(0);
  await page.locator('[data-layout-home="LI"]').selectOption('h');
  await expect(warning).toContainText('使われず');
  await expect(page.locator('[data-layout-submit]')).toBeEnabled();

  await page.locator('[data-layout-home="LI"]').selectOption('');
  await page.locator('[data-layout-home="RI"]').selectOption('h');
  await expect(page.locator('.romaji-layout-home [data-layout-problem="warning"]')).toHaveCount(0);
});

test('取り込み形式の配列は、名前だけを直せ、段の文字と同時押しの出力は読み取り専用で示される', async ({ page }) => {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        layouts: [
          {
            id: 'user-imported',
            kind: 'alpha',
            name: '取り込んだ配列',
            rows: ['  34        ', ' qwert      ', 'as df      ', ' x        '],
            romaji: 'kunrei',
            sequences: [['desu', [['d', 's']]]],
            legends: [['a', 'Enter']],
          },
        ],
      }),
    );
  }, STORAGE_KEY);
  await page.goto('/romaji-layout');
  await waitForHydration(page);
  await expect(page.locator('[data-layout-pick]')).toHaveValue('user-imported');
  await expect(page.locator('[data-layout-row]')).toHaveCount(0);
  await expect(page.locator('[data-layout-imported-row="2"]')).toHaveText('as df      ');
  await expect(page.locator('[data-layout-imported-summary]')).toContainText('同時押しなどで出す出力が1件');

  await page.getByLabel('名前', { exact: true }).fill('改名した取り込み');
  await page.locator('[data-layout-submit]').click();
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await expect.poll(stored).toContain('改名した取り込み');
  const layout = JSON.parse((await stored()) ?? '{}').layouts[0];
  expect(layout.rows).toEqual(['  34        ', ' qwert      ', 'as df      ', ' x        ']);
  expect(layout.sequences).toEqual([['desu', [['d', 's']]]]);
  expect(layout.legends).toEqual([['a', 'Enter']]);
});

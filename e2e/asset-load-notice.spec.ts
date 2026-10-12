import { expect, test } from '@playwright/test';

/**
 * 保存データに壊れた値がある状態で開いた時の知らせ。直した形を書き戻すので、開き直すと同じ知らせは出ない。
 * 資産ごとの出し分けと書き戻しの中身はunit testで確かめ、ここは画面への配線だけを見る。
 */

const TEXT_LIBRARY_KEY = 'keydist:text-library';
const PRESET_LIBRARY_KEY = 'keydist:presets';

test('壊れた保存データで開くと知らせ、開き直すと知らせない', async ({ page }) => {
  await page.addInitScript(
    ([key]) => {
      // 開き直した時に壊れた値を入れ直さない
      if (sessionStorage.getItem('seeded') !== null) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key!, JSON.stringify({ version: 1, texts: 5 }));
    },
    [TEXT_LIBRARY_KEY],
  );
  await page.goto('/standalone/bigram-flow');
  const notice = page.locator('[data-asset-load-notice="textLibrary"]');
  await expect(notice).toContainText('テキストの保存データに読めない部分があった');
  expect(await page.evaluate((key) => localStorage.getItem(key), TEXT_LIBRARY_KEY)).toBe(
    JSON.stringify({ version: 1, texts: [] }),
  );

  await notice.getByRole('button', { name: '知らせを閉じる' }).click();
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-asset-load-notice]')).toHaveCount(0);
});

test('新しい版が書いた保存データは、知らせた上でそのまま残す', async ({ page }) => {
  const future = JSON.stringify({ version: 99, presets: [] });
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key!, value!);
    },
    [PRESET_LIBRARY_KEY, future],
  );
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-asset-load-notice="presetLibrary"]')).toContainText('新しい版のアプリで保存された');
  expect(await page.evaluate((key) => localStorage.getItem(key), PRESET_LIBRARY_KEY)).toBe(future);
});

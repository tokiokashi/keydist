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
  await page.goto('/analyzer/bigram-flow');
  const notice = page.locator('[data-asset-load-notice]');
  await expect(notice).toContainText('テキスト: 読めない部分が1件');
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
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('[data-asset-load-notice-key="presetLibrary"]')).toContainText('新しい版のアプリで保存された');
  expect(await page.evaluate((key) => localStorage.getItem(key), PRESET_LIBRARY_KEY)).toBe(future);
});

const BROKEN_KEYS = [
  'keydist:standalone-text-selection',
  'keydist:multi-target-selection',
  'keydist:single-target-selection',
  'keydist:user-layouts',
  'keydist:finger-assignments',
  'keydist:user-romaji-rules',
  'keydist:setup-library',
  'keydist:personal-speed',
  'keydist:workspaces',
  'keydist:standalone-analyzer-options',
  'keydist:text-library',
  'keydist:presets',
];

test('スマホ幅で全資産が壊れていても、知らせは画面に収まり、閉じるボタンが押せる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((keys) => {
    for (const key of keys) localStorage.setItem(key, '{壊れたJSON');
  }, BROKEN_KEYS);
  await page.goto('/analyzer/bigram-flow');
  const notice = page.locator('[data-asset-load-notice]');
  await expect(notice).toBeVisible();
  await expect(notice.locator('li')).toHaveCount(BROKEN_KEYS.length);
  const box = (await notice.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.width).toBeGreaterThan(300);
  expect(box.y).toBeGreaterThan(844 * 0.3);
  await notice.getByRole('button', { name: '知らせを閉じる' }).click();
  await expect(notice).toHaveCount(0);
});

test('画面を移っても、書き戻しと知らせは最初の読み込みだけ', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  // 開いたままのタブの裏で、読めない値（直せば読める値）が保存された状態を作る
  const broken = JSON.stringify({ version: 1, texts: 5 });
  await page.evaluate((value) => localStorage.setItem('keydist:text-library', value), broken);
  await page.getByRole('link', { name: '個人速度' }).first().click();
  await expect(page).toHaveURL(/personal-speed/);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('keydist:text-library'))).toBe(broken);
  await expect(page.locator('[data-asset-load-notice]')).toHaveCount(0);
});

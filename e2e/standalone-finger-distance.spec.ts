import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指ごとの距離のE2E。値の正しさは抽出のunit testで固定しているので、
 * ここでは描画と、全体の行が左右の手の合計に一致することだけを見る。
 */
test('単体ページが開き、指ごとの表と指間距離の標準偏差の表が描画される', async ({ page }) => {
  await page.goto('/standalone/finger-distance');
  await expect(page.getByRole('heading', { name: '指ごとの距離', exact: true, level: 1 })).toBeVisible();

  const feature = page.locator('[data-react-feature="finger-distance"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });
  // 左右の手に分かれ、親指を含む10本が並ぶ
  await expect(feature.locator('tbody[data-hand="left"] tr[data-finger]')).toHaveCount(5);
  await expect(feature.locator('tbody[data-hand="right"] tr[data-finger]')).toHaveCount(5);
  await expect(feature.locator('tr[data-adjacent-pair]')).toHaveCount(6);

  const distanceOf = async (selector: string) => Number((await feature.locator(selector).locator('td').nth(1).innerText()).trim());
  const total = await distanceOf('tr[data-total]');
  const left = await distanceOf('tr[data-hand-total="left"]');
  const right = await distanceOf('tr[data-hand-total="right"]');
  // 表示は小数第1位までなので、丸めの分だけ許す
  expect(Math.abs(left + right - total)).toBeLessThan(0.11);
  expect(total).toBeGreaterThan(0);
});

test('Workspaceにペインとして追加できる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /指ごとの距離/ }).click();
  await expect(page.locator('[data-react-feature="finger-distance"]')).toBeVisible({ timeout: 10_000 });
});

test('共有リンクに載らない対象（名前が長すぎるSetup）は、共有した時に送る側へ示す', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'src-long', layoutId: 'colemak-dh', shapeId: 'row-staggered', label: 'あ'.repeat(200) }],
        overrides: {},
      }),
    );
    localStorage.setItem(
      'keydist:single-target-selection',
      JSON.stringify({ version: 1, target: { kind: 'setup', setupId: 'src-long' } }),
    );
  });
  await page.goto('/standalone/finger-distance');
  await expect(page.locator('[data-react-feature="finger-distance"]')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '共有', exact: true }).click();
  const notice = page.locator('[data-share-notice="true"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('名前が長すぎるSetup');
  await expect(notice).toContainText('リンクに載らなかった');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).searchParams.has('target')).toBe(false);
});

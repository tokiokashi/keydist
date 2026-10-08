import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

test('サイドバーから計算方法のページを開け、仕様書とリポジトリへのリンクが出る', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await waitForHydration(page);

  const sidebar = page.locator('#app-sidebar');
  await sidebar.getByRole('link', { name: '計算方法', exact: true }).click();
  await expect(page).toHaveURL(/\/about\/?$/);
  await expect(page.getByRole('heading', { name: '計算方法', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '距離モデルが落とした次元' })).toBeVisible();
  await expect(page.getByRole('img', { name: /「ぬいぐるみ」（訓令式のnuigurumi）の最初の3打鍵/ })).toBeVisible();

  // 外部リンクは別タブで開くので、遷移せずリンク先だけ確かめる
  await expect(sidebar.getByRole('link', { name: '距離モデルの仕様書' }))
    .toHaveAttribute('href', 'https://github.com/tokiokashi/keydist/blob/main/spec/distance-model.md');
  await expect(sidebar.getByRole('link', { name: '再生時間モデルの仕様書' }))
    .toHaveAttribute('href', 'https://github.com/tokiokashi/keydist/blob/main/spec/playback-timing.md');
  await expect(sidebar.getByRole('link', { name: '構造解析モデルの仕様' }))
    .toHaveAttribute('href', 'https://github.com/tokiokashi/keydist/blob/main/spec/distance-model.md#10-任意時点の指位置');
  await expect(page.locator('.about').getByRole('link', { name: '構造解析モデルの仕様' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'GitHub', exact: true }))
    .toHaveAttribute('href', 'https://github.com/tokiokashi/keydist');
  await expect(page.locator('.about').getByRole('link', { name: 'GitHubのリポジトリ' }))
    .toHaveAttribute('href', 'https://github.com/tokiokashi/keydist');
});

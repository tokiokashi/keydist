import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指ごとの距離のE2E。値の正しさは抽出のunit testで固定しているので、
 * ここでは描画（既定の縦棒グラフ・見る量の切り替え・幅390px）だけを見る。
 */
test('既定では移動距離の縦棒グラフが、左小指から右手の小指の順に出る', async ({ page }) => {
  await page.goto('/analyzer/finger-distance');
  await expect(page.getByRole('heading', { name: '指ごとの距離', exact: true, level: 1 })).toBeVisible();

  const feature = page.locator('[data-react-feature="finger-distance"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });
  await expect(feature.locator('[data-chart-bar]')).toHaveCount(10);
  expect(await feature.locator('[data-chart-bar]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-chart-bar'))))
    .toEqual(['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP']);
});

test('見る量を隣り合う指の組にすると6本の棒になり、幅390pxでもはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/analyzer/finger-distance?metric=stdDev');
  const feature = page.locator('[data-react-feature="finger-distance"]');
  await expect(feature.locator('[data-chart-bar]')).toHaveCount(6, { timeout: 10_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await feature.locator('svg').first().boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // 6組それぞれの分布も、幅390pxでペインの中に収まる
  const distributions = feature.locator('[data-distribution-pair]');
  await expect(distributions).toHaveCount(6);
  for (const box of await distributions.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right))) {
    expect(box).toBeLessThanOrEqual(390);
  }
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
  await page.goto('/analyzer/finger-distance');
  await expect(page.locator('[data-react-feature="finger-distance"]')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '共有', exact: true }).click();
  const notice = page.locator('[data-share-notice="true"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('名前が長すぎるSetup');
  await expect(notice).toContainText('リンクに載りませんでした');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).searchParams.has('target')).toBe(false);
});

test.describe('タッチ端末', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });

  test('棒をタップすると値と割合が図の下に出て、もう1度タップすると消える', async ({ page }) => {
    await page.goto('/analyzer/finger-distance');
    const feature = page.locator('[data-react-feature="finger-distance"]');
    const bar = feature.locator('[data-chart-bar="RI"]');
    await expect(bar).toBeVisible({ timeout: 10_000 });
    const readout = feature.locator('[data-chart-readout]');
    await expect(readout).toHaveText('');

    await bar.tap();
    await expect(readout).toHaveText(/右人差し指: .+ u（全体の\d+\.\d%）/);
    const svgBox = (await feature.locator('svg').boundingBox())!;
    const readoutBox = (await readout.boundingBox())!;
    expect(readoutBox.y).toBeGreaterThanOrEqual(svgBox.y + svgBox.height);

    await feature.locator('[data-chart-bar="LP"]').tap();
    await expect(readout).toHaveText(/左小指/);

    await feature.locator('[data-chart-bar="LP"]').tap();
    await expect(readout).toHaveText('');
  });

  test('押下数の図でも、隣り合う指の組の図でも、棒をタップして読める', async ({ page }) => {
    await page.goto('/analyzer/finger-distance?metric=presses');
    const feature = page.locator('[data-react-feature="finger-distance"]');
    await feature.locator('[data-chart-bar="RM"]').tap();
    await expect(feature.locator('[data-chart-readout]')).toHaveText(/右中指: \d+（全体の/);

    await page.goto('/analyzer/finger-distance?metric=stdDev');
    await expect(feature.locator('[data-chart-bar]')).toHaveCount(6, { timeout: 10_000 });
    await feature.locator('[data-chart-bar]').first().tap();
    await expect(feature.locator('[data-chart-readout]')).toHaveText(/標準偏差: .+ u/);
  });

  test('キーボードで棒を選べて、Escapeで外れる', async ({ page }) => {
    await page.goto('/analyzer/finger-distance');
    const feature = page.locator('[data-react-feature="finger-distance"]');
    const bar = feature.locator('[data-chart-bar="LM"]');
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await bar.focus();
    await page.keyboard.press('Enter');
    await expect(feature.locator('[data-chart-readout]')).toHaveText(/左中指/);
    await page.keyboard.press('Escape');
    await expect(feature.locator('[data-chart-readout]')).toHaveText('');
  });
});

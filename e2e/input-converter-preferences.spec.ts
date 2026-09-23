import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'keydist:input-converter-preferences';

/** dragging解除後のscale springが収まるのを待つ（workspace-persistence.spec.tsの慣例に合わせる） */
async function waitForSpringSettle(page: import('@playwright/test').Page) {
  await page.waitForTimeout(350);
}

function isRealConsoleError(text: string): boolean {
  return !/Failed to load resource/.test(text);
}

test('layout, geometry and display toggles persist across a reload (#413 phase6)', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const layoutSelect = page.getByLabel('配列', { exact: true });
  const geometrySelect = page.getByLabel('物理配列', { exact: true });
  const dynamicGuideToggle = page.getByLabel('動的ガイド', { exact: true });
  const layerKeysToggle = page.getByLabel('レイヤーキー', { exact: true });

  await expect(dynamicGuideToggle).toBeChecked();
  await expect(layerKeysToggle).toBeChecked();

  await layoutSelect.selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await geometrySelect.selectOption('column-staggered');
  await dynamicGuideToggle.uncheck();
  await layerKeysToggle.uncheck();

  consoleMessages.length = 0; // reload以降のログだけを見る
  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');

  await expect(page.getByLabel('配列', { exact: true })).toHaveValue('shingeta');
  await expect(page.getByLabel('物理配列', { exact: true })).toHaveValue('column-staggered');
  await expect(page.getByLabel('動的ガイド', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('レイヤーキー', { exact: true })).not.toBeChecked();

  await page.waitForTimeout(150);
  const hydrationWarnings = consoleMessages.filter((text) => /hydrat/i.test(text));
  expect(hydrationWarnings).toEqual([]);
});

test('a corrupt localStorage value falls back to defaults with no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && isRealConsoleError(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.addInitScript((key) => {
    localStorage.setItem(key, '{this is not json');
  }, STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(page.getByLabel('配列', { exact: true })).toHaveValue('naginata-v18');
  await expect(page.getByLabel('物理配列', { exact: true })).toHaveValue('row-staggered');
  await expect(page.getByLabel('動的ガイド', { exact: true })).toBeChecked();
  await expect(page.getByLabel('レイヤーキー', { exact: true })).toBeChecked();

  expect(errors).toEqual([]);
});

test('an unsupported version value also falls back to defaults with no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && isRealConsoleError(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 999,
      layoutId: 'shingeta',
      geometryId: 'column-staggered',
    }));
  }, STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(page.getByLabel('配列', { exact: true })).toHaveValue('naginata-v18');
  expect(errors).toEqual([]);
});

test('layout B restore also revives a floating layer card of B without a visible flight animation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  // layout B(shingeta)へ切り替え、そのレイヤーカードを1枚小窓化して動かす
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');

  const floatButton = page.locator('.input-layer-card .input-layer-card-float').first();
  const buttonLabel = await floatButton.getAttribute('aria-label');
  expect(buttonLabel).not.toBeNull();
  const cardLabel = buttonLabel!.replace(/を小窓表示$/, '');
  await floatButton.click();

  const cardPanel = page.getByLabel(`${cardLabel} 個別カンペ`, { exact: true });
  await expect(cardPanel).toHaveAttribute('data-floating', 'true');
  const moveHandle = page.getByLabel(`${cardLabel}カンペを移動`, { exact: true });
  const box = await moveHandle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 220, box!.y + 130);
  await page.mouse.up();
  await waitForSpringSettle(page);
  const expectedRect = await cardPanel.boundingBox();
  expect(expectedRect).not.toBeNull();

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(page.getByLabel('配列', { exact: true })).toHaveValue('shingeta');

  const cardAfterReload = page.getByLabel(`${cardLabel} 個別カンペ`, { exact: true });
  await expect(cardAfterReload).toHaveAttribute('data-floating', 'true');

  // 復元直後、通常のドック位置からfloating位置へ「飛ぶ」アニメーションが無ければ、
  // 最初に観測できた時点で既に最終位置にいるはず。
  const firstBox = await cardAfterReload.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(Math.round(firstBox!.x)).toBe(Math.round(expectedRect!.x));
  expect(Math.round(firstBox!.y)).toBe(Math.round(expectedRect!.y));

  await page.waitForTimeout(250);
  const settledBox = await cardAfterReload.boundingBox();
  expect(settledBox).not.toBeNull();
  expect(Math.round(settledBox!.x)).toBe(Math.round(firstBox!.x));
  expect(Math.round(settledBox!.y)).toBe(Math.round(firstBox!.y));
});

import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'keydist:input-converter-preferences';

/** dragging解除後のscale springが収まるのを待つ（workspace-persistence.spec.tsの慣例に合わせる） */
async function waitForSpringSettle(page: import('@playwright/test').Page) {
  await page.waitForTimeout(350);
}

function isRealConsoleError(text: string): boolean {
  return !/Failed to load resource/.test(text);
}

test('practice environment persists per layout while physical geometry stays global', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const geometrySelect = page.getByLabel('物理配列', { exact: true });
  const output = page.getByLabel('自由入力テキスト');
  const practice = page.getByLabel('打ちたい文字');
  const dynamicGuideToggle = page.getByLabel('動的ガイド', { exact: true });
  const layerKeysToggle = page.getByLabel('レイヤーキー', { exact: true });

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  // 物理配列はTester全体で共有する。
  await geometrySelect.selectOption('column-staggered');

  // 配列Aの練習環境。
  await dynamicGuideToggle.uncheck();
  await practice.fill('かな');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');

  // 配列Bは初期状態から始まり、geometryだけAから引き継ぐ。
  await layoutSelect.selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).toBeChecked();
  await expect(layerKeysToggle).toBeChecked();
  await expect(practice).toHaveValue('');
  await expect(output).toHaveValue('');

  await layerKeysToggle.uncheck();
  await practice.fill('ことば');

  // Aへ戻るとAのKeyboard View / Input Text / Practice Textが復元される。
  await layoutSelect.selectOption('naginata-v18');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).not.toBeChecked();
  await expect(layerKeysToggle).toBeChecked();
  await expect(practice).toHaveValue('かな');
  await expect(output).toHaveValue('か');

  consoleMessages.length = 0;
  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).not.toBeChecked();
  await expect(practice).toHaveValue('かな');
  await expect(output).toHaveValue('か');

  // reload後もBの環境は独立して残る。
  await layoutSelect.selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(geometrySelect).toHaveValue('column-staggered');
  await expect(dynamicGuideToggle).toBeChecked();
  await expect(layerKeysToggle).not.toBeChecked();
  await expect(practice).toHaveValue('ことば');
  await expect(output).toHaveValue('');

  await page.waitForTimeout(150);
  const hydrationWarnings = consoleMessages.filter((text) => /hydrat/i.test(text));
  expect(hydrationWarnings).toEqual([]);
});

test('random practice mode restores the same current challenge per layout and reload', async ({ page }) => {
  // 初回mountのrestoreとユーザー操作を競合させず、このテストはrandom stateの往復だけを見る。
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      layoutId: 'shingeta',
      geometryId: 'row-staggered',
      layouts: {
        shingeta: {
          showDynamicGuide: true,
          showLayerGuide: true,
          showLayerKeys: true,
          showShiftKeys: false,
          inputText: '',
          practiceText: '',
          randomPracticeMode: null,
        },
      },
    }));
  }, STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const practice = page.getByLabel('打ちたい文字');
  const randomWord = page.getByRole('button', { name: 'ランダムな単語' });

  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');

  await randomWord.click();
  const challenge = await practice.inputValue();
  expect(challenge.length).toBeGreaterThan(0);
  await expect(randomWord).toHaveAttribute('aria-pressed', 'true');

  await layoutSelect.selectOption('naginata-v18');
  await expect(practice).toHaveValue('');
  await layoutSelect.selectOption('shingeta');
  await expect(practice).toHaveValue(challenge);
  await expect(randomWord).toHaveAttribute('aria-pressed', 'true');

  // preference書き込みは既存schedulerの400ms debounceを使うため、
  // reload検証の前に現在のお題とmodeがstorageへ到達したことを確認する。
  await expect.poll(async () => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    const layout = value.layouts?.shingeta;
    return layout === undefined
      ? null
      : {
          practiceText: layout.practiceText,
          randomPracticeMode: layout.randomPracticeMode,
        };
  }, STORAGE_KEY)).toEqual({
    practiceText: challenge,
    randomPracticeMode: 'word',
  });

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(practice).toHaveValue(challenge);
  await expect(randomWord).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.getByLabel('自由入力テキスト')).toHaveValue('');
  await expect(page.getByLabel('打ちたい文字')).toHaveValue('');

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

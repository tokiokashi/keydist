import { expect, test } from '@playwright/test';

test('Input Converter keeps browser key lifecycle consistent', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const output = page.getByLabel('自由入力テキスト');
  const pressed = page.locator('.input-inspector section').first().locator('p');

  await output.click();
  await expect(output).toBeFocused();

  const repeatSpacePrevented = await output.evaluate((element) => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    return !element.dispatchEvent(event);
  });
  expect(repeatSpacePrevented).toBe(true);

  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await output.click();

  await page.keyboard.press('h');
  await expect(output).toHaveValue('く');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();
  await page.keyboard.press('h');
  await page.keyboard.press('s');
  await expect(output).toHaveValue('くか');
  await page.keyboard.down('Backspace');
  await expect(output).toHaveValue('く');
  await page.keyboard.down('Backspace');
  await expect(output).toHaveValue('');
  await page.keyboard.up('Backspace');

  await page.keyboard.press('s');
  await expect(output).toHaveValue('か');
  await page.keyboard.press('l');
  await expect(output).toHaveValue('が');

  await page.keyboard.down('d');
  await expect(pressed).toHaveText('d');

  await page.getByLabel('配列', { exact: true }).focus();
  await expect(pressed).toHaveText('—');

  await output.click();
  await page.keyboard.down('h');
  await expect(pressed).toHaveText('h');

  await page.keyboard.down('Control');
  await page.keyboard.up('h');
  await page.keyboard.up('Control');
  await expect(pressed).toHaveText('—');

  await page.getByRole('button', { name: 'クリア' }).click();
  await page.getByLabel('配列', { exact: true }).selectOption('qwerty');
  await expect(feature).toHaveAttribute('data-input-ready', 'qwerty');
  await output.click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('a');
  await page.keyboard.up('Shift');
  await expect(output).toHaveValue('A');
});


test('Input Converter selects preset and saved custom physical geometry', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:geometry-shapes', JSON.stringify([{
      id: 'shape-e2e-grid',
      name: 'E2E Grid',
      pitchMm: 19.05,
      rowWidths: [12, 12, 11, 10],
      thumbs: [
        { id: 'thumb-l', finger: 'LT', col: 3.5, y: 4 },
        { id: 'thumb-r', finger: 'RT', col: 5.5, y: 4 },
      ],
    }]));
  });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const geometry = page.getByLabel('物理配列');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });

  await expect(geometry).toHaveValue('row-staggered');
  await expect(keyboard).toHaveAttribute('data-geometry-id', 'row-staggered');

  await geometry.selectOption('ortholinear');
  await expect(keyboard).toHaveAttribute('data-geometry-id', 'ortholinear');

  await expect(geometry.locator('option[value="shape-e2e-grid"]')).toHaveText('自作: E2E Grid');
  await geometry.selectOption('shape-e2e-grid');
  await expect(keyboard).toHaveAttribute('data-geometry-id', 'shape-e2e-grid');
});


test('Input Converter shows stable active layer, dynamic next-key guide and display toggles', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const layerLabel = page.locator('.input-active-layer');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(layerLabel).toContainText('現在のレイヤー');
  await expect(layerLabel).toContainText('通常');

  await output.click();
  await page.keyboard.down('j');
  await expect(feature).toHaveAttribute('data-active-layer', 'layer:濁音');
  await expect(layerLabel).toContainText('濁音');
  await expect(keyboard.locator('[data-key-id="f"] .physical-keyboard-legend')).toHaveText('が');
  await expect(keyboard.locator('[data-key-id="h"]')).toHaveAttribute('data-guide', 'continuation');

  await page.keyboard.down('h');
  await expect(keyboard.locator('[data-key-id="w"]')).toHaveAttribute('data-guide', 'output');
  await expect(keyboard.locator('[data-key-id="w"] .physical-keyboard-legend')).toContainText('ぎゃ');
  await page.keyboard.up('h');
  await page.keyboard.up('j');
  await expect(layerLabel).toContainText('通常');

  await expect(page.getByLabel('レイヤーカンペ一覧')).toBeVisible();
  await page.getByLabel('レイヤーカンペ', { exact: true }).uncheck();
  await expect(page.locator('.input-layer-guide')).toHaveCount(0);
  await page.getByLabel('レイヤーカンペ', { exact: true }).check();
  await expect(page.locator('.input-layer-guide')).toBeVisible();

  await expect(keyboard.locator('[data-key-id="j"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await page.getByLabel('起点キー色').uncheck();
  await expect(keyboard.locator('[data-accent-slot]')).toHaveCount(0);
  await page.getByLabel('起点キー色').check();

  await expect(page.locator('.input-layer-card')).toHaveCount(1);
  await expect(page.locator('.input-layer-card').first()).toContainText('SandS');
  await expect(page.getByLabel('意味論的な組み合わせ')).toContainText('濁音');
  await expect(page.getByLabel('意味論的な組み合わせ')).toContainText('拗音');

  await output.click();
  await page.keyboard.down('j');
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-guide', 'output');
  await page.getByLabel('動的ガイド').uncheck();
  await expect(keyboard.locator('[data-guide]')).toHaveCount(0);
  await page.keyboard.up('j');
});

test('月配列one-shotは未定義側へQWERTYを貫通せず1打で必ず消費する', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const layerLabel = page.locator('.input-active-layer');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await output.click();

  // k面は左側だけをshiftする。右側hは対象外なのでbase面「く」を案内する。
  await page.keyboard.down('k');
  await expect(layerLabel).toContainText('中指シフト');
  await page.keyboard.up('k');
  await expect(layerLabel).toContainText('中指シフト');
  await expect(keyboard.locator('[data-key-id="h"] .physical-keyboard-legend')).toHaveText('く');

  // 対象外側でも「次の1打」なのでone-shotを消費し、baseの「く」を出す。
  await page.keyboard.press('h');
  await expect(output).toHaveValue('く');
  await expect(layerLabel).toContainText('通常');

  // 古いk triggerは復活せず、次の左側fもbaseの「と」。
  await page.keyboard.press('f');
  await expect(output).toHaveValue('くと');
});

test('かわせみ配列+の同時押しをbrowser lifecycleでも認識する', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('kawasemi-plus');
  await expect(feature).toHaveAttribute('data-input-ready', 'kawasemi-plus');
  await output.click();

  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await expect(output).toHaveValue('こと');
  await page.keyboard.up('s');
  await page.keyboard.up('d');
});


test('月配列one-shot guideは対象外単打をbase kanaで示し未定義physical idを主legendへ出さない', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await output.click();

  await page.keyboard.press('d');
  await expect(feature).toHaveAttribute('data-active-layer', 'layer:中指シフト');

  // d-shiftは右側対象。左側qはbase面「そ」として1打消費される。
  await expect(keyboard.locator('[data-key-id="q"] .physical-keyboard-legend')).toHaveText('そ');
  // 月配列に文字定義のないnumber rowはphysical idを主legendへ貫通させない。
  await expect(keyboard.locator('[data-key-id="1"] .physical-keyboard-legend')).toHaveText('');
});


test('月配列は未定義の標準文字keyをQWERTYとして貫通させない', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await output.click();

  await page.keyboard.press('k');
  await page.keyboard.press('1');
  await expect(output).toHaveValue('');
  await expect(feature).toHaveAttribute('data-active-layer', 'single');

  await page.keyboard.press('f');
  await expect(output).toHaveValue('と');
});

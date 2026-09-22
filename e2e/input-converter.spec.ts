import { expect, test } from '@playwright/test';

test('Input Converter uses a resizable wide FHD workspace without test-mode scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const settings = page.locator('.input-settings-panel');
  const settingsSummary = settings.locator('> summary');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  const capture = page.locator('.input-capture-panel');
  const keyboardPanel = page.locator('.input-keyboard-panel');
  const details = page.getByLabel('入力詳細');
  const layerLabel = page.locator('.input-active-layer');
  const splitter = page.getByRole('separator', { name: 'カンペと入力領域の幅を調整' });

  const [settingsBox, guideBox, captureBox, keyboardBox, detailsBox] = await Promise.all([
    settings.boundingBox(),
    guide.boundingBox(),
    capture.boundingBox(),
    keyboardPanel.boundingBox(),
    details.boundingBox(),
  ]);
  expect(settingsBox).not.toBeNull();
  expect(guideBox).not.toBeNull();
  expect(captureBox).not.toBeNull();
  expect(keyboardBox).not.toBeNull();
  expect(detailsBox).not.toBeNull();
  expect(settingsBox!.x).toBeLessThan(captureBox!.x);
  expect(guideBox!.x).toBeLessThan(keyboardBox!.x);
  expect(guideBox!.y).toBeGreaterThan(settingsBox!.y);
  expect(keyboardBox!.y).toBeGreaterThan(captureBox!.y);
  expect(Math.abs(
    (guideBox!.y + guideBox!.height) - (detailsBox!.y + detailsBox!.height),
  )).toBeLessThanOrEqual(2);

  await expect(splitter).toHaveAttribute('aria-valuenow', '50');
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '48');

  await expect(settings).toHaveJSProperty('open', true);
  await settingsSummary.click();
  await expect(settings).toHaveJSProperty('open', false);

  const [collapsedGuideBox, collapsedDetailsBox] = await Promise.all([
    guide.boundingBox(),
    details.boundingBox(),
  ]);
  expect(collapsedGuideBox).not.toBeNull();
  expect(collapsedDetailsBox).not.toBeNull();
  expect(Math.abs(
    (collapsedGuideBox!.y + collapsedGuideBox!.height)
      - (collapsedDetailsBox!.y + collapsedDetailsBox!.height),
  )).toBeLessThanOrEqual(2);

  const guideOverflowY = await guide.locator('.input-layer-guide-grid')
    .evaluate((element) => getComputedStyle(element).overflowY);
  expect(guideOverflowY).toBe('auto');

  const viewportOverflow = await page.evaluate(() =>
    document.documentElement.scrollHeight - window.innerHeight);
  expect(viewportOverflow).toBeLessThanOrEqual(1);

  await splitter.focus();
  await page.keyboard.press('Home');

  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const keyboardMain = page.locator('.input-keyboard-main');
  const [wideKeyboardBox, keyboardMainBox, wideDetailsBox] = await Promise.all([
    keyboard.boundingBox(),
    keyboardMain.boundingBox(),
    details.boundingBox(),
  ]);
  expect(wideKeyboardBox).not.toBeNull();
  expect(keyboardMainBox).not.toBeNull();
  expect(wideDetailsBox).not.toBeNull();
  expect(wideDetailsBox!.height).toBeGreaterThanOrEqual(110);
  expect(wideKeyboardBox!.height).toBeLessThanOrEqual(keyboardMainBox!.height + 1);

  const before = await layerLabel.boundingBox();
  await page.getByLabel('自由入力テキスト').click();
  await page.keyboard.down('j');
  const after = await layerLabel.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.height).toBe(before!.height);
  await page.keyboard.up('j');
});

test('Input Converter keeps desktop Y bounded and lets cheatsheets scroll when width causes wrapping', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 768 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');

  const guide = page.getByLabel('レイヤーカンペ一覧');
  const displaySettings = page.getByLabel('表示設定');
  const keyboardPanel = page.locator('.input-keyboard-panel');
  const splitter = page.getByRole('separator', { name: 'カンペと入力領域の幅を調整' });

  await splitter.focus();
  await page.keyboard.press('Home');

  const [displayBox, keyboardBox] = await Promise.all([
    displaySettings.boundingBox(),
    keyboardPanel.boundingBox(),
  ]);
  expect(displayBox).not.toBeNull();
  expect(keyboardBox).not.toBeNull();
  expect(displayBox!.x).toBeGreaterThanOrEqual(keyboardBox!.x);

  const dimensions = await guide.locator('.input-layer-guide-grid').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(dimensions.overflowY).toBe('auto');
  expect(dimensions.scrollHeight).toBeGreaterThanOrEqual(dimensions.clientHeight);

  const viewportOverflow = await page.evaluate(() =>
    document.documentElement.scrollHeight - window.innerHeight);
  expect(viewportOverflow).toBeLessThanOrEqual(1);
});

test('Input Converter chooses the cheatsheet grid that maximizes readable card size', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const settings = page.locator('.input-settings-panel');
  const settingsSummary = settings.locator('> summary');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const grid = page.locator('.input-layer-guide-grid');
  const columns = async () => grid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns
      .split(' ')
      .filter((track) => track.length > 0)
      .length);
  const setLayoutWithSettingsCollapsed = async (value: string) => {
    if (!(await settings.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await settingsSummary.click();
      await expect(settings).toHaveJSProperty('open', true);
    }
    await layoutSelect.selectOption(value);
    await expect(feature).toHaveAttribute('data-input-ready', value);
    await settingsSummary.click();
    await expect(settings).toHaveJSProperty('open', false);
  };

  await setLayoutWithSettingsCollapsed('nicola');
  await expect(page.locator('.input-layer-card')).toHaveCount(2);
  await expect.poll(columns).toBe(1);

  await setLayoutWithSettingsCollapsed('shingeta');
  await expect(page.locator('.input-layer-card')).toHaveCount(4);
  await expect.poll(columns).toBe(2);
});

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
  await expect(layerLabel).toContainText('現在');
  await expect(layerLabel).toContainText('通常');

  await output.click();
  await page.keyboard.down('j');
  await expect(feature).toHaveAttribute('data-active-layer', 'layer:濁音');
  await expect(layerLabel).toContainText('濁音');
  await expect(keyboard.locator('[data-key-id="f"] .physical-keyboard-legend')).toHaveText('が');
  await expect(keyboard.locator('[data-key-id="h"]')).not.toHaveAttribute('data-guide', 'continuation');

  await page.keyboard.down('h');
  await expect(keyboard.locator('[data-key-id="w"]')).toHaveAttribute('data-guide', 'output');
  await expect(keyboard.locator('[data-key-id="w"] .physical-keyboard-legend')).toContainText('ぎゃ');
  await page.keyboard.up('h');
  await page.keyboard.up('j');
  await expect(layerLabel).toContainText('通常');

  await expect(page.getByLabel('レイヤーカンペ一覧')).toBeVisible();
  const layerGuideToggle = page.getByLabel('レイヤーカンペ', { exact: true });
  await layerGuideToggle.focus();
  await page.keyboard.press('Space');
  await expect(layerGuideToggle).not.toBeChecked();
  await expect(page.locator('.input-layer-guide')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(layerGuideToggle).toBeChecked();
  await expect(page.locator('.input-layer-guide')).toBeVisible();

  await expect(keyboard.locator('[data-key-id="j"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(keyboard.locator('[data-key-id="o"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(keyboard.locator('[data-combo]')).toHaveCount(0);
  const triggerColorToggle = page.getByLabel('レイヤーキー');
  await triggerColorToggle.focus();
  await page.keyboard.press('Space');
  await expect(triggerColorToggle).not.toBeChecked();
  await expect(keyboard.locator('[data-accent-slot]')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(triggerColorToggle).toBeChecked();

  await expect(page.locator('.input-layer-card')).toHaveCount(1);
  await expect(page.locator('.input-layer-card').first()).toContainText('SandS');
  await expect(page.getByLabel('意味論的な組み合わせ')).toContainText('濁音');
  await expect(page.getByLabel('意味論的な組み合わせ')).toContainText('拗音');

  await output.click();
  await page.keyboard.down('j');
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-guide', 'output');
  const dynamicGuideToggle = page.getByLabel('動的ガイド');
  await dynamicGuideToggle.focus();
  await page.keyboard.press('Space');
  await expect(dynamicGuideToggle).not.toBeChecked();
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

test('新JIS通常シフトと薙刀式装飾keyはrelease後に前置シフト化しない', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const layerLabel = page.locator('.input-active-layer');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('shin-jis-simultaneous');
  await expect(feature).toHaveAttribute('data-input-ready', 'shin-jis-simultaneous');
  await output.click();

  await page.keyboard.down('Space');
  await expect(layerLabel).toContainText('シフト');
  await page.keyboard.up('Space');
  await expect(layerLabel).toContainText('通常');
  await page.keyboard.press('h');
  await expect(output).toHaveValue('く');

  await page.getByRole('button', { name: 'クリア' }).click();
  await page.getByLabel('配列', { exact: true }).selectOption('naginata-v18');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await output.click();
  await page.keyboard.press('j');
  await expect(layerLabel).toContainText('通常');
  await page.keyboard.press('f');
  await expect(output).toHaveValue('あか');
});

test('TK音直入力法はかなを直接表示しcomboと拗音contextを認識する', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('oonishi-custom-combo');
  await expect(feature).toHaveAttribute('data-input-ready', 'oonishi-custom-combo');
  await output.click();

  // TK音直のlogical k -> aを通常打鍵して「か」。
  await page.keyboard.press('h');
  await page.keyboard.press('d');
  await expect(output).toHaveValue('か');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();

  // logical d+s combo -> "desu" をliveかな表示で「です」へ戻す。
  await page.keyboard.down('m');
  await page.keyboard.down('l');
  await page.keyboard.up('l');
  await page.keyboard.up('m');
  await expect(output).toHaveValue('です');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();

  // k の後だけyouon-onlyの logical i+a combo ("ya") を許可し、kya -> きゃ。
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.keyboard.down('d');
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  await expect(output).toHaveValue('きゃ');
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


test('親指physical keyを任意browser codeへ再割当して永続化できる', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('nicola');
  await expect(feature).toHaveAttribute('data-input-ready', 'nicola');

  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('じ');

  await page.getByRole('button', { name: 'クリア' }).click();

  await page.getByRole('button', { name: '左親指にキーを追加' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '左親指からSpaceを削除' })).toBeVisible();
  await expect(page.getByRole('button', { name: '右親指からSpaceを削除' })).toHaveCount(0);

  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('あ');

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(page.getByRole('button', { name: '左親指からSpaceを削除' })).toBeVisible();
});

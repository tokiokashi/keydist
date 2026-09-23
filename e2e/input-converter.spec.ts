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

  const viewportMetrics = await page.evaluate(() => ({
    body: document.body.scrollHeight - window.innerHeight,
    document: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(viewportMetrics.body).toBeLessThanOrEqual(0);
  expect(viewportMetrics.document).toBeLessThanOrEqual(0);

  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const keyboardMain = page.locator('.input-keyboard-main');
  const keyboardContent = page.locator('.input-keyboard-content');

  // 1:1では縦積み。入力詳細の見出し行は持たず、2要素だけを横並びにする。
  await expect(keyboardContent).toHaveAttribute('data-detail-layout', 'stacked');
  await expect(details.locator('.input-debug-heading')).toHaveCount(0);
  const stackedSections = details.locator('.input-inspector > section');
  const stackedBoxes = await stackedSections.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()));
  expect(stackedBoxes).toHaveLength(2);
  expect(Math.abs(stackedBoxes[0]!.top - stackedBoxes[1]!.top))
    .toBeLessThanOrEqual(1);

  // 左:右=46:54付近までは縦積み。
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '46');
  await expect(keyboardContent).toHaveAttribute('data-detail-layout', 'stacked');

  // 44:56で4:5より右側が大きくなったら、詳細をキーボード右へ移す。
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '44');
  await expect(keyboardContent).toHaveAttribute('data-detail-layout', 'side');

  const [wideKeyboardBox, keyboardMainBox, wideDetailsBox] = await Promise.all([
    keyboard.boundingBox(),
    keyboardMain.boundingBox(),
    details.boundingBox(),
  ]);
  expect(wideKeyboardBox).not.toBeNull();
  expect(keyboardMainBox).not.toBeNull();
  expect(wideDetailsBox).not.toBeNull();
  expect(wideDetailsBox!.x).toBeGreaterThan(
    keyboardMainBox!.x + keyboardMainBox!.width,
  );
  expect(wideDetailsBox!.width).toBeLessThanOrEqual(140);
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

test('Recognized detail stays one row when one event realizes multiple inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const output = page.getByLabel('自由入力テキスト');
  const recognizedSection = page.getByLabel('入力詳細')
    .locator('.input-inspector > section')
    .nth(1);

  await output.click();
  await page.keyboard.down('r');
  await page.keyboard.down(',');
  await expect(output).toHaveValue('しん');

  const recognizedRows = recognizedSection.locator('.input-recognized');
  await expect(recognizedRows).toHaveCount(2);
  await expect(recognizedRows.nth(0)).toContainText('し');
  await expect(recognizedRows.nth(1)).toContainText('ん');

  const boxes = await recognizedRows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()));
  expect(Math.abs(boxes[0]!.top - boxes[1]!.top)).toBeLessThanOrEqual(1);

  await page.keyboard.up(',');
  await page.keyboard.up('r');
});

test('Recognized detail stays one row for the reported k/j re-press sequence', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const output = page.getByLabel('自由入力テキスト');
  const recognizedRows = page.getByLabel('入力詳細')
    .locator('.input-recognized');

  await output.click();
  await page.keyboard.down('k');
  await page.keyboard.down('j');
  await page.keyboard.up('k');
  await page.keyboard.down('k');
  await page.keyboard.up('k');

  // この時点ではなく、最後に保持中の j を離した瞬間に
  // pending/replay がまとめて確定して複数recognizedになる。
  await page.keyboard.up('j');

  await expect.poll(async () => recognizedRows.count()).toBeGreaterThan(1);

  const boxes = await recognizedRows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()));
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
});

test('Recognized detail keeps the same typography and height before and after input', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const recognizedSection = page.getByLabel('入力詳細')
    .locator('.input-inspector > section')
    .nth(1);
  const empty = recognizedSection.locator('.input-recognized-empty');
  await expect(empty).toHaveText('-');
  await expect(recognizedSection.getByRole('heading', { name: 'Recognized' })).toBeVisible();

  const beforeBox = await recognizedSection.boundingBox();
  const emptyFontSize = await empty.evaluate(
    (element) => getComputedStyle(element).fontSize,
  );
  expect(beforeBox).not.toBeNull();

  const output = page.getByLabel('自由入力テキスト');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');

  const recognized = recognizedSection.locator('.input-recognized strong');
  const afterBox = await recognizedSection.boundingBox();
  const recognizedFontSize = await recognized.evaluate(
    (element) => getComputedStyle(element).fontSize,
  );
  expect(afterBox).not.toBeNull();
  expect(recognizedFontSize).toBe(emptyFontSize);
  expect(afterBox!.height).toBe(beforeBox!.height);
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

  const viewportMetrics = await page.evaluate(() => ({
    body: document.body.scrollHeight - window.innerHeight,
    document: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(viewportMetrics.body).toBeLessThanOrEqual(0);
  expect(viewportMetrics.document).toBeLessThanOrEqual(0);
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
  await expect(keyboard).toHaveAttribute('preserveAspectRatio', 'xMinYMid meet');
  const keyboardHeading = page.locator('.input-keyboard-heading');
  await expect(keyboardHeading).toContainText(
    '入力と違う位置になる場合、キーをクリックすることで次に押した実キーをその位置へ割り当てられます。',
  );
  await expect(page.getByLabel('物理キー割当')).toHaveCount(0);

  for (const id of [
    'row-staggered',
    'column-staggered',
    'ortholinear',
    'jis-row-staggered',
    'jis-column-staggered',
    'jis-ortholinear',
  ]) {
    await geometry.selectOption(id);
    await expect(keyboard).toHaveAttribute('data-geometry-id', id);
  }

  await expect(geometry.locator('optgroup[label="US / ANSI"] option')).toHaveCount(3);
  await expect(geometry.locator('optgroup[label="JIS 109"] option')).toHaveCount(3);
  await expect(geometry.locator('option[value="shape-e2e-grid"]')).toHaveText('E2E Grid');
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
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-home', 'true');
  await expect(keyboard.locator('[data-key-id="j"]')).toHaveAttribute('data-home', 'true');
  const homeLegend = keyboard.locator('[data-key-id="f"] .physical-keyboard-legend');
  const homeMark = keyboard.locator('[data-key-id="f"] .physical-keyboard-home-mark');
  await expect(homeMark).toBeVisible();
  const [homeLegendY, homeMarkY] = await Promise.all([
    homeLegend.evaluate((element) => Number(element.getAttribute('y'))),
    homeMark.evaluate((element) => Number(element.getAttribute('y1'))),
  ]);
  expect(homeMarkY - homeLegendY).toBeGreaterThanOrEqual(3);
  await expect(layerLabel).toContainText('現在');
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
  const layerGuideToggle = page.getByLabel('レイヤーカンペ', { exact: true });
  await layerGuideToggle.focus();
  await page.keyboard.press('Space');
  await expect(layerGuideToggle).not.toBeChecked();
  await expect(page.locator('.input-layer-guide')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(layerGuideToggle).toBeChecked();
  await expect(page.locator('.input-layer-guide')).toBeVisible();

  await expect(keyboard.locator('[data-key-id="thumb-r"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(keyboard.locator('[data-key-id="j"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(keyboard.locator('[data-key-id="h"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
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
  const sandSCard = page.locator('.input-layer-card').first();
  await expect(sandSCard).toContainText('SandS');
  await expect(sandSCard.locator('[data-key-id="thumb-r"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(sandSCard.locator('[data-key-id="j"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(sandSCard.locator('[data-key-id="f"]')).toHaveAttribute('data-home', 'true');
  await expect(sandSCard.locator('[data-key-id="j"]')).toHaveAttribute('data-home', 'true');
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

  // 後続のorder-free検証では動的ガイドを戻す。
  await page.keyboard.press('Space');
  await expect(dynamicGuideToggle).toBeChecked();

  // order-free chordはauthoring triggerでない側を先に保持しても相方を案内する。
  await output.click();
  await page.keyboard.down('w');
  await expect(keyboard.locator('[data-key-id="h"]')).toHaveAttribute('data-guide', 'output');
  await expect(keyboard.locator('[data-key-id="h"] .physical-keyboard-legend')).toHaveText('きゃ');
  // 組み合わせで変わらないキーは単打凡例を残し、roll/arpeggio可能性を読めるようにする。
  await expect(keyboard.locator('[data-key-id="f"] .physical-keyboard-legend')).toHaveText('か');
  await page.keyboard.up('w');
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
  await expect(feature).not.toHaveAttribute('data-active-layer', 'single');
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

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();

  // 撥音comboは onn の2nを保ち、後続の「や」を「にゃ」へ吸収しない。
  await page.keyboard.down('x');
  await page.keyboard.down('f');
  await page.keyboard.up('f');
  await page.keyboard.up('x');
  await expect(output).toHaveValue('おん');
  await page.keyboard.press('o');
  await page.keyboard.press('d');
  await expect(output).toHaveValue('おんや');
});

test('打ち方逆引きは配列ごとのcanonical inputを表示する', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const lookup = page.getByLabel('打ちたい文字');
  const results = page.getByLabel('打ち方逆引き').locator('.input-lookup-results');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });

  await lookup.fill('かな');
  const guide = page.getByLabel('入力順ガイド');
  await expect(guide).toContainText('1 / 2');
  await expect(guide).toContainText('か');
  const previousButton = page.getByRole('button', { name: '前の入力単位' });
  const nextButton = page.getByRole('button', { name: '次の入力単位' });
  const progress = guide.locator('.input-lookup-progress');
  const [previousBox, nextBox, progressBox] = await Promise.all([
    previousButton.boundingBox(),
    nextButton.boundingBox(),
    progress.boundingBox(),
  ]);
  expect(previousBox).not.toBeNull();
  expect(nextBox).not.toBeNull();
  expect(progressBox).not.toBeNull();
  expect(previousBox!.x).toBeLessThan(nextBox!.x);
  expect(nextBox!.x + nextBox!.width).toBeLessThan(progressBox!.x);
  expect(nextBox!.x - (previousBox!.x + previousBox!.width)).toBeLessThanOrEqual(6);
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="m"]')).not.toHaveAttribute('data-lookup', 'true');

  await page.getByRole('button', { name: '次の入力単位' }).click();
  await expect(guide).toContainText('2 / 2');
  await expect(guide).toContainText('な');
  await expect(keyboard.locator('[data-key-id="f"]')).not.toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="m"]')).toHaveAttribute('data-lookup', 'true');

  await page.getByRole('button', { name: '前の入力単位' }).click();
  await expect(guide).toContainText('1 / 2');

  await lookup.fill('せ');
  await expect(guide).toContainText('せ');
  await expect(keyboard.locator('[data-key-id="a"] .physical-keyboard-legend'))
    .toHaveText('せ');

  await lookup.fill('ぎゃ');
  await expect(results).toContainText('H + J + W');
  await expect(results.locator('li').first()).toContainText('ガイド中');
  for (const key of ['h', 'j', 'w']) {
    await expect(keyboard.locator(`[data-key-id="${key}"]`))
      .toHaveAttribute('data-lookup', 'true');
  }

  await page.getByLabel('配列', { exact: true }).selectOption('oonishi-custom-combo');
  await expect(feature).toHaveAttribute('data-input-ready', 'oonishi-custom-combo');
  await lookup.fill('です');
  await expect(results).toContainText('M + L');
  await expect(results).toContainText('コンボ');
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


test('#387 Esc全削除・hold中Backspace・JISかな・仮想Shift表示を扱う', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const layerLabel = page.locator('.input-active-layer');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  // Backspaceは文字を消してもphysical holdを維持する。
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');
  await page.keyboard.down('j');
  await expect(layerLabel).toContainText('濁音');
  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('');
  await expect(layerLabel).toContainText('濁音');
  await page.keyboard.press('f');
  await expect(output).toHaveValue('が');
  await page.keyboard.up('j');

  // layout入力でないEscはblurせず全文クリア。
  await page.keyboard.press('Escape');
  await expect(output).toHaveValue('');
  await expect(output).toBeFocused();

  await page.getByLabel('物理配列').selectOption('column-staggered');
  await page.getByLabel('配列', { exact: true }).selectOption('jis-kana');
  await expect(feature).toHaveAttribute('data-input-ready', 'jis-kana');
  await expect(page.getByLabel('物理配列')).toHaveValue('jis-column-staggered');
  await output.click();

  await page.keyboard.press('q');
  await expect(output).toHaveValue('た');
  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();
  await page.keyboard.press('t');
  await page.keyboard.press('[');
  await expect(output).toHaveValue('が');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('3');
  await page.keyboard.up('Shift');
  await expect(output).toHaveValue('ぁ');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();
  await output.evaluate((element) => {
    for (const type of ['keydown', 'keyup'] as const) {
      element.dispatchEvent(new KeyboardEvent(type, {
        key: 'ろ',
        code: 'IntlRo',
        bubbles: true,
        cancelable: true,
      }));
    }
  });
  await expect(output).toHaveValue('ろ');

  // Shiftは入力semanticには残すが既定では盤面から隠し、表示時も仮想1uにする。
  await expect(keyboard.locator('[data-key-id="shift-l"]')).toHaveCount(0);
  const shiftToggle = page.getByLabel('Shiftキー');
  await shiftToggle.focus();
  await page.keyboard.press('Space');
  await expect(shiftToggle).toBeChecked();
  const shiftRect = keyboard.locator('[data-key-id="shift-l"] rect');
  const regularRect = keyboard.locator('[data-key-id="z"] rect');
  await expect(shiftRect).toBeVisible();
  const [shiftWidth, regularWidth] = await Promise.all([
    shiftRect.evaluate((element) => Number(element.getAttribute('width'))),
    regularRect.evaluate((element) => Number(element.getAttribute('width'))),
  ]);
  expect(Math.abs(shiftWidth - regularWidth)).toBeLessThanOrEqual(0.1);
});

test('盤面クリックで任意browser codeをphysical keyへ再割当して永続化できる', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const output = page.getByLabel('自由入力テキスト');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const bindingBar = page.getByLabel('物理キー割当');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('nicola');
  await expect(feature).toHaveAttribute('data-input-ready', 'nicola');

  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('じ');

  await page.getByRole('button', { name: 'クリア' }).click();

  await keyboard.locator('[data-key-id="thumb-l"] rect').click();
  await expect(bindingBar).toContainText('実キーを押してください');
  await page.keyboard.press('Space');
  await expect(bindingBar.getByRole('button', { name: 'thumb-lからSpaceを削除' })).toBeVisible();

  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('あ');

  // 親指に限らず通常キーも同じUIで再割当できる。
  await page.getByRole('button', { name: 'クリア' }).click();
  await keyboard.locator('[data-key-id="f"] rect').click();
  await page.keyboard.press('q');
  await output.click();
  await page.keyboard.press('q');
  await expect(output).toHaveValue('か');

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('nicola');
  await expect(feature).toHaveAttribute('data-input-ready', 'nicola');
  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('あ');
});

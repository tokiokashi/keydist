import { expect, test } from '@playwright/test';

test('Input Converter uses a resizable wide FHD workspace without test-mode scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const settings = page.locator('.input-settings-panel');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  const capture = page.locator('.input-capture-panel');
  const keyboardPanel = page.locator('.input-keyboard-panel');
  const details = page.getByLabel('入力詳細', { exact: true });
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
    (guideBox!.y + guideBox!.height) - (keyboardBox!.y + keyboardBox!.height),
  )).toBeLessThanOrEqual(2);

  await expect(splitter).toHaveAttribute('aria-valuenow', '50');
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '48');

  await expect(settings.locator('.input-settings-body')).toBeVisible();
  await settings.getByRole('button', { name: '設定を閉じる' }).click();
  await expect(settings.locator('.input-settings-body')).toHaveCount(0);

  const [collapsedGuideBox, collapsedKeyboardBox] = await Promise.all([
    guide.boundingBox(),
    keyboardPanel.boundingBox(),
  ]);
  expect(collapsedGuideBox).not.toBeNull();
  expect(collapsedKeyboardBox).not.toBeNull();
  expect(Math.abs(
    (collapsedGuideBox!.y + collapsedGuideBox!.height)
      - (collapsedKeyboardBox!.y + collapsedKeyboardBox!.height),
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
  const detailPlacement = async () => {
    const [mainBox, detailBox] = await Promise.all([
      keyboardMain.boundingBox(),
      details.boundingBox(),
    ]);
    if (mainBox === null || detailBox === null) return 'missing';
    return detailBox.x >= mainBox.x + mainBox.width - 2 ? 'side' : 'stacked';
  };

  // 1:1付近では縦積み。見出し行の下に2要素を横並びにする。
  await expect.poll(detailPlacement).toBe('stacked');
  await expect(details.locator('.input-debug-heading')).toBeVisible();
  const stackedSections = details.locator('.input-inspector > section');
  const stackedBoxes = await stackedSections.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()));
  expect(stackedBoxes).toHaveLength(2);
  expect(Math.abs(stackedBoxes[0]!.top - stackedBoxes[1]!.top))
    .toBeLessThanOrEqual(1);

  // 46:54付近まではpanel自身の横幅が狭く、縦積み。
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '46');
  await expect.poll(detailPlacement).toBe('stacked');

  // panel自身が十分広くなったら、詳細をキーボード右へ移す。
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '44');
  await expect.poll(detailPlacement).toBe('side');

  // 入力詳細panelはWorkspacePanel化によりlayoutアニメーションを持つため、
  // spring transitionが収まってから幅を計測する。
  await expect.poll(async () => {
    const box = await details.boundingBox();
    return box === null ? -1 : Math.round(box.width);
  }).toBeLessThanOrEqual(140);

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

test('打ち方逆引きpanelはcontrolsを保ったまま独立小窓化できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.getByLabel('打ち方逆引き', { exact: true });
  const lookup = page.getByLabel('打ちたい文字');

  // Header内buttonは通常操作のまま。
  await panel.getByRole('button', { name: 'ランダムな単語' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
  await expect(lookup).not.toHaveValue('');

  await lookup.fill('かな');
  await expect(panel.locator('.input-lookup-results')).not.toContainText(
    '文字を入力するとcanonical inputから逆引きします。',
  );

  await page
    .getByLabel('打ち方逆引きパネルをクリックまたはドラッグして小窓表示')
    .getByText('打ち方を調べる', { exact: true })
    .click();
  await expect(panel).toHaveAttribute('data-floating', 'true');
  await expect(lookup).toHaveValue('かな');

  await panel.getByRole('button', { name: '打ち方逆引きパネルを元に戻す' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
});

test('入力詳細panelはヘッダーから独立小窓化し元へ戻せる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.getByLabel('入力詳細', { exact: true });
  const dockedHeader = page.getByLabel(
    '入力詳細パネルをクリックまたはドラッグして小窓表示',
  );

  // header内にはtitleのみ（controlは無い）。titleクリックで小窓化する。
  await expect(panel).not.toHaveAttribute('data-floating');
  await dockedHeader.getByText('入力詳細', { exact: true }).click();
  await expect(panel).toHaveAttribute('data-floating', 'true');

  // 小窓表示領域（floating root）へportalされている。
  await expect(
    page.locator('#workspace-floating-root').getByLabel('入力詳細', { exact: true }),
  ).toHaveCount(1);

  // 小窓化してもRecognized detailの内容は保たれる。
  await expect(panel.getByRole('heading', { name: 'Recognized' })).toBeVisible();

  // 最小サイズまで縮めてbodyをスクロールしても、headerと「戻す」buttonは
  // panelの表示範囲内に留まる（.input-inspectorだけがscrollし、headerはscrollしない）。
  const resizeHandle = page.getByLabel('入力詳細パネルのサイズを変更');
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).not.toBeNull();
  await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox!.x - 400, resizeBox!.y - 400);
  await page.mouse.up();

  await expect.poll(async () => {
    const box = await panel.boundingBox();
    return box === null ? -1 : Math.round(box.height);
  }).toBeLessThanOrEqual(165);

  const backButton = panel.getByRole('button', { name: '入力詳細パネルを元に戻す' });
  await panel.locator('.input-inspector').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const panelBox = await panel.boundingBox();
  const headerBox = await panel.locator('.input-debug-heading').boundingBox();
  const backButtonBox = await backButton.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(backButtonBox).not.toBeNull();

  // boundingBoxがpanel内に収まっているかを比較する（toBeVisibleだけでは
  // scroll containerの外にはみ出た要素も「visible」判定されてしまうため不十分）。
  expect(headerBox!.y).toBeGreaterThanOrEqual(panelBox!.y - 0.5);
  expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 0.5);
  expect(backButtonBox!.y).toBeGreaterThanOrEqual(panelBox!.y - 0.5);
  expect(backButtonBox!.y + backButtonBox!.height)
    .toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 0.5);
  await expect(backButton).toBeVisible();

  await panel.getByRole('button', { name: '入力詳細パネルを元に戻す' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
  await expect(
    page.locator('#workspace-floating-root').getByLabel('入力詳細', { exact: true }),
  ).toHaveCount(0);
});

test('設定panelは開閉controlを誤detachせず小窓化できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.locator('.input-settings-panel');

  await panel.getByRole('button', { name: '設定を閉じる' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
  await expect(panel.locator('.input-settings-body')).toHaveCount(0);
  await panel.getByRole('button', { name: '設定を開く' }).click();

  await page.getByLabel('設定パネルをクリックまたはドラッグして小窓表示')
    .getByText('設定', { exact: true })
    .click();
  await expect(panel).toHaveAttribute('data-floating', 'true');
  await expect(page.getByLabel('配列', { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: '設定パネルを元に戻す' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
});

test('入力panelは小窓化してもtyping sessionとcontrolsを維持する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.locator('.input-capture-panel');
  const output = page.getByLabel('自由入力テキスト');

  await page.getByLabel('入力パネルをクリックまたはドラッグして小窓表示').click();
  await expect(panel).toHaveAttribute('data-floating', 'true');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');

  await panel.getByRole('button', { name: 'クリア' }).click();
  await expect(output).toHaveValue('');
  await panel.getByRole('button', { name: '入力パネルを元に戻す' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
});

test('floating Keyboardのresponsiveは外側splitではなく小窓自身の幅だけを見る', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const splitter = page.getByRole('separator', { name: 'カンペと入力領域の幅を調整' });
  const panel = page.locator('.input-keyboard-panel');
  const keyboardMain = panel.locator('.input-keyboard-main');
  const details = panel.getByLabel('入力詳細', { exact: true });

  const placement = async () => {
    const [mainBox, detailBox] = await Promise.all([
      keyboardMain.boundingBox(),
      details.boundingBox(),
    ]);
    if (mainBox === null || detailBox === null) return 'missing';
    return detailBox.x >= mainBox.x + mainBox.width - 2 ? 'side' : 'stacked';
  };

  // docked panelを十分広くしてside配置にする。
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '44');
  await expect.poll(placement).toBe('side');

  await page.getByLabel('表示設定').getByText('表示', { exact: true }).click();
  await expect(panel).toHaveAttribute('data-floating', 'true');
  await expect.poll(placement).toBe('side');

  // 外側splitだけを狭めても、floating panel自身の幅は変わらないのでsideのまま。
  await splitter.focus();
  await page.keyboard.press('Home');
  await expect(splitter).toHaveAttribute('aria-valuenow', '25');
  await page.keyboard.press('End');
  await expect(splitter).toHaveAttribute('aria-valuenow', '75');
  await expect.poll(placement).toBe('side');

  // 小窓自身を狭めた時だけstackedへ切り替わる。
  const resizeHandle = page.getByLabel('Keyboardパネルのサイズを変更');
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).not.toBeNull();
  await page.mouse.move(
    resizeBox!.x + resizeBox!.width / 2,
    resizeBox!.y + resizeBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(resizeBox!.x - 260, resizeBox!.y);
  await page.mouse.up();
  await expect.poll(placement).toBe('stacked');
});

test('Keyboard panelは表示controlsを保ったまま小窓化できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.locator('.input-keyboard-panel');
  const displayHeader = page.getByLabel('表示設定');
  const dynamicGuide = page.getByLabel('動的ガイド');

  // Header内のcheckbox操作はdetachしない。
  await dynamicGuide.click();
  await expect(panel).not.toHaveAttribute('data-floating');
  await dynamicGuide.click();

  await displayHeader.getByText('表示', { exact: true }).click();
  await expect(panel).toHaveAttribute('data-floating', 'true');
  await expect(page.getByRole('img', { name: '現在の物理キー状態' })).toBeVisible();

  const output = page.getByLabel('自由入力テキスト');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');

  await panel.getByRole('button', { name: 'Keyboardパネルを元に戻す' }).click();
  await expect(panel).not.toHaveAttribute('data-floating');
});

test('docked panel headerは閾値drag・cancel・keyboardを区別する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  const dockedHeader = page.getByLabel('レイヤーカンペを小窓表示');
  const headerBox = await dockedHeader.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(await dockedHeader.evaluate((element) => getComputedStyle(element).touchAction))
    .toBe('none');

  const startX = headerBox!.x + Math.min(100, headerBox!.width / 2);
  const startY = headerBox!.y + headerBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 4, startY + 2);
  await expect(guide).not.toHaveAttribute('data-floating');

  // 8px thresholdを越えた時点でpointerを離さなくてもdetachし、そのままdragを継続する。
  await page.mouse.move(startX + 20, startY + 2);
  await expect(guide).toHaveAttribute('data-floating', 'true');
  await expect(guide).toHaveAttribute('data-dragging', 'true');
  const afterDetach = await guide.boundingBox();
  expect(afterDetach).not.toBeNull();
  await page.mouse.move(startX + 90, startY + 2);
  const afterContinuation = await guide.boundingBox();
  expect(afterContinuation).not.toBeNull();
  expect(afterContinuation!.x).toBeGreaterThan(afterDetach!.x + 55);
  await page.mouse.up();
  await expect(guide).not.toHaveAttribute('data-dragging');

  await page.getByRole('button', { name: 'レイヤーカンペを元に戻す' }).click();
  await expect(guide).not.toHaveAttribute('data-floating');

  // Keyboard fallback.
  await dockedHeader.focus();
  await page.keyboard.press('Enter');
  await expect(guide).toHaveAttribute('data-floating', 'true');
  await page.getByRole('button', { name: 'レイヤーカンペを元に戻す' }).click();

  // blurでclick candidateを破棄し、後続moveがdetachを再開しない。
  const resetBox = await dockedHeader.boundingBox();
  expect(resetBox).not.toBeNull();
  const resetX = resetBox!.x + Math.min(100, resetBox!.width / 2);
  const resetY = resetBox!.y + resetBox!.height / 2;
  await page.mouse.move(resetX, resetY);
  await page.mouse.down();
  await page.mouse.move(resetX + 3, resetY + 2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(resetX + 50, resetY + 2);
  await expect(guide).not.toHaveAttribute('data-floating');
  await page.mouse.up();

  // Header内の明示buttonはdrag detach surfaceにしない。
  if (await guide.getAttribute('data-floating') === 'true') {
    await page.getByRole('button', { name: 'レイヤーカンペを元に戻す' }).click();
  }
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  const cardFloatButton = guide.locator('.input-layer-card-float').first();
  await expect(cardFloatButton).toBeVisible();
  const buttonBox = await cardFloatButton.boundingBox();
  expect(buttonBox).not.toBeNull();
  await page.mouse.move(
    buttonBox!.x + buttonBox!.width / 2,
    buttonBox!.y + buttonBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(buttonBox!.x + buttonBox!.width / 2 + 30, buttonBox!.y);
  await expect(page.locator('.input-layer-card-floating')).toHaveCount(0);
  await page.mouse.up();
});

test('レイヤーカンペはWorkspace overlayで移動・リサイズしながら入力を継続できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const guide = page.getByLabel('レイヤーカンペ一覧');

  await page.getByLabel('レイヤーカンペを小窓表示').click();
  await expect(guide).toHaveAttribute('data-floating', 'true');
  const moveHandle = page.getByLabel('レイヤーカンペを移動');
  const beforeMove = await guide.boundingBox();
  const moveBox = await moveHandle.boundingBox();
  expect(beforeMove).not.toBeNull();
  expect(moveBox).not.toBeNull();
  await page.mouse.move(moveBox!.x + 80, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox!.x + 150, moveBox!.y + 55);
  await page.mouse.up();
  const afterMove = await guide.boundingBox();
  expect(afterMove).not.toBeNull();
  // Yはviewport下端でclampされ得る。少なくとも自由なX移動が反映されることを確認する。
  expect(afterMove!.x).toBeGreaterThan(beforeMove!.x + 40);
  expect(afterMove!.y).toBeGreaterThanOrEqual(12);

  const resizeHandle = page.getByLabel('レイヤーカンペのサイズを変更');
  const beforeResize = await guide.boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  expect(beforeResize).not.toBeNull();
  expect(resizeBox).not.toBeNull();
  await page.mouse.move(
    resizeBox!.x + resizeBox!.width / 2,
    resizeBox!.y + resizeBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(resizeBox!.x + 120, resizeBox!.y + 90);
  await page.mouse.up();
  const afterResize = await guide.boundingBox();
  expect(afterResize).not.toBeNull();
  expect(afterResize!.width).toBeGreaterThan(beforeResize!.width + 60);
  expect(afterResize!.height).toBeGreaterThan(beforeResize!.height + 40);

  // Portal overlayは非モーダルなので、前面表示したまま入力テストを続けられる。
  const output = page.getByLabel('自由入力テキスト');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');
  await expect(guide).toHaveAttribute('data-floating', 'true');

  await page.getByRole('button', { name: 'レイヤーカンペを元に戻す' }).click();
  await expect(guide).not.toHaveAttribute('data-floating');
  await expect(guide).toBeVisible();
});

test('floating panel dragはpointer中のrectを永続stateへ連打せず終了時にcommitする', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  await page.getByLabel('レイヤーカンペを小窓表示').click();
  await expect(guide).toHaveAttribute('data-floating', 'true');

  const persistedRect = async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:workspace-state');
    if (raw === null) return null;
    const state = JSON.parse(raw) as {
      panels?: Record<string, { rect?: { x: number; y: number; width: number; height: number } }>;
    };
    return state.panels?.['input.layer-guide']?.rect ?? null;
  });

  await expect.poll(persistedRect).not.toBeNull();
  const beforePersisted = await persistedRect();
  const beforeVisual = await guide.boundingBox();
  expect(beforePersisted).not.toBeNull();
  expect(beforeVisual).not.toBeNull();

  const moveHandle = page.getByLabel('レイヤーカンペを移動');
  const moveBox = await moveHandle.boundingBox();
  expect(moveBox).not.toBeNull();
  await page.mouse.move(moveBox!.x + 80, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox!.x + 200, moveBox!.y + 40, { steps: 20 });

  // 見た目はpointerへ追従するが、drag中のWorkspace stateはまだcommitしない。
  const duringVisual = await guide.boundingBox();
  expect(duringVisual).not.toBeNull();
  expect(duringVisual!.x).toBeGreaterThan(beforeVisual!.x + 80);
  await page.waitForTimeout(500);
  const duringPersisted = await persistedRect();
  expect(duringPersisted?.x).toBe(beforePersisted?.x);
  expect(duringPersisted?.y).toBe(beforePersisted?.y);

  await page.mouse.up();

  await expect.poll(async () => (await persistedRect())?.x ?? -1)
    .toBeGreaterThan((beforePersisted?.x ?? 0) + 80);
});

test('Workspace animationはreduced-motionを尊重する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  await page.getByLabel('レイヤーカンペを小窓表示').click();
  await expect(guide).toHaveAttribute('data-floating', 'true');

  const motionState = await guide.evaluate((element) => ({
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    transform: getComputedStyle(element).transform,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }));
  expect(motionState.reduced).toBe(true);
  expect(motionState.transitionDuration).toBe('0s');
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(motionState.transform);
});

test('レイヤーカンペは盤面ごとに独立して複数小窓表示できる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  const guide = page.getByLabel('レイヤーカンペ一覧');
  const floatButtons = guide.locator('.input-layer-card-float');
  await expect.poll(() => floatButtons.count()).toBeGreaterThan(1);

  await floatButtons.first().click();
  let floatingCards = page.locator('.input-layer-card-floating');
  await expect(floatingCards).toHaveCount(1);
  await expect(guide).not.toHaveAttribute('data-floating');
  await expect(guide.locator('.input-layer-card-placeholder')).toHaveCount(1);
  // 1枚目を浮かした後も、残りのカードからさらに個別小窓表示できる。
  await guide.locator('.input-layer-card-float').first().click();
  floatingCards = page.locator('.input-layer-card-floating');
  await expect(floatingCards).toHaveCount(2);
  await expect(guide.locator('.input-layer-card-placeholder')).toHaveCount(2);
  const first = floatingCards.first();
  const second = floatingCards.nth(1);
  await expect(first).not.toHaveAttribute('data-active');
  await expect(second).toHaveAttribute('data-active', 'true');
  const initialShadows = await Promise.all([
    first.evaluate((element) => getComputedStyle(element).boxShadow),
    second.evaluate((element) => getComputedStyle(element).boxShadow),
  ]);
  expect(initialShadows[1]).not.toBe(initialShadows[0]);

  const initialZOrder = await Promise.all([
    first.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
    second.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
  ]);
  expect(initialZOrder[1]).toBeGreaterThan(initialZOrder[0]);

  const firstMoveHandle = first.locator('> header');
  const beforeFirst = await first.boundingBox();
  const beforeSecond = await second.boundingBox();
  const moveBox = await firstMoveHandle.boundingBox();
  expect(beforeFirst).not.toBeNull();
  expect(beforeSecond).not.toBeNull();
  expect(moveBox).not.toBeNull();

  await page.mouse.move(moveBox!.x + 60, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox!.x + 120, moveBox!.y + moveBox!.height / 2);
  await page.mouse.up();

  const afterFirst = await first.boundingBox();
  const afterSecond = await second.boundingBox();
  expect(afterFirst).not.toBeNull();
  expect(afterSecond).not.toBeNull();
  expect(afterFirst!.x).toBeGreaterThan(beforeFirst!.x + 30);
  expect(Math.abs(afterSecond!.x - beforeSecond!.x)).toBeLessThanOrEqual(1);

  const activatedZOrder = await Promise.all([
    first.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
    second.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
  ]);
  expect(activatedZOrder[0]).toBeGreaterThan(activatedZOrder[1]);
  await expect(first).toHaveAttribute('data-active', 'true');
  await expect(second).not.toHaveAttribute('data-active');

  await first.getByRole('button', { name: /を元に戻す$/ }).click();
  await expect(page.locator('.input-layer-card-floating')).toHaveCount(1);
  await expect(guide.locator('.input-layer-card-placeholder')).toHaveCount(1);
});

test('#regression レイヤーカンペ本体を浮かせた状態でも入れ子portalのMRU z-orderが壊れない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');

  // レイヤーカンペ本体を小窓化してから、その子である個別カンペカード2枚(A, B)も
  // それぞれ独立小窓化する。カードはガイドのReact子要素だがfloating-rootへ
  // portalされるため、クリックイベントはReactツリーを経由してガイドまで伝播する。
  const guide = page.getByLabel('レイヤーカンペ一覧');
  await page.getByLabel('レイヤーカンペを小窓表示').click();
  await expect(guide).toHaveAttribute('data-floating', 'true');

  const floatButtons = guide.locator('.input-layer-card-float');
  await expect.poll(() => floatButtons.count()).toBeGreaterThan(1);

  // ボタンがfloating cardに覆われて素のclick()が届かないことがあるため、
  // evaluateで直接クリックする(過去に必要だった回避策)。
  await floatButtons.first().evaluate((element) => (element as HTMLElement).click());
  const cardA = page.locator('.input-layer-card-floating').first();
  await expect(cardA).toHaveCount(1);

  // 浮かせた直後の初期位置はガイド本体の矩形と重なる。ここでガイドが前面化するのは
  // ドッキング中のボタンをクリックした結果として正しい挙動(このボタンはまだガイドの
  // 実DOM配下にある)。だがそのままだとガイドがAの上に重なり続けてしまうので、
  // 浮いた直後(=Aがまだガイドより前面にいる)のうちにヘッダーをドラッグしてガイドの
  // 矩形の外へ退避させる。これで後段のクリックがガイドに遮られなくなる。
  const dragBy = async (handle: ReturnType<typeof cardA.locator>, dx: number, dy: number) => {
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(20, box!.height / 2));
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + Math.min(20, box!.height / 2) + dy);
    await page.mouse.up();
  };
  await dragBy(cardA.locator('> header'), 700, 0);

  await guide.locator('.input-layer-card-float').first()
    .evaluate((element) => (element as HTMLElement).click());
  const floatingCards = page.locator('.input-layer-card-floating');
  await expect(floatingCards).toHaveCount(2);
  const cardB = floatingCards.nth(1);
  await expect(cardB).toHaveAttribute('data-active', 'true');
  // Bも同様に、浮いた直後(=Bがまだガイドより前面にいる)のうちに退避させる。
  await dragBy(cardB.locator('> header'), -700, 400);

  const zIndexOf = (locator: typeof cardA) => locator.evaluate(
    (element) => Number.parseInt(getComputedStyle(element).zIndex, 10),
  );

  // Aのbody(ボタンでない場所)をpointerdown + clickして前面化する。
  const cardABody = cardA.locator('p');
  const cardABox = await cardABody.boundingBox();
  expect(cardABox).not.toBeNull();
  await page.mouse.move(cardABox!.x + cardABox!.width / 2, cardABox!.y + cardABox!.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  const [guideZAfterClick, aZAfterClick, bZAfterClick] = await Promise.all([
    zIndexOf(guide),
    zIndexOf(cardA),
    zIndexOf(cardB),
  ]);
  // 修正前はここでガイドがAより上に来た(guide=3, A=4, B=2 の実測あり)。
  expect(guideZAfterClick).toBeLessThan(bZAfterClick);
  expect(bZAfterClick).toBeLessThan(aZAfterClick);
  await expect(cardA).toHaveAttribute('data-active', 'true');

  // Bの内部要素へフォーカスするとBが前面化する。
  await cardB.getByRole('button', { name: /を元に戻す$/ }).focus();

  const [guideZAfterFocus, aZAfterFocus, bZAfterFocus] = await Promise.all([
    zIndexOf(guide),
    zIndexOf(cardA),
    zIndexOf(cardB),
  ]);
  expect(guideZAfterFocus).toBeLessThan(aZAfterFocus);
  expect(aZAfterFocus).toBeLessThan(bZAfterFocus);
  await expect(cardB).toHaveAttribute('data-active', 'true');
});

test('#regression レイアウト切替でlayer cardが1フレームも消えない', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(page.locator('.input-layer-card')).toHaveCount(1);

  // useEffectでのreconcileはコミット後1フレーム、新配列のpanel stateが
  // 無いまま古いWorkspacePanelがnullを返す瞬間があった。DOM全体を監視して
  // 切替中に記録された最小カード数を後から読む。
  await page.evaluate(() => {
    const w = window as unknown as { __minLayerCardCount: number; __layerCardObserver?: MutationObserver };
    w.__minLayerCardCount = document.querySelectorAll('.input-layer-card').length;
    const observer = new MutationObserver(() => {
      const count = document.querySelectorAll('.input-layer-card').length;
      if (count < w.__minLayerCardCount) w.__minLayerCardCount = count;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    w.__layerCardObserver = observer;
  });

  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(page.locator('.input-layer-card')).toHaveCount(4);

  const minCount = await page.evaluate(() => {
    const w = window as unknown as { __minLayerCardCount: number; __layerCardObserver?: MutationObserver };
    w.__layerCardObserver?.disconnect();
    return w.__minLayerCardCount;
  });
  // 修正前(useEffect reconcile)は切替中に0まで落ちた。
  expect(minCount).toBeGreaterThan(0);
});

test('#regression Keyboardパネルのdocked headerはcheckbox Spaceを飲み込まずheader Enterだけ小窓化する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const panel = page.locator('.input-keyboard-panel');
  const displayHeader = page.getByLabel('表示設定');
  const layerGuideCheckbox = displayHeader.getByLabel('レイヤーカンペ', { exact: true });

  // checkboxへフォーカスしたSpaceは、headerのkeydown guardに飲まれず
  // checkbox自身のtoggleとして届き、panelは小窓化しない。
  await expect(layerGuideCheckbox).toBeChecked();
  await layerGuideCheckbox.focus();
  await page.keyboard.press('Space');
  await expect(layerGuideCheckbox).not.toBeChecked();
  await expect(panel).not.toHaveAttribute('data-floating');

  await layerGuideCheckbox.focus();
  await page.keyboard.press('Space');
  await expect(layerGuideCheckbox).toBeChecked();
  await expect(panel).not.toHaveAttribute('data-floating');

  // header自身へのEnterはガード対象外なので小窓化する。
  await displayHeader.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('data-floating', 'true');
});

test('Recognized detail stays one row when one event realizes multiple inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const output = page.getByLabel('自由入力テキスト');
  const recognizedSection = page.getByLabel('入力詳細', { exact: true })
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
  const recognizedRows = page.getByLabel('入力詳細', { exact: true })
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

  const recognizedSection = page.getByLabel('入力詳細', { exact: true })
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
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const grid = page.locator('.input-layer-guide-grid');
  const columns = async () => grid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns
      .split(' ')
      .filter((track) => track.length > 0)
      .length);
  const setLayoutWithSettingsCollapsed = async (value: string) => {
    if (await settings.locator('.input-settings-body').count() === 0) {
      await settings.getByRole('button', { name: '設定を開く' }).click();
      await expect(settings.locator('.input-settings-body')).toBeVisible();
    }
    await layoutSelect.selectOption(value);
    await expect(feature).toHaveAttribute('data-input-ready', value);
    await settings.getByRole('button', { name: '設定を閉じる' }).click();
    await expect(settings.locator('.input-settings-body')).toHaveCount(0);
  };

  await setLayoutWithSettingsCollapsed('nicola');
  const nicolaCards = page.locator('.input-layer-card');
  await expect(nicolaCards).toHaveCount(2);
  await expect(nicolaCards.nth(0).locator('[data-accent-slot]')).toHaveCount(1);
  await expect(nicolaCards.nth(0).locator('[data-key-id="thumb-l"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(nicolaCards.nth(0).locator('[data-key-id="thumb-r"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(nicolaCards.nth(1).locator('[data-accent-slot]')).toHaveCount(1);
  await expect(nicolaCards.nth(1).locator('[data-key-id="thumb-r"]')).toHaveAttribute('data-accent-slot', /[1-8]/);
  await expect(nicolaCards.nth(1).locator('[data-key-id="thumb-l"]')).not.toHaveAttribute('data-accent-slot', /[1-8]/);
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
  const [homeLegendY, homeMarkY, homeMarkStrokeWidth] = await Promise.all([
    homeLegend.evaluate((element) => Number(element.getAttribute('y'))),
    homeMark.evaluate((element) => Number(element.getAttribute('y1'))),
    homeMark.evaluate((element) => Number.parseFloat(getComputedStyle(element).strokeWidth)),
  ]);
  expect(homeMarkStrokeWidth).toBeGreaterThan(0);
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

test('ランダム練習はモードを保持し別停止ボタンで終了できる', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const assist = page.getByLabel('打ち方逆引き');
  const lookup = page.getByLabel('打ちたい文字');
  const wordButton = page.getByRole('button', { name: 'ランダムな単語' });

  await wordButton.click();
  await expect(wordButton).toHaveAttribute('aria-pressed', 'true');
  await expect(wordButton).toHaveAttribute('data-active', 'true');
  await expect(assist.locator('.input-lookup-field-body'))
    .toHaveAttribute('data-random-practice-mode', 'word');
  await expect(lookup).toHaveValue('あさ');
  await expect(page.getByRole('button', { name: 'ランダム練習を停止' })).toBeVisible();

  const lookupHeading = assist.locator('.input-lookup-field-heading');
  const lookupTitle = lookupHeading.locator('> span').first();
  const randomControls = lookupHeading.locator('.input-random-samples');
  const [lookupTitleBox, randomControlsBox] = await Promise.all([
    lookupTitle.boundingBox(),
    randomControls.boundingBox(),
  ]);
  expect(lookupTitleBox).not.toBeNull();
  expect(randomControlsBox).not.toBeNull();
  const lookupTitleCenterY = lookupTitleBox!.y + lookupTitleBox!.height / 2;
  const randomControlsCenterY = randomControlsBox!.y + randomControlsBox!.height / 2;
  expect(Math.abs(lookupTitleCenterY - randomControlsCenterY)).toBeLessThanOrEqual(1);

  // 選択中の同じボタンは停止ではなく、次のお題へ送る。
  await wordButton.click();
  await expect(lookup).toHaveValue('まど');
  await expect(wordButton).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'ランダム練習を停止' }).click();
  await expect(assist.locator('.input-lookup-field-body'))
    .not.toHaveAttribute('data-random-practice-mode');
  await expect(wordButton).toHaveAttribute('aria-pressed', 'false');
  await expect(lookup).toHaveValue('まど');
  await expect(page.getByRole('button', { name: 'ランダム練習を停止' })).toHaveCount(0);

  // 手動のお題編集でも連続モードだけ解除する。
  await wordButton.click();
  await expect(lookup).toHaveValue('あさ');
  await lookup.fill('かな');
  await expect(wordButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'ランダム練習を停止' })).toHaveCount(0);
});

test('ランダム練習は完全一致後も結果を残しEnterで次題へ進む', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const lookup = page.getByLabel('打ちたい文字');
  const output = page.getByLabel('自由入力テキスト');
  const status = page.getByRole('status');

  await page.getByRole('button', { name: 'ランダムな単語' }).click();
  await expect(lookup).toHaveValue('あさ');
  await expect(status).toContainText('打ち切ったら Enterで次へ');
  await expect(output).toBeFocused();

  await page.keyboard.press('j');
  await expect(output).toHaveValue('あ');
  await expect(lookup).toHaveValue('あさ');

  // 未完了ではEnterを予約するだけで、改行も次題送りもしない。
  await page.keyboard.press('Enter');
  await expect(output).toHaveValue('あ');
  await expect(lookup).toHaveValue('あさ');

  // 「さ」はSandS。完全一致後も結果を残して振り返れる。
  await page.keyboard.down('Space');
  await page.keyboard.press('u');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('あさ');
  await expect(lookup).toHaveValue('あさ');
  await expect(status).toHaveAttribute('data-complete', 'true');
  await expect(status).toContainText('完成！ Enterで次へ');

  await page.keyboard.press('Enter');
  await expect(output).toHaveValue('');
  await expect(lookup).toHaveValue('まど');
  await expect(
    page.getByLabel('打ち方逆引き').locator('.input-lookup-field-body'),
  ).toHaveAttribute('data-random-practice-mode', 'word');
  await expect(status).not.toHaveAttribute('data-complete');
  await expect(output).toBeFocused();
});

test('入力欄はお題を薄く表示し正解・誤入力を位置ごとに示す', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const lookup = page.getByLabel('打ちたい文字');
  const output = page.getByLabel('自由入力テキスト');
  const target = page.getByTestId('typing-target');

  await lookup.fill('かな');
  await expect(output).not.toHaveAttribute('placeholder');
  await expect(target.locator('.input-output-char-pending')).toHaveText(['か', 'な']);
  await expect(target.locator('.input-output-char-correct')).toHaveCount(0);
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);

  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');
  await expect(target.locator('.input-output-char-correct')).toHaveText('か');
  await expect(target.locator('.input-output-char-pending')).toHaveText('な');
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);

  await page.keyboard.press('s');
  await expect(output).toHaveValue('かけ');
  await expect(target.locator('.input-output-char-correct')).toHaveText('か');
  await expect(target.locator('.input-output-char-error')).toHaveText('け');
  await expect(target.locator('.input-output-char-pending')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('か');
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);
  await expect(target.locator('.input-output-char-pending')).toHaveText('な');

  await lookup.fill('');
  await expect(target).toHaveCount(0);
  await expect(output).toHaveAttribute(
    'placeholder',
    'ここをクリックして、そのまま打鍵してください。',
  );
  await expect(output).toHaveValue('か');
});

test('逆引き強調はレイヤーキーの枠色を保持する', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');

  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });
  const layerKey = keyboard.locator('[data-key-id="o"]');
  await expect(layerKey).toHaveAttribute('data-trigger', 'true');
  await expect(layerKey).toHaveAttribute('data-accent-slot', /[1-8]/);

  const strokeBefore = await layerKey.locator('rect').evaluate(
    (element) => getComputedStyle(element).stroke,
  );

  await page.getByLabel('打ちたい文字').fill('にゅ');
  await expect(layerKey).toHaveAttribute('data-lookup', 'true');

  const strokeDuringLookup = await layerKey.locator('rect').evaluate(
    (element) => getComputedStyle(element).stroke,
  );
  expect(strokeDuringLookup).toBe(strokeBefore);

  const outputKey = keyboard.locator('[data-key-id="t"]');
  await expect(outputKey).toHaveAttribute('data-lookup', 'true');
  await expect(outputKey).not.toHaveAttribute('data-trigger');
});

test('打ち方逆引きは配列ごとのcanonical inputを表示する', async ({ page }) => {
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  const lookup = page.getByLabel('打ちたい文字');
  const results = page.getByLabel('打ち方逆引き').locator('.input-lookup-results');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  const keyboard = page.getByRole('img', { name: '現在の物理キー状態' });

  await page.getByRole('button', { name: 'ランダムな単語' }).click();
  const randomWord = await lookup.inputValue();
  expect([...randomWord].length).toBeGreaterThanOrEqual(2);
  expect([...randomWord].length).toBeLessThanOrEqual(10);
  expect(randomWord).not.toMatch(/[。、！？!?，,\s]/u);

  await page.getByRole('button', { name: 'ランダムな文章' }).click();
  const randomPhrase = await lookup.inputValue();
  expect([...randomPhrase].length).toBeGreaterThanOrEqual(5);
  expect([...randomPhrase].length).toBeLessThanOrEqual(15);

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

  // ガイド通りに実際に打鍵できたら、次の入力単位へ自動で進む。
  const output = page.getByLabel('自由入力テキスト');
  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');
  await expect(guide).toContainText('2 / 2');
  await expect(guide).toContainText('な');
  await expect(keyboard.locator('[data-key-id="m"]')).toHaveAttribute('data-lookup', 'true');

  // 誤タイプはguideを進めず、その誤字だけをBSで消してもguide位置を維持する。
  await page.keyboard.press('s');
  await expect(output).toHaveValue('かけ');
  await expect(guide).toContainText('2 / 2');
  await expect(guide).toContainText('な');

  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('か');
  await expect(guide).toContainText('2 / 2');
  await expect(guide).toContainText('な');

  // 正しく一致していた文字を消した時だけ、その出力stepへ戻る。
  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('');
  await expect(guide).toContainText('1 / 2');
  await expect(guide).toContainText('か');
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-lookup', 'true');

  // 空入力でBSを連打してもguideは動かない。
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('');
  await expect(guide).toContainText('1 / 2');
  await expect(guide).toContainText('か');

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

  // 月配列のprefixは文字単位ではなくaction単位でguideする。
  await page.getByLabel('配列', { exact: true }).selectOption('tsuki-2-263');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await lookup.fill('よ');
  await expect(guide).toContainText('1 / 2');
  await expect(guide).toContainText('K');
  await expect(keyboard.locator('[data-key-id="k"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="g"]')).not.toHaveAttribute('data-lookup', 'true');
  await output.click();
  await page.keyboard.press('k');
  await expect(guide).toContainText('2 / 2');
  await expect(guide).toContainText('G');
  await expect(keyboard.locator('[data-key-id="g"]')).toHaveAttribute('data-lookup', 'true');

  // 左右どちらでもよいSpaceはrouteを畳み、guideでも特定の親指を推奨しない。
  await page.getByLabel('配列', { exact: true }).selectOption('naginata-v18');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await lookup.fill('ま');
  await expect(results.locator('li')).toHaveCount(1);
  await expect(guide).toContainText('Space + F');
  await expect(guide).not.toContainText('右親指');
  await expect(guide).not.toContainText('左親指');
  await expect(keyboard.locator('[data-key-id="f"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="thumb-l"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="thumb-r"]')).toHaveAttribute('data-lookup', 'true');
  const naginataLeftSlot = await keyboard.locator('[data-key-id="thumb-l"]')
    .getAttribute('data-accent-slot');
  const naginataRightSlot = await keyboard.locator('[data-key-id="thumb-r"]')
    .getAttribute('data-accent-slot');
  expect(naginataLeftSlot).not.toBeNull();
  expect(naginataLeftSlot).toBe(naginataRightSlot);
  await expect(page.locator('.input-layer-card').first()).toContainText('trigger: Space');

  // 新JISも左右Spaceを同一presentation layerとして扱う。
  await page.getByLabel('配列', { exact: true }).selectOption('shin-jis-simultaneous');
  await expect(feature).toHaveAttribute('data-input-ready', 'shin-jis-simultaneous');
  await lookup.fill('お');
  await expect(guide).toContainText('Space + J');
  await expect(guide).not.toContainText('右親指');
  await expect(guide).not.toContainText('左親指');
  await expect(keyboard.locator('[data-key-id="j"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="thumb-l"]')).toHaveAttribute('data-lookup', 'true');
  await expect(keyboard.locator('[data-key-id="thumb-r"]')).toHaveAttribute('data-lookup', 'true');
  const shinJisLeftSlot = await keyboard.locator('[data-key-id="thumb-l"]')
    .getAttribute('data-accent-slot');
  const shinJisRightSlot = await keyboard.locator('[data-key-id="thumb-r"]')
    .getAttribute('data-accent-slot');
  expect(shinJisLeftSlot).not.toBeNull();
  expect(shinJisLeftSlot).toBe(shinJisRightSlot);
  await expect(page.locator('.input-layer-card').first()).toContainText('trigger: Space');

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
  await expect(output).toHaveValue('け');

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await page.getByLabel('配列', { exact: true }).selectOption('nicola');
  await expect(feature).toHaveAttribute('data-input-ready', 'nicola');
  await output.click();
  await page.keyboard.down('Space');
  await page.keyboard.press('s');
  await page.keyboard.up('Space');
  await expect(output).toHaveValue('あ');

  await page.getByRole('button', { name: 'クリア' }).click();
  await output.click();
  await page.keyboard.press('q');
  await expect(output).toHaveValue('け');
});

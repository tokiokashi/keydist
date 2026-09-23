import { expect, test } from '@playwright/test';

test('Tester restores selected layout and physical geometry after reload', async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  const layoutSelect = page.getByLabel('配列', { exact: true });
  const geometrySelect = page.getByLabel('物理配列');

  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await layoutSelect.selectOption('tsuki-2-263');
  await geometrySelect.selectOption('column-staggered');
  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await expect(layoutSelect).toHaveValue('tsuki-2-263');
  await expect(geometrySelect).toHaveValue('column-staggered');

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('keydist:input-converter-preferences');
    return raw === null ? null : JSON.parse(raw);
  })).toMatchObject({
    version: 2,
    layoutId: 'tsuki-2-263',
    geometryId: 'column-staggered',
    layouts: {
      'tsuki-2-263': {
        showDynamicGuide: true,
        showLayerGuide: true,
        showLayerKeys: true,
        showShiftKeys: false,
        inputText: '',
        practiceText: '',
        randomPracticeMode: null,
      },
    },
  });

  await page.reload();

  await expect(feature).toHaveAttribute('data-input-ready', 'tsuki-2-263');
  await expect(layoutSelect).toHaveValue('tsuki-2-263');
  await expect(geometrySelect).toHaveValue('column-staggered');
});

const STORAGE_KEY = 'keydist:workspace-state';

/** dragging解除後のscale springが収まるのを待つ（既存e2eの慣例に合わせる） */
async function waitForSpringSettle(page: import('@playwright/test').Page) {
  await page.waitForTimeout(350);
}

function isRealConsoleError(text: string): boolean {
  // 開発サーバーの favicon 等、本機能と無関係な404はノイズなので除く
  return !/Failed to load resource/.test(text);
}

test('reload restores floating rect, mode and z-order (#413 phase5)', async ({ page }) => {
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

  // input.lookup を小窓化して動かす
  const lookupPanel = page.getByLabel('Practice Text', { exact: true });
  await page
    .getByLabel('Practice Textをクリックまたはドラッグして小窓表示')
    .getByText('Practice Text', { exact: true })
    .click();
  await expect(lookupPanel).toHaveAttribute('data-floating', 'true');
  const lookupMove = page.getByLabel('Practice Textを移動');
  let box = await lookupMove.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 220, box!.y + 140);
  await page.mouse.up();

  // レイヤーカンペの個別カード(SandS)も小窓化して動かす
  const cardPanel = page.getByLabel('SandS 個別カンペ', { exact: true });
  await page.getByLabel('SandSを小窓表示').click();
  await expect(cardPanel).toHaveAttribute('data-floating', 'true');
  const cardMove = page.getByLabel('SandSカンペを移動');
  box = await cardMove.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 180, box!.y + 90);
  await page.mouse.up();
  await waitForSpringSettle(page);

  // lookupを最後にactivateし、z-orderの最前面をlookupにする
  await lookupMove.click();
  await waitForSpringSettle(page);

  const lookupRectBefore = await lookupPanel.boundingBox();
  const cardRectBefore = await cardPanel.boundingBox();
  expect(lookupRectBefore).not.toBeNull();
  expect(cardRectBefore).not.toBeNull();
  const zBefore = await Promise.all([
    lookupPanel.evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10)),
    cardPanel.evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10)),
  ]);
  expect(zBefore[0]).toBeGreaterThan(zBefore[1]);

  consoleMessages.length = 0; // reload以降のログだけを見る
  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(lookupPanel).toHaveAttribute('data-floating', 'true');
  await expect(cardPanel).toHaveAttribute('data-floating', 'true');

  const lookupRectAfter = await lookupPanel.boundingBox();
  const cardRectAfter = await cardPanel.boundingBox();
  expect(lookupRectAfter).not.toBeNull();
  expect(cardRectAfter).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.round(lookupRectAfter![key])).toBe(Math.round(lookupRectBefore![key]));
    expect(Math.round(cardRectAfter![key])).toBe(Math.round(cardRectBefore![key]));
  }

  const zAfter = await Promise.all([
    lookupPanel.evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10)),
    cardPanel.evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10)),
  ]);
  expect(zAfter[0]).toBeGreaterThan(zAfter[1]);

  await page.waitForTimeout(150);
  const hydrationWarnings = consoleMessages.filter((text) => /hydrat/i.test(text));
  expect(hydrationWarnings).toEqual([]);
});

test('a window blur mid-drag commits the in-flight move so the next drag does not jump', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const lookupPanel = page.getByLabel('Practice Text', { exact: true });
  await page
    .getByLabel('Practice Textをクリックまたはドラッグして小窓表示')
    .getByText('Practice Text', { exact: true })
    .click();
  await expect(lookupPanel).toHaveAttribute('data-floating', 'true');
  await waitForSpringSettle(page);

  const lookupMove = page.getByLabel('Practice Textを移動');
  const box = await lookupMove.boundingBox();
  expect(box).not.toBeNull();

  // dragを開始し、~160px動かした状態でwindow blurを発火する（pointerupより前）。
  // transient DOM styleはこの時点で動いているが、state/localStorageはまだ更新されていない。
  // floatした直後のPractice Textは画面の右下寄りに位置するため、余白のある左上方向へ動かす。
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60 - 90, box!.y + box!.height / 2 - 40);
  await page.mouse.move(box!.x + 60 - 160, box!.y + box!.height / 2 - 80);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  // blur時点（pointerupより前）でpointer captureが解放されていることを確認する。
  // 解放し忘れると、マウスボタンを離さないまま他panelへ移動してもそちらが
  // pointer eventを受け取れなくなる。
  const hasPointerCaptureAfterBlur = await lookupMove.evaluate(
    (el) => (el as HTMLElement).hasPointerCapture(1),
  );
  expect(hasPointerCaptureAfterBlur).toBe(false);

  await page.mouse.up();
  await waitForSpringSettle(page);

  const visibleRectAfterBlur = await lookupPanel.boundingBox();
  expect(visibleRectAfterBlur).not.toBeNull();

  // debounced persistence writeが終わるのを待ち、localStorageのrectが
  // blur直後に見えている位置と一致することを確認する（stateが取り残されていない）。
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as {
          panels: Record<string, { rect?: { x: number; y: number; width: number; height: number } }>;
        };
        const rect = parsed.panels['input.lookup']?.rect;
        return rect === undefined ? null : { x: Math.round(rect.x), y: Math.round(rect.y) };
      },
      { timeout: 2000 },
    )
    .toEqual({
      x: Math.round(visibleRectAfterBlur!.x),
      y: Math.round(visibleRectAfterBlur!.y),
    });

  // 次の小さなdragが「見えている位置」からの相対移動になっている（stateへ取り残された
  // 古いrectへ飛び直さない）ことを確認する。
  const beforeSecondDrag = await lookupPanel.boundingBox();
  const move2 = page.getByLabel('Practice Textを移動');
  const box2 = await move2.boundingBox();
  expect(box2).not.toBeNull();
  await page.mouse.move(box2!.x + 60, box2!.y + box2!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box2!.x + 60 - 40, box2!.y + box2!.height / 2 - 20);
  await page.mouse.up();
  await waitForSpringSettle(page);
  const afterSecondDrag = await lookupPanel.boundingBox();
  expect(afterSecondDrag).not.toBeNull();
  expect(Math.round(afterSecondDrag!.x - beforeSecondDrag!.x)).toBe(-40);
  expect(Math.round(afterSecondDrag!.y - beforeSecondDrag!.y)).toBe(-20);
});

test('restoring into a smaller viewport clamps the floating rect back into view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const lookupPanel = page.getByLabel('Practice Text', { exact: true });
  await page
    .getByLabel('Practice Textをクリックまたはドラッグして小窓表示')
    .getByText('Practice Text', { exact: true })
    .click();
  const lookupMove = page.getByLabel('Practice Textを移動');
  const box = await lookupMove.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  // FHDの右下隅近くまで動かしておく
  await page.mouse.move(1300, 800);
  await page.mouse.up();
  await waitForSpringSettle(page);

  const beforeShrink = await lookupPanel.boundingBox();
  expect(beforeShrink).not.toBeNull();
  expect(beforeShrink!.x).toBeGreaterThan(700);

  await page.setViewportSize({ width: 600, height: 500 });
  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(lookupPanel).toHaveAttribute('data-floating', 'true');

  const afterReload = await lookupPanel.boundingBox();
  expect(afterReload).not.toBeNull();
  expect(afterReload!.x).toBeGreaterThanOrEqual(0);
  expect(afterReload!.y).toBeGreaterThanOrEqual(0);
  expect(afterReload!.x + afterReload!.width).toBeLessThanOrEqual(600);
  expect(afterReload!.y + afterReload!.height).toBeLessThanOrEqual(500);
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
  // 既定はすべてdocked
  await expect(page.getByLabel('Practice Text', { exact: true })).not.toHaveAttribute('data-floating');

  expect(errors).toEqual([]);
});

test('an unsupported version value also falls back to defaults with no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && isRealConsoleError(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 999, panels: {}, zOrder: [] }));
  }, STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(page.getByLabel('Practice Text', { exact: true })).not.toHaveAttribute('data-floating');
  expect(errors).toEqual([]);
});

test('no in-progress layout animation right after a restoring reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const lookupPanel = page.getByLabel('Practice Text', { exact: true });
  await page
    .getByLabel('Practice Textをクリックまたはドラッグして小窓表示')
    .getByText('Practice Text', { exact: true })
    .click();
  const lookupMove = page.getByLabel('Practice Textを移動');
  const box = await lookupMove.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 300, box!.y + 160);
  await page.mouse.up();
  await waitForSpringSettle(page);
  const expectedRect = await lookupPanel.boundingBox();
  expect(expectedRect).not.toBeNull();

  await page.reload();
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(lookupPanel).toHaveAttribute('data-floating', 'true');

  // 復元直後、通常のドック位置からfloating位置へ「飛ぶ」アニメーションが無ければ、
  // 最初に観測できた時点で既に最終位置にいるはず。
  const firstBox = await lookupPanel.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(Math.round(firstBox!.x)).toBe(Math.round(expectedRect!.x));
  expect(Math.round(firstBox!.y)).toBe(Math.round(expectedRect!.y));

  // springアニメーションが本来収まる時間を置いても位置が動いていないことを確認する。
  await page.waitForTimeout(250);
  const settledBox = await lookupPanel.boundingBox();
  expect(settledBox).not.toBeNull();
  expect(Math.round(settledBox!.x)).toBe(Math.round(firstBox!.x));
  expect(Math.round(settledBox!.y)).toBe(Math.round(firstBox!.y));
});

test('layer definitions settle before reconcile: switching A -> B -> A restores the floating layer card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/input');
  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  await page.getByLabel('SandSを小窓表示').click();
  const cardPanel = page.getByLabel('SandS 個別カンペ', { exact: true });
  await expect(cardPanel).toHaveAttribute('data-floating', 'true');
  const moveHandle = page.getByLabel('SandSカンペを移動');
  const box = await moveHandle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 220, box!.y + 130);
  await page.mouse.up();
  await waitForSpringSettle(page);
  const rectA = await cardPanel.boundingBox();
  expect(rectA).not.toBeNull();

  // layout B: naginata-v18のSandSカードとidが重ならないshingetaへ切り替える(dormant化)
  await page.getByLabel('配列', { exact: true }).selectOption('shingeta');
  await expect(feature).toHaveAttribute('data-input-ready', 'shingeta');
  await expect(cardPanel).toHaveCount(0);

  // layout A: 元へ戻すと同じidのdefinitionが復活し、dormant状態が復元される
  await page.getByLabel('配列', { exact: true }).selectOption('naginata-v18');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');
  await expect(cardPanel).toHaveAttribute('data-floating', 'true');

  const rectB = await cardPanel.boundingBox();
  expect(rectB).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.round(rectB![key])).toBe(Math.round(rectA![key]));
  }
});

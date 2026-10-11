import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings, toggleTarget } from './pane-helper.ts';

/**
 * 打鍵再生のE2E。時間の決め方・配列図に出す値はunit test（`playback.test.ts`）で固定しているので、
 * ここでは画面の配線（操作・再生位置の表示・表示設定の反映・解析設定の小窓のEscape）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const position = (page: Page) => feature(page).locator('[data-playback-position]');

/** 「3 / 120ステップ」から [3, 120] を読む。 */
async function readPosition(page: Page): Promise<[number, number]> {
  const text = (await position(page).textContent()) ?? '';
  const match = /^(\d+) \/ (\d+)ステップ$/.exec(text.trim());
  expect(match, text).not.toBeNull();
  return [Number(match![1]), Number(match![2])];
}

async function openPlayback(page: Page) {
  await page.goto('/standalone/playback');
  await expect(page.getByRole('heading', { name: '打鍵再生', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
}

test('1ステップ進む・戻る・シークができ、再生位置が表示される', async ({ page }) => {
  await openPlayback(page);
  const [start, total] = await readPosition(page);
  expect(start).toBe(0);
  expect(total).toBeGreaterThan(3);

  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(2);
  // 押したキーは配列図で強調される
  await expect(feature(page).locator('[data-playback-active="true"]').first()).toBeVisible();

  await feature(page).locator('[data-playback-action="back"]').click();
  expect((await readPosition(page))[0]).toBe(1);

  await feature(page).locator('[data-playback-seek]').fill('3');
  expect((await readPosition(page))[0]).toBe(3);
  await feature(page).locator('[data-playback-seek]').fill(String(total));
  expect(await readPosition(page)).toEqual([total, total]);
  // 最後まで進むと、進む操作と再生は押せない
  await expect(feature(page).locator('[data-playback-action="forward"]')).toBeDisabled();
  await expect(feature(page).locator('[data-playback-action="toggle"]')).toBeDisabled();
});

test('再生すると位置が進み、一時停止で止まり、停止で先頭へ戻る', async ({ page }) => {
  await openPlayback(page);
  const toggle = feature(page).locator('[data-playback-action="toggle"]');
  await toggle.click();
  await expect(toggle).toContainText('一時停止');
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(0);
  // 再生中は1ステップの移動ができない
  await expect(feature(page).locator('[data-playback-action="forward"]')).toBeDisabled();

  await toggle.click();
  await expect(toggle).toContainText('再生');
  const paused = (await readPosition(page))[0];
  await page.waitForTimeout(1200);
  expect((await readPosition(page))[0]).toBe(paused);

  await feature(page).locator('[data-playback-action="stop"]').click();
  expect((await readPosition(page))[0]).toBe(0);
  await expect(feature(page).locator('[data-playback-action="stop"]')).toBeDisabled();
});

test('表示設定を変えると表示だけが変わり、再生位置は保たれる。解析設定の小窓はEscapeで閉じる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(3);

  const keyboard = feature(page).locator('svg.playback-keyboard');
  const widthBefore = Number(await keyboard.getAttribute('width'));

  const settings = await openSettings(page);
  // 表示設定の4種類の項目
  await expect(settings.getByRole('checkbox', { name: 'Chainの動的表示' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: 'Arpeggioの動的表示' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: '同指移動の動的表示' })).toBeVisible();
  await expect(settings.getByRole('combobox', { name: '押下フィードバック' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: '指位置の準備時間' })).toBeVisible();
  await settings.getByRole('slider', { name: '倍率' }).fill('2');

  // 倍率が変わっても、再生位置は先頭へ戻らない
  await expect.poll(async () => Number(await keyboard.getAttribute('width'))).toBeCloseTo(widthBefore * 2, 3);
  expect((await readPosition(page))[0]).toBe(3);
  await settings.getByRole('checkbox', { name: 'Chainの動的表示' }).check();
  await settings.getByRole('combobox', { name: '押下フィードバック' }).selectOption('bounce');
  expect((await readPosition(page))[0]).toBe(3);

  await settings.press('Escape');
  await expect(page.locator('[data-settings-window="true"]')).toHaveCount(0);
});

test('対象を替えて抽出が作り直されると、再生位置は先頭へ戻る', async ({ page }) => {
  await openPlayback(page);
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(2);
  await toggleTarget(page, 'layout:dvorak');
  await expect.poll(async () => (await readPosition(page))[0]).toBe(0);
});

test('幅390pxでも、倍率を上げてもページは横にはみ出さず、図の領域の中でスクロールできる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/standalone/playback?scale=3');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const figure = feature(page).locator('.playback-figure');
  expect(await figure.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
});

test('Workspaceのペインとして追加でき、ペインごとに独立して再生位置を持つ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: /打鍵再生/ }).click();
  }
  await expect(feature(page)).toHaveCount(2, { timeout: 10_000 });

  const first = feature(page).nth(0);
  const second = feature(page).nth(1);
  await first.locator('[data-playback-action="forward"]').click();
  await first.locator('[data-playback-action="forward"]').click();
  await expect(first.locator('[data-playback-position]')).toContainText(/^2 \//);
  await expect(second.locator('[data-playback-position]')).toContainText(/^0 \//);
});

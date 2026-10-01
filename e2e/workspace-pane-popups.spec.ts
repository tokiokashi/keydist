import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceで、ペインの外へ出るポップアップ（条件のモーダル内のプリセットの⋯メニュー、タブのⓘの説明）が
 * 開いた場所の近くに出て、画面の中に収まること。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const flow = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: fixedSingle });
const group = (id: string, weight = 1) => ({ kind: 'group', paneIds: [id], weight });
const split = (direction: 'row' | 'column', ...children: unknown[]) => ({ kind: 'split', direction, weight: 1, children });

async function openWorkspace(page: Page, panes: readonly unknown[], layout: unknown, size: { width: number; height: number }, extra: Record<string, unknown> = {}): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'p', name: 'ポップアップ', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout, ...extra });
  await page.goto('/workspace/p');
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

test('条件のモーダルのプリセットの⋯は、左端の列でも右端の列でもボタンの下に開き、ダイアログに収まる', async ({ page }) => {
  const ids = ['a', 'b', 'c', 'd'];
  await openWorkspace(page, ids.map(flow), split('row', ...ids.map((id) => group(id))), { width: 1440, height: 900 });
  await expect(page.locator('.dv-groupview')).toHaveCount(4);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(4, { timeout: 15_000 });

  for (const column of [0, 3]) {
    const pane = page.locator('.pane-frame').nth(column);
    await pane.locator('.pane-condition-trigger').click();
    const modal = page.getByRole('dialog', { name: '条件' });
    await expect(modal).toBeVisible();
    const section = modal.locator('[data-condition-presets]');
    if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
    if (column === 0) {
      await section.getByLabel('プリセットの名前').fill('試し');
      await section.getByRole('button', { name: '今の全体の値を保存' }).click();
    }
    const row = section.locator('.condition-preset-row').filter({ hasText: '試し' });
    await expect(row).toBeVisible();
    const trigger = row.getByRole('button', { name: '「試し」の操作' });
    await trigger.click();
    const list = row.getByRole('menu');
    await expect(list).toBeVisible();

    const dialog = await box(modal);
    const button = await box(trigger);
    const menu = await box(list);
    // ボタンの右端に揃って開く（枠を基準にずらさない）。ダイアログの外へ切れない
    expect(Math.abs(menu.x + menu.width - (button.x + button.width))).toBeLessThanOrEqual(1);
    expect(menu.x).toBeGreaterThanOrEqual(dialog.x);
    expect(menu.x + menu.width).toBeLessThanOrEqual(dialog.x + dialog.width);
    await expect(list.getByRole('menuitem', { name: '削除' })).toBeInViewport({ ratio: 1 });

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  }
});

/** 板を伸ばして、ペインを縦に3つ並べる（ページがスクロールする）。 */
async function openTall(page: Page): Promise<void> {
  await openWorkspace(page, ['a', 'b', 'c'].map(flow), split('column', group('a'), group('b'), group('c')), { width: 1440, height: 600 }, { boardHeightRem: 90 });
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
}

const popover = (page: Page) => page.getByRole('tooltip');

test('タブのⓘで出した説明は、スクロールしてもⓘに付いてくる。説明を押しても閉じない', async ({ page }) => {
  await openTall(page);
  // 一番上のペインのⓘは窓の上寄りにあるので、説明は下に出る
  const info = page.locator('.dv-groupview').first().locator('.dv-tab').getByRole('button', { name: /の説明$/ });
  await info.click();
  await expect(popover(page)).toBeVisible();
  const gap = async () => (await box(popover(page))).y - (await box(info)).y - (await box(info)).height;
  expect(Math.abs((await gap()) - 6)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollBy(0, 90));
  await expect.poll(async () => Math.abs((await gap()) - 6)).toBeLessThanOrEqual(1);

  // 説明そのものを押しても、出したままの説明は閉じない
  await popover(page).click();
  await expect(popover(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(popover(page)).toBeHidden();
});

test('窓の下端に近いⓘの説明は、ⓘの上に出て窓に収まる', async ({ page }) => {
  await openTall(page);
  const info = page.locator('.dv-groupview').nth(1).locator('.dv-tab').getByRole('button', { name: /の説明$/ });
  await info.scrollIntoViewIfNeeded();
  // ⓘが窓の下端から30pxの所に来るまでスクロールする
  const target = await info.evaluate((el) => el.getBoundingClientRect().bottom - (window.innerHeight - 30));
  await page.evaluate((dy) => window.scrollBy(0, dy), target);
  await info.click();
  await expect(popover(page)).toBeVisible();
  const infoBox = await box(info);
  const tip = await box(popover(page));
  expect(infoBox.y + infoBox.height).toBeGreaterThan(560);
  expect(tip.y + tip.height).toBeLessThanOrEqual(infoBox.y);
  expect(tip.y).toBeGreaterThanOrEqual(0);

  // スクロールで窓の下端から離れると、下へ戻る
  await page.evaluate(() => window.scrollBy(0, 200));
  await expect.poll(async () => (await box(popover(page))).y).toBeGreaterThan((await box(info)).y);
});

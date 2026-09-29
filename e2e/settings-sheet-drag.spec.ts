import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * スマホ幅の「解析設定」は下から出るシートで、上端の掴みを下へドラッグすると閉じる。
 * 閾値（高さの1/3）を超えれば閉じ、超えなければ元の位置へ戻る。
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SHEET = '[data-settings-window="true"]';
const settingsButton = (page: Page) => page.getByRole('button', { name: '解析設定', exact: true });

async function openSheet(page: Page) {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await settingsButton(page).click();
  await expect(page.locator(SHEET)).toBeVisible();
  await expect(page.locator(SHEET)).toBeFocused();
}

/** 要素の中心から下へ`dy`だけ、pointerイベントで引く。`release`がfalseなら放さずに止める。 */
async function drag(target: Locator, dy: number, options: { release?: boolean; gapMs?: number; offsetY?: number } = {}) {
  const box = (await target.boundingBox())!;
  await target.evaluate(async (el, args) => {
    const fire = (type: string, clientY: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: args.x, clientY }));
    fire('pointerdown', args.y);
    const steps = 6;
    for (let i = 1; i <= steps; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, args.gapMs));
      fire('pointermove', args.y + (args.dy * i) / steps);
    }
    if (args.release) fire('pointerup', args.y + args.dy);
  }, {
    x: box.x + 20,
    y: box.y + (options.offsetY ?? box.height / 2),
    dy,
    release: options.release ?? true,
    gapMs: options.gapMs ?? 200,
  });
}

const grabber = (page: Page) => page.locator('.settings-sheet-grabber');

test('掴みを下へ大きくドラッグすると閉じ、フォーカスは「解析設定」ボタンへ戻る', async ({ page }) => {
  await openSheet(page);
  const height = (await page.locator(SHEET).boundingBox())!.height;
  await drag(grabber(page), Math.ceil(height / 2));
  await expect(page.locator(SHEET)).toHaveCount(0);
  await expect(settingsButton(page)).toBeFocused();
});

test('速い下向きのフリックでも閉じる', async ({ page }) => {
  await openSheet(page);
  await drag(grabber(page), 60, { gapMs: 5 });
  await expect(page.locator(SHEET)).toHaveCount(0);
});

test('少しだけドラッグして放すと、元の位置へ戻る', async ({ page }) => {
  await openSheet(page);
  const before = (await page.locator(SHEET).boundingBox())!;
  await drag(grabber(page), 30);
  await expect(page.locator(SHEET)).toBeVisible();
  await expect.poll(async () => (await page.locator(SHEET).boundingBox())!.y).toBeCloseTo(before.y, 0);
});

test('引いて指を止めてから離すと、元の位置へ戻る', async ({ page }) => {
  await openSheet(page);
  await grabber(page).evaluate(async (el) => {
    const box = el.getBoundingClientRect();
    const x = box.x + 20;
    const y = box.y + box.height / 2;
    const fire = (type: string, clientY: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: x, clientY }));
    fire('pointerdown', y);
    await new Promise((resolve) => setTimeout(resolve, 5));
    fire('pointermove', y + 40);
    await new Promise((resolve) => setTimeout(resolve, 800));
    fire('pointerup', y + 40);
  });
  // 閉じる場合はアニメーションの後に消えるので、その分を待ってから残っていることを確かめる。
  await page.waitForTimeout(600);
  await expect(page.locator(SHEET)).toBeVisible();
});

test('掴みはTabと読み上げの対象にならない', async ({ page }) => {
  await openSheet(page);
  await expect(grabber(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(grabber(page)).not.toHaveAttribute('tabindex', /.*/);
});

test('ヘッダー行のドラッグでも閉じ、本文のドラッグでは閉じない', async ({ page }) => {
  await openSheet(page);
  const height = (await page.locator(SHEET).boundingBox())!.height;
  await drag(page.locator('.settings-window-body'), height, { offsetY: 20 });
  await expect(page.locator(SHEET)).toBeVisible();
  await drag(page.locator('.settings-window-handle'), height);
  await expect(page.locator(SHEET)).toHaveCount(0);
});

test('×で閉じるとフォーカスは「解析設定」ボタンへ戻る', async ({ page }) => {
  await openSheet(page);
  await page.locator(SHEET).getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(page.locator(SHEET)).toHaveCount(0);
  await expect(settingsButton(page)).toBeFocused();
});

test('Escapeで閉じるとフォーカスは「解析設定」ボタンへ戻る', async ({ page }) => {
  await openSheet(page);
  await page.keyboard.press('Escape');
  await expect(page.locator(SHEET)).toHaveCount(0);
  await expect(settingsButton(page)).toBeFocused();
});

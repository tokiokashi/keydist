import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { dismissAutoOpenedSelection, openSettings, openTargetSelection } from './pane-helper.ts';

/**
 * 解析設定と対象の選択は、スマホ幅（760px以下）では画面下からのシート、それより広いと小窓・ポップオーバーで開く。
 * 境目は縦積み・見出し1行と同じ。境目の両側（760と761）と、旧い境目（640と641）の間（700）を見る。
 */

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/standalone/comparison');
  await waitForHydration(page);
}

/** 画面の下端と左右の端にぴったり付いているか（シートの形）。 */
async function isSheet(locator: Locator, width: number): Promise<boolean> {
  const box = (await locator.boundingBox())!;
  return Math.round(box.x) === 0 && Math.round(box.width) === width && Math.round(box.y + box.height) === 844;
}

for (const width of [641, 700, 760]) {
  test(`${width}px: 解析設定と対象の選択は下からのシートで開く`, async ({ page }) => {
    await open(page, width);
    const selection = await openTargetSelection(page);
    expect(await isSheet(selection, width)).toBe(true);
    await dismissAutoOpenedSelection(page);
    const settings = await openSettings(page);
    expect(await isSheet(settings, width)).toBe(true);
  });
}

for (const width of [761, 1024]) {
  test(`${width}px: 解析設定は小窓、対象の選択はポップオーバーで開く`, async ({ page }) => {
    await open(page, width);
    const selection = await openTargetSelection(page);
    expect(await isSheet(selection, width)).toBe(false);
    await dismissAutoOpenedSelection(page);
    const settings = await openSettings(page);
    expect(await isSheet(settings, width)).toBe(false);
  });
}

import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * スマホ幅（〜760px）の文脈バーとペインの見出しは、どちらも1行に収まる。
 * 1行の高さは、チップ・ボタン（2rem）に余白を足した程度。2段になると倍近くになる。
 */
test.use({ viewport: { width: 390, height: 844 } });

const PAGES = ['bigram-flow', 'comparison', 'n-sensitivity'] as const;

async function openReady(page: Page, path: string) {
  await page.goto(`/standalone/${path}`);
  await waitForHydration(page);
  // 資産の読み込みが済むまでバーの操作は効かない。読み込み後にだけ測る／押す。
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
}

for (const path of PAGES) {
  test(`スマホ幅の${path}: 文脈バーとペインの見出しが1行に収まり、横にあふれない`, async ({ page }) => {
    await openReady(page, path);

    const bar = await page.locator('.context-bar').boundingBox();
    const header = await page.locator('.pane-frame-header').boundingBox();
    expect(bar?.height).toBeLessThan(56);
    expect(header?.height).toBeLessThan(40);

    // 1行の中に、テキスト・既定の物理配列・⋯（文脈バー）と、対象・解析設定・⋯（見出し）が並ぶ。
    const barTops = await Promise.all([
      page.locator('.context-bar button.text-chip').boundingBox(),
      page.locator('.context-bar .context-select-chip').boundingBox(),
      page.getByRole('button', { name: '画面のメニュー' }).boundingBox(),
    ]);
    for (const box of barTops) expect(Math.abs((box?.y ?? -100) - (barTops[0]?.y ?? 0))).toBeLessThan(8);
    const headerTops = await Promise.all([
      page.locator('.pane-frame-title').boundingBox(),
      page.locator('.pane-frame-target').boundingBox(),
      page.getByRole('button', { name: '解析設定' }).boundingBox(),
    ]);
    for (const box of headerTops) expect(Math.abs((box?.y ?? -100) - (headerTops[0]?.y ?? 0))).toBeLessThan(20);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('スマホ幅: 物理配列は短い名前で出て、選ぶと変わる', async ({ page }) => {
  await openReady(page, 'bigram-flow');
  const chip = page.locator('.context-bar .context-select-chip');
  await expect(chip.locator('.context-select-short')).toHaveText('ロウ（ANSI）');
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');
  await expect(chip.locator('.context-select-short')).toHaveText('オーソリニア（ANSI）');
});

test('スマホ幅: ⋯のメニューから元に戻す・やり直す・共有が使える', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openReady(page, 'bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');

  // パソコン幅の並びはスマホ幅では出ない。
  await expect(bar.getByRole('button', { name: '共有', exact: true })).toBeHidden();
  await expect(bar.getByRole('button', { name: '元に戻す' })).toBeHidden();

  const menuButton = page.getByRole('button', { name: '画面のメニュー' });
  await menuButton.click();
  await expect(page.getByRole('menuitem', { name: '元に戻す' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'やり直す' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');

  await menuButton.click();
  await page.getByRole('menuitem', { name: '元に戻す' }).click();
  await expect(chip).toContainText('吾輩は猫である');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await menuButton.click();
  await page.getByRole('menuitem', { name: 'やり直す' }).click();
  await expect(chip).toContainText('英文');

  await menuButton.click();
  await page.getByRole('menuitem', { name: '共有' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/standalone/bigram-flow');
});

test.describe('パソコン幅', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('操作は右端に並び、⋯のメニューは出ない', async ({ page }) => {
    await openReady(page, 'bigram-flow');
    const bar = page.locator('.context-bar');
    await expect(bar.getByRole('button', { name: '共有', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: '元に戻す' })).toBeVisible();
    await expect(page.getByRole('button', { name: '画面のメニュー' })).toBeHidden();
    const header = await page.locator('.pane-frame-header').boundingBox();
    expect(header?.height).toBeLessThan(40);
  });
});

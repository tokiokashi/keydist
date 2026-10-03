import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ペインの推奨幅（既定64rem、比較表だけ96rem）。
 * 推奨幅より広い時は止まって中央へ寄り、狭い時はスクロールを出さずに縮む。
 * 個別画面とWorkspaceのペインの両方で確かめる。
 */

const REM = 16;
const LAYOUTS = ['qwerty', 'dvorak', 'colemak-dh'];

function seedTargets(page: Page) {
  return page.addInitScript((ids) => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: ids.map((layoutId) => ({ kind: 'layout', layoutId })) }),
    );
  }, LAYOUTS);
}

async function box(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, width: b.width };
  });
}

const cases = [
  { route: 'n-sensitivity', limit: 64 },
  { route: 'comparison', limit: 96 },
];

for (const { route, limit } of cases) {
  test(`個別画面 ${route}: 2560pxでも推奨幅（${limit}rem）で止まり、中央に寄る`, async ({ page }) => {
    await seedTargets(page);
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`/standalone/${route}`);
    await waitForHydration(page);
    await expect(page.locator('.pane-body')).toBeVisible();
    const frame = await box(page, '.standalone-stage .pane-frame');
    expect(Math.round(frame.width)).toBe(limit * REM);
    const body = await box(page, '.pane-body');
    expect(body.width).toBeLessThanOrEqual(limit * REM);
    const stage = await box(page, '.standalone-stage');
    expect(Math.abs((frame.left - stage.left) - (stage.right - frame.right))).toBeLessThanOrEqual(2);
  });

  test(`個別画面 ${route}: 推奨幅より狭い時は横スクロールを出さず、ペインの幅に縮む`, async ({ page }) => {
    await seedTargets(page);
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto(`/standalone/${route}`);
    await waitForHydration(page);
    await expect(page.locator('.pane-body')).toBeVisible();
    const stage = await box(page, '.standalone-stage');
    const frame = await box(page, '.standalone-stage .pane-frame');
    expect(frame.width).toBeLessThan(limit * REM);
    expect(frame.width).toBeGreaterThan(stage.width - 60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Workspaceのペイン: 広いペインでも中身は推奨幅で止まり、見出しは幅いっぱい', async ({ page }) => {
  await page.addInitScript((ids) => {
    const targets = ids.map((layoutId) => ({ kind: 'layout', layoutId }));
    localStorage.setItem('keydist:workspaces', JSON.stringify({
      version: 3,
      workspaces: [{
        id: 'seeded',
        name: '幅の確認',
        text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
        panes: [{ id: 'p1', analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } } }],
        grid: [{ id: 'p1', x: 0, y: 0, w: 12, h: 20 }],
      }],
    }));
  }, LAYOUTS);
  await page.setViewportSize({ width: 2560, height: 900 });
  await page.goto('/workspace/seeded');
  await waitForHydration(page);
  await expect(page.locator('.pane-body')).toBeVisible({ timeout: 10_000 });
  const frame = await box(page, '.pane-frame');
  const body = await box(page, '.pane-body');
  const header = await box(page, '.pane-frame-header');
  expect(frame.width).toBeGreaterThan(64 * REM + 200);
  expect(Math.round(body.width)).toBe(64 * REM);
  expect(Math.abs(header.width - frame.width)).toBeLessThanOrEqual(2);
  expect(Math.abs((body.left - frame.left) - (frame.right - body.right))).toBeLessThanOrEqual(2);
});

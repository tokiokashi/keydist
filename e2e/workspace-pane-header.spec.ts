import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの見出しの余白。見出しの先頭（つかみ所の絵）の左端が、本文（図）の左端と揃うこと（±1px）を確かめる。
 * 明暗・幅・文字サイズ（rem基準の余白が動く）の全部で見る。
 * スマホ幅（760px以下）は格子を使わずペインを縦に積むので、ここでは見ない（狭い側は800pxで見る）。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const pane = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } });

async function openWorkspace(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(({ workspace, theme }) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [workspace] }));
    localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, appearance: { theme } }));
  }, {
    theme,
    workspace: {
      id: 'header', name: '見出しの余白', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [pane('a'), pane('b')],
      grid: [{ id: 'a', x: 0, y: 0, w: 12, h: 16 }, { id: 'b', x: 12, y: 0, w: 12, h: 16 }],
    },
  });
  await page.goto('/workspace/header');
  await waitForHydration(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('.workspace-pane')).toHaveCount(2);
  // 測る前に全ペインの本文が出ているのを待つ（先頭だけ待つと、後のペインの本文がまだ無く測れないことがある）
  await expect(page.locator('.workspace-pane .pane-body')).toHaveCount(2, { timeout: 15_000 });
}

/** ペインごとに、見出しの先頭の左端と、本文の左端を測る。 */
async function measure(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('.workspace-pane')].map((paneElement) => {
    const grip = paneElement.querySelector('.workspace-grip-icon')!.getBoundingClientRect();
    const body = paneElement.querySelector('.pane-body')!.getBoundingClientRect();
    const frame = paneElement.querySelector('.pane-frame')!.getBoundingClientRect();
    const target = paneElement.querySelector('.pane-frame-target')!.getBoundingClientRect();
    return { gripLeft: grip.left, bodyLeft: body.left, frameLeft: frame.left, targetLeft: target.left, gripRight: grip.right };
  }));
}

const CASES = [
  { name: '明るいテーマ・パソコン幅', theme: 'light', width: 1440, rootFontSize: undefined },
  { name: '暗いテーマ・パソコン幅', theme: 'dark', width: 1440, rootFontSize: undefined },
  { name: '明るいテーマ・狭いパソコン幅', theme: 'light', width: 800, rootFontSize: undefined },
  { name: '暗いテーマ・狭いパソコン幅', theme: 'dark', width: 800, rootFontSize: undefined },
  // 文字サイズを変えると本文の余白（rem）も動く。見出しの側も同じ基準で動くこと
  { name: 'ルートの文字サイズ20px', theme: 'light', width: 1440, rootFontSize: 20 },
  { name: 'ルートの文字サイズ24px', theme: 'light', width: 1440, rootFontSize: 24 },
] as const;

for (const { name, theme, width, rootFontSize } of CASES) {
  test(`ペインの見出し: つかみ所の左端が本文の左端と揃う（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page, theme);
    if (rootFontSize) {
      await page.addStyleTag({ content: `html { font-size: ${rootFontSize}px; }` });
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(`${rootFontSize}px`);
    }
    for (const m of await measure(page)) {
      expect(Math.abs(m.gripLeft - m.bodyLeft)).toBeLessThanOrEqual(1);
      expect(m.gripLeft - m.frameLeft).toBeGreaterThanOrEqual(0);
    }
  });
}

test.describe('指で押す端末', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('ペインの見出し: つかみ所の左端が本文の左端と揃う（pointer: coarse）', async ({ page }) => {
    await openWorkspace(page, 'light');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const m of await measure(page)) expect(Math.abs(m.gripLeft - m.bodyLeft)).toBeLessThanOrEqual(1);
  });
});

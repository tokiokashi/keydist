import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの見出し（Dockviewのタブの帯）の余白。
 * 見出しの文字の左端が、帯の左端から本文の文字と同じ距離にあること（±1px）を確かめる。
 * 背景に文字が埋まって見えないように、明暗・幅・タブの数（1つだけ／複数）の全部で見る。
 * スマホ幅（760px以下）はDockviewを使わずペインを縦に積むので、ここでは見ない（狭い側は800pxで見る）。
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
      panes: [pane('a'), pane('b'), pane('c')],
      // 左はタブが1つだけ（帯いっぱいの表示）、右はタブが2つ
      layout: {
        kind: 'split', direction: 'row', weight: 1,
        children: [
          { kind: 'group', paneIds: ['a'], weight: 1 },
          { kind: 'group', paneIds: ['b', 'c'], weight: 1 },
        ],
      },
    },
  });
  await page.goto('/workspace/header');
  await waitForHydration(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  await expect(page.locator('.workspace-pane').first()).toBeVisible();
}

/** グループごとに、帯の左端から見た距離を測る。 */
async function measure(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('.dv-groupview')].map((group) => {
    const band = group.querySelector('.dv-tabs-and-actions-container')!.getBoundingClientRect();
    const body = group.querySelector('.workspace-pane')!;
    const bodyRect = body.getBoundingClientRect();
    const bodyStyle = getComputedStyle(body);
    const active = group.querySelector('.dv-tab.dv-active-tab') ?? group.querySelector('.dv-tab')!;
    const text = active.querySelector('.dv-default-tab-content')!.getBoundingClientRect();
    const icon = active.querySelector('.dv-default-tab-action svg')!.getBoundingClientRect();
    return {
      tabCount: group.querySelectorAll('.dv-tab').length,
      // 本文の文字の左端・右端（本文の左右の余白の内側）を、帯の端から測る
      bodyLeft: bodyRect.left + parseFloat(bodyStyle.paddingLeft) - band.left,
      bodyRight: band.right - (bodyRect.right - parseFloat(bodyStyle.paddingRight)),
      textLeft: text.left - band.left,
      iconRight: band.right - icon.right,
    };
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

async function expectAligned(page: Page, iconTolerance: number): Promise<void> {
  const groups = await measure(page);
  expect(groups.map((group) => group.tabCount)).toEqual([1, 2]);
  for (const group of groups) {
    expect(group.bodyLeft).toBeGreaterThan(8);
    expect(Math.abs(group.textLeft - group.bodyLeft)).toBeLessThanOrEqual(1);
  }
  // タブが1つだけの見出しは、×の右端も本文の右の余白と揃う
  expect(Math.abs(groups[0].iconRight - groups[0].bodyRight)).toBeLessThanOrEqual(iconTolerance);
}

for (const { name, theme, width, rootFontSize } of CASES) {
  test(`ペインの見出し: 文字の左端が本文の余白と揃う（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page, theme);
    if (rootFontSize) {
      await page.addStyleTag({ content: `html { font-size: ${rootFontSize}px; }` });
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(`${rootFontSize}px`);
    }
    await expectAligned(page, 1);
  });
}

test.describe('指で押す端末', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('ペインの見出し: 文字と×の位置が本文の余白と揃う（pointer: coarse）', async ({ page }) => {
    await openWorkspace(page, 'light');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    // ×のボタンの内側の余白（8px）が、本文の余白から背景までの差（7px）より大きく、
    // タブの余白は負にならず0で止まる。×の右端は本文より1pxほど内側に寄るので、許容は±1pxのまま
    await expectAligned(page, 1);
  });
});

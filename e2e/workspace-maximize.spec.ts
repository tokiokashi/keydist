import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの拡大表示（#628）。Dockviewの最大化で、そのペインを板いっぱいに見せ、元の並びへ戻る。
 * 拡大の状態は保存しない。拡大している間だけ板の高さを1画面にし、保存した高さには触れない。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }] } } };
const group = (id: string, weight = 1) => ({ kind: 'group', paneIds: [id], weight });
const PANES = [
  { id: 'f', analyzerId: 'bigram-flow', binding: fixedSingle },
  { id: 'c', analyzerId: 'comparison', binding: fixedSet },
  { id: 'n', analyzerId: 'n-sensitivity', binding: fixedSet },
];
const LAYOUT = {
  kind: 'split',
  direction: 'row',
  weight: 1,
  children: [group('f', 0.35), { kind: 'split', direction: 'column', weight: 0.65, children: [group('c', 0.4), group('n', 0.6)] }],
};

const FLOW_MENU = 'Bigram Flow — QWERTYの操作';

async function openWorkspace(page: Page, size: { width: number; height: number }, extra: Record<string, unknown> = {}): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'w', name: '拡大', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: PANES, layout: LAYOUT, ...extra });
  await page.goto('/workspace/w');
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(PANES.length, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

const flowMenuButton = (page: Page): Locator => page.getByRole('button', { name: FLOW_MENU });

/** 各ペインの枠の大きさ（左から右・上から下の順）。畳まれた枠は幅・高さが数画素になる。 */
function groupSizes(page: Page): Promise<readonly { width: number; height: number }[]> {
  return page.evaluate(() => [...document.querySelectorAll('.dv-groupview')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: Math.round(r.width), height: Math.round(r.height) };
    })
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map(({ width, height }) => ({ width, height })));
}

const isMaximized = (page: Page) => page.evaluate(() => document.querySelector('.workspace-dock-area')?.hasAttribute('data-maximized') ?? false);

async function maximizeFlow(page: Page): Promise<void> {
  await flowMenuButton(page).click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect.poll(() => isMaximized(page)).toBe(true);
  // 他のペインが畳まれ、拡大したペインが板いっぱいになるまで待つ
  await expect.poll(async () => (await groupSizes(page)).filter((s) => s.width > 100 && s.height > 100).length).toBe(1);
}

function storedWorkspace(page: Page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('keydist:workspaces') ?? '{}') as { workspaces: Record<string, unknown>[] }).workspaces[0]!);
}

test('⋯の「拡大表示」でそのペインが板いっぱいになり、「元の大きさに戻す」で元の並びへ戻る。保存した並びは変わらない', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  const before = await groupSizes(page);
  const savedBefore = await storedWorkspace(page);
  expect(before.every((s) => s.width > 100 && s.height > 100)).toBe(true);

  await maximizeFlow(page);
  const area = await page.locator('.workspace-dock-area').boundingBox();
  const maximized = (await groupSizes(page)).find((s) => s.width > 100 && s.height > 100)!;
  // 拡大したペインは板（余白を除く）を使い切り、元の幅・高さより大きい
  expect(maximized.width).toBeGreaterThan(before[0]!.width * 2);
  expect(maximized.width).toBeGreaterThan(area!.width - 40);

  await flowMenuButton(page).click();
  await expect(page.getByRole('menuitem', { name: '拡大表示' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '元の大きさに戻す' }).click();
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect.poll(() => groupSizes(page)).toEqual(before);
  // 戻した後のフォーカスは、押した⋯のボタンに残る
  await expect(flowMenuButton(page)).toBeFocused();
  // 保存した並び・板の高さは、拡大の出入りで書き換わらない（少し待って、遅れて書かれる並びの変更も見る）
  await page.waitForTimeout(800);
  expect(await storedWorkspace(page)).toEqual(savedBefore);
});

test('Escapeで元に戻り、フォーカスは拡大したペインの⋯へ戻る（キーボードだけで拡大から戻るまで）', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  const before = await groupSizes(page);
  await flowMenuButton(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // 先頭の項目が「拡大表示」
  await expect.poll(() => isMaximized(page)).toBe(true);
  await expect(flowMenuButton(page)).toBeFocused();

  // フォーカスが他へ移っていても（bodyにあっても）Escapeで戻り、⋯へフォーカスが戻る
  await flowMenuButton(page).blur();
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect.poll(() => groupSizes(page)).toEqual(before);
  await expect(flowMenuButton(page)).toBeFocused();
});

test('拡大中に開いたメニュー・解析設定の小窓・対象の選択・条件のモーダルは、Escapeでそれだけが閉じ、拡大は残る', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  await maximizeFlow(page);
  const frame = page.locator('.dv-groupview').filter({ has: page.locator('.pane-frame') }).first();
  const stillMaximized = () => isMaximized(page);

  // 解析設定の小窓（押して開くとフォーカスは小窓の外にある）
  await frame.getByRole('button', { name: '解析設定' }).click();
  await expect(page.locator('.settings-window')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.settings-window')).toHaveCount(0);
  expect(await stillMaximized()).toBe(true);

  // 対象の選択
  await frame.locator('.target-selection-button').click();
  await expect(page.locator('.target-selection-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.target-selection-panel')).toHaveCount(0);
  expect(await stillMaximized()).toBe(true);

  // 条件のモーダル
  await frame.locator('.pane-condition-trigger').click();
  await expect(page.getByRole('dialog', { name: '条件' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '条件' })).toBeHidden();
  expect(await stillMaximized()).toBe(true);

  // ⋯のメニュー
  await flowMenuButton(page).click();
  await expect(page.getByRole('menu', { name: FLOW_MENU })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: FLOW_MENU })).toHaveCount(0);
  expect(await stillMaximized()).toBe(true);

  // 何も開いていなければ、Escapeで拡大が解ける
  await page.keyboard.press('Escape');
  await expect.poll(stillMaximized).toBe(false);
});

test('拡大中の板の高さは1画面で、保存した高さは変わらず、下端のつまみは出ない。戻すと保存した高さに戻る', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 700 }, { boardHeightRem: 90 });
  const REM = 16;
  const heightBefore = await page.locator('.workspace-dock-area').evaluate((el) => el.getBoundingClientRect().height);
  expect(heightBefore).toBeGreaterThanOrEqual(90 * REM - 1);
  await expect(page.getByRole('separator')).toHaveCount(1);

  // 板の途中までスクロールした状態から拡大しても、板の上端が画面に入る
  // 下のペイン（N感度）の⋯は板の下の方にあり、押すためにスクロールする
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.getByRole('button', { name: 'N感度の操作' }).click();
  // 押すために動いたスクロールの位置が、拡大前の位置（0ではない）
  const scrolledBefore = await page.evaluate(() => window.scrollY);
  expect(scrolledBefore).toBeGreaterThan(0);
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect.poll(() => isMaximized(page)).toBe(true);
  await expect.poll(async () => (await groupSizes(page)).filter((s) => s.width > 100 && s.height > 100).length).toBe(1);
  const state = await page.evaluate(() => {
    const area = document.querySelector('.workspace-dock-area')!.getBoundingClientRect();
    return { top: area.top, bottom: area.bottom, view: window.innerHeight, scrollY: window.scrollY, doc: document.documentElement.scrollHeight };
  });
  expect(state.scrollY).toBe(0);
  expect(state.top).toBeGreaterThanOrEqual(0);
  expect(state.top).toBeLessThan(state.view);
  // 板の下端が画面の下端に収まり、ページはスクロールしない
  expect(state.bottom).toBeLessThanOrEqual(state.view + 1);
  expect(state.doc).toBeLessThanOrEqual(state.view + 1);
  await expect(page.getByRole('separator')).toHaveCount(0);
  expect(((await storedWorkspace(page)) as { boardHeightRem?: number }).boardHeightRem).toBe(90);

  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect.poll(() => page.locator('.workspace-dock-area').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(90 * REM - 1);
  await expect(page.getByRole('separator')).toHaveCount(1);
  // 拡大する前の位置へ戻る
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledBefore);
  await page.waitForTimeout(800);
  expect(((await storedWorkspace(page)) as { boardHeightRem?: number }).boardHeightRem).toBe(90);
});

test('縦積み（スマホ幅）の⋯には「拡大表示」が出ない', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, { id: 'w', name: '拡大', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: PANES, layout: LAYOUT });
  await page.goto('/workspace/w');
  await waitForHydration(page);
  await expect(page.locator('.workspace-stack-pane').first()).toBeVisible({ timeout: 15_000 });
  await flowMenuButton(page).click();
  await expect(page.getByRole('menuitem', { name: '複製' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /拡大表示|元の大きさに戻す/ })).toHaveCount(0);
});

test('拡大は保存せず、リロードすると元の並びで開く', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  const before = await groupSizes(page);
  await maximizeFlow(page);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(PANES.length, { timeout: 15_000 });
  expect(await isMaximized(page)).toBe(false);
  await expect.poll(() => groupSizes(page)).toEqual(before);
});

test('拡大中に、そのペインを閉じると拡大が解け、複製すると拡大が解けて写しが見える', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  await maximizeFlow(page);
  await flowMenuButton(page).click();
  await page.getByRole('menuitem', { name: '複製' }).click();
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect(page.locator('.dv-groupview')).toHaveCount(4);
  await expect.poll(async () => (await groupSizes(page)).every((s) => s.width > 100 && s.height > 100)).toBe(true);

  // 複製の後、写しではなく元のペイン（先頭）を拡大して閉じる
  await page.getByRole('button', { name: FLOW_MENU }).first().click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect.poll(() => isMaximized(page)).toBe(true);
  await page.getByRole('button', { name: FLOW_MENU }).first().click();
  await page.getByRole('menuitem', { name: '閉じる' }).click();
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
  await expect.poll(async () => (await groupSizes(page)).every((s) => s.width > 100 && s.height > 100)).toBe(true);
});

test('拡大中にタブの×でペインを閉じても、拡大が解けて残りのペインが見える', async ({ page }) => {
  await openWorkspace(page, { width: 1440, height: 900 });
  await maximizeFlow(page);
  await page.locator('.dv-groupview').filter({ has: page.locator('.pane-frame') }).first().getByRole('button', { name: '閉じる' }).first().click();
  await expect.poll(() => isMaximized(page)).toBe(false);
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  await expect.poll(async () => (await groupSizes(page)).every((s) => s.width > 100 && s.height > 100)).toBe(true);
});

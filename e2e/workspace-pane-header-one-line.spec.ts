import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの見出し。見出しの先頭につかみ所・名前・ⓘがあり、対象・連動・条件・状態・解析設定・⋯が並ぶ。
 * ペインが広い時は全部が1行、狭い時（ペインの幅30rem以下）は先頭のものを1段目、操作を2段目に置く
 * （名前が対象の選択の幅を食って、対象を選べなくなるのを避ける）。
 * 条件は広い時にchip、狭い時（ペインの幅34rem以下）は絵と変更の点。
 * 縦積み（スマホ幅）は格子を使わず、同じ見出しで積む。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } };
const flow = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: fixedSingle });
const comparison = (id: string) => ({ id, analyzerId: 'comparison', binding: fixedSet });
const nSens = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: fixedSet });
/** 同じ高さの枠を横に並べる（幅は升目の数）。 */
function rowGrid(...items: readonly (readonly [string, number])[]) {
  let x = 0;
  return items.map(([id, w]) => {
    const item = { id, x, y: 0, w, h: 16 };
    x += w;
    return item;
  });
}

const workspaceOf = (panes: readonly unknown[], grid: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'h', name: '見出し', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, grid, ...extra,
});

async function openWorkspace(page: Page, panes: readonly unknown[], grid: unknown, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, workspaceOf(panes, grid));
  await page.goto('/workspace/h');
  await waitForHydration(page);
  await expect(size.width <= 760 ? page.locator('.workspace-stack-pane').first() : page.locator('.workspace-grid-item').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
}

/** 画面幅1440では、12列のうち1升はおよそ91px。3つ並べる（各4升 = 約390px）と狭く、2つ並べる（各6升 = 約590px）と広い。 */
const THREE = [flow('f'), comparison('c'), nSens('n')];
const THREE_GRID = rowGrid(['f', 4], ['c', 4], ['n', 4]);

/** 見出しの行の箱と、その中の操作（先頭・対象・条件・解析設定・⋯）の縦の位置。 */
async function headerGeometry(pane: Locator) {
  return pane.evaluate((frame) => {
    const header = frame.querySelector('.pane-frame-header')!.getBoundingClientRect();
    const rect = (selector: string) => frame.querySelector(selector)!.getBoundingClientRect();
    return {
      width: frame.getBoundingClientRect().width,
      height: header.height,
      leadTop: rect('.pane-frame-lead').top,
      targetTop: rect('.pane-frame-target').top,
      settingsTop: rect('.pane-settings-button').top,
      menuTop: rect('.pane-frame-menu').top,
      targetWidth: rect('.pane-frame-target').width,
      targetSelect: frame.querySelector('.pane-frame-target select, .pane-frame-target button')!.getBoundingClientRect().width,
    };
  });
}

test('広いペインの見出しは1行、狭いペイン（30rem以下）は先頭が1段目で操作が2段目。どちらも対象を選べる幅がある', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_GRID, { width: 1440, height: 900 });
  const narrow = await headerGeometry(page.locator('.pane-frame').first());
  expect(narrow.width).toBeLessThan(30 * 16);
  // 先頭（つかみ所・名前・ⓘ）が上、対象・解析設定・⋯が同じ下の段
  expect(narrow.targetTop).toBeGreaterThan(narrow.leadTop + 10);
  expect(Math.abs(narrow.settingsTop - narrow.targetTop)).toBeLessThan(10);
  expect(Math.abs(narrow.menuTop - narrow.targetTop)).toBeLessThan(10);
  expect(narrow.targetSelect).toBeGreaterThan(80);

  await page.evaluate((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] })), workspaceOf(THREE.slice(0, 2), rowGrid(['f', 6], ['c', 6])));
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  const wide = await headerGeometry(page.locator('.pane-frame').first());
  expect(wide.width).toBeGreaterThan(30 * 16);
  // 全部が同じ行
  for (const top of [wide.targetTop, wide.settingsTop, wide.menuTop]) expect(Math.abs(top - wide.leadTop)).toBeLessThan(10);
  expect(wide.height).toBeLessThan(narrow.height);
  expect(wide.targetSelect).toBeGreaterThan(80);
});

test('名前とⓘは見出しの先頭にあり、ペインの中に名前の行は無い。読み上げ用のh2は残る', async ({ page }) => {
  await openWorkspace(page, THREE, rowGrid(['f', 6], ['c', 6], ['n', 6]).map((item, i) => ({ ...item, x: (i % 2) * 6, y: Math.floor(i / 2) * 16 })), { width: 1440, height: 900 });
  const flowPane = page.locator('.pane-frame').filter({ has: page.locator('[data-react-feature="bigram-flow"]') });
  const lead = flowPane.locator('.pane-frame-lead');
  await expect(lead).toContainText('Bigram Flow');
  await expect(lead.getByRole('button', { name: 'Bigram Flowの説明' })).toBeVisible();
  await expect(flowPane.locator('.pane-frame-name')).toHaveCount(0);
  // h2はある（読み上げに残る）が、見た目では1px四方に隠れている
  const heading = flowPane.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true });
  await expect(heading).toHaveCount(1);
  const box = (await heading.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(2);
  expect(box.height).toBeLessThanOrEqual(2);
  // 閉じるは⋯の中だけ（タブの×は無い）
  await expect(page.getByRole('button', { name: '閉じる', exact: true })).toHaveCount(0);
  await flowPane.getByRole('button', { name: /の操作$/ }).click();
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
});

test('条件: 広い時は文字のchip、狭い時は絵と変更の点。どちらも押すと条件のモーダルが開く', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_GRID, { width: 1440, height: 900 });
  const narrowTrigger = page.locator('.pane-frame').first().locator('.pane-condition-trigger');
  // 狭い（約390px）: 文字は隠れ（読み上げには残る）、2rem四方の絵のボタン
  const narrowBox = (await narrowTrigger.boundingBox())!;
  expect(narrowBox.width).toBeLessThanOrEqual(34);
  expect(narrowBox.height).toBeGreaterThanOrEqual(30);
  const narrowText = (await narrowTrigger.locator('.pane-condition-chip-text').boundingBox())!;
  expect(narrowText.width).toBeLessThanOrEqual(2);
  await expect(page.locator('.pane-frame').first().getByRole('button', { name: '条件: 既定値' })).toHaveCount(1);
  await expect(narrowTrigger.locator('.pane-condition-dot')).toBeHidden();

  await narrowTrigger.click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  // 既定と違うので、絵の右上に点が出る。名前は変更の件数に変わる
  await expect(narrowTrigger.locator('.pane-condition-dot')).toBeVisible();
  await expect(page.locator('.pane-frame').first().getByRole('button', { name: '条件: 1件変更' })).toHaveCount(1);
  // 条件の絵は、解析設定（スライダー）の絵と別の形
  const icons = await page.locator('.pane-frame').first().evaluate((frame) => ({
    condition: frame.querySelector('.pane-condition-trigger svg')!.innerHTML,
    settings: frame.querySelector('.pane-settings-button svg')!.innerHTML,
  }));
  expect(icons.condition).not.toBe(icons.settings);

  // 広い（約590px、34remより広い）: 文字のchip
  await page.evaluate((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] })), workspaceOf(
    THREE.slice(0, 2),
    rowGrid(['f', 6], ['c', 6]),
    // 条件のモーダルで変えた値はWorkspaceの条件に入る。保存先を書き直すので、同じ値を持たせる
    { conditions: { windowSize: 4 } },
  ));
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  const wideTrigger = page.locator('.pane-frame').first().locator('.pane-condition-trigger');
  await expect(wideTrigger).toHaveText('条件: 1件変更');
  expect((await wideTrigger.locator('.pane-condition-chip-text').boundingBox())!.width).toBeGreaterThan(40);
  await expect(wideTrigger.locator('.pane-condition-dot')).toBeHidden();
  await wideTrigger.click();
  await expect(page.getByRole('dialog', { name: '条件' })).toBeVisible();
});

test('ⓘの説明は見出しの先頭から出て、キーボードで届き、Escapeで閉じる', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_GRID, { width: 1440, height: 900 });
  const info = page.locator('.pane-frame-lead').first().getByRole('button', { name: 'Bigram Flowの説明' });
  await info.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('指がキーボード上をどう動くか');
  // ペインの枠（スクロールで切り抜く入れ物）の外に出ていて、ⓘの真下にあり、その上に別の要素が被っていない
  expect(await tip.evaluate((el) => !el.closest('.workspace-pane-scroll'))).toBe(true);
  const box = (await tip.boundingBox())!;
  const infoBox = (await info.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(infoBox.y + infoBox.height);
  expect(box.height).toBeGreaterThan(20);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="tooltip"]') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);

  // キーボードだけで届く（ⓘに順にフォーカスが移る）
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  await page.getByRole('button', { name: 'ペインを追加' }).focus();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    if (await info.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(info).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('見出しの先頭のつかみ所は、ⓘと操作のボタンを含まない（押してもペインが動かない）', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_GRID, { width: 1440, height: 900 });
  const first = page.locator('.workspace-grid-item').first();
  await page.waitForTimeout(400);
  const before = await first.boundingBox();
  const info = first.locator('.pane-frame-lead').getByRole('button', { name: 'Bigram Flowの説明' });
  expect(await info.evaluate((el) => el.closest('.workspace-drag-handle') === null)).toBe(true);
  const box = (await info.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 80, { steps: 6 });
  await page.mouse.up();
  const after = await first.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
});

test('縦積み（390px）: 見出しの先頭に名前があり、条件は絵になる。つかみ所の絵は無い', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_GRID, { width: 390, height: 844 });
  const pane = page.locator('.pane-frame').first();
  await expect(pane.locator('.pane-frame-lead')).toContainText('Bigram Flow');
  await expect(pane.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true })).toHaveCount(1);
  await expect(pane.locator('.pane-condition-summary[data-compact]')).toBeVisible();
  await expect(pane.locator('.workspace-grip-icon')).toHaveCount(0);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(0);
  // 対象を選べる（見出しの2段目に、押せる幅の対象の選択がある）
  const geometry = await headerGeometry(pane);
  expect(geometry.targetSelect).toBeGreaterThan(80);
  expect(geometry.targetTop).toBeGreaterThan(geometry.leadTop + 10);
});

test('個別画面の見出しは今のまま（名前の行・条件の行がある）', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/bigram-flow');
    await waitForHydration(page);
    const pane = page.locator('.pane-frame');
    await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
    await expect(pane).not.toHaveAttribute('data-name-in-lead', /.*/);
    await expect(pane.locator('.pane-condition-summary:not([data-compact])')).toContainText('すべて既定値');
    if (width === 1440) await expect(pane.locator('.pane-frame-name')).toBeVisible();
  }
});

test('狭いペインでも、連動のメニューはペインの枠からはみ出して切れない', async ({ page }) => {
  // 4列（1ペインが約290px）。連動のボタンが枠の左寄りに来るので、右端揃えのままだと左へはみ出して切れる
  const four = ['a', 'b', 'c', 'd'].map(flow);
  await openWorkspace(page, four, rowGrid(['a', 3], ['b', 3], ['c', 3], ['d', 3]), { width: 1440, height: 900 });
  const frame = page.locator('.pane-frame').nth(2);
  await frame.locator('.pane-target-binding .pane-menu-button').click();
  const list = page.getByRole('menu').first();
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  const bounds = (await page.locator('.workspace-grid-item').nth(2).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(bounds.x);
  expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  // 項目が押せる（隣のペインに覆われていない）
  await page.getByRole('menuitemradio', { name: /^新しい連動/ }).click();
  await expect(frame.locator('.pane-target-binding .pane-menu-button')).toHaveAttribute('aria-label', /^連動 /);
});

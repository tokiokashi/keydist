import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの見出しは、名前とⓘをDockviewのタブが持ち、ペインの中は幅によらず1行（#827）。
 * 条件は広い時にchip、狭い時（ペインの幅34rem以下）は絵と変更の点。タブの名前の行は、タブを隠した表示と
 * 縦積み（スマホ幅）には無いので、そこは枠の中に残る。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } };
const flow = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: fixedSingle });
const comparison = (id: string) => ({ id, analyzerId: 'comparison', binding: fixedSet });
const nSens = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: fixedSet });
const group = (...paneIds: string[]) => ({ kind: 'group', paneIds, weight: 1 });
const row = (...children: unknown[]) => ({ kind: 'split', direction: 'row', weight: 1, children });

async function openWorkspace(page: Page, panes: readonly unknown[], layout: unknown, size: { width: number; height: number }, query = ''): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'h', name: '見出し', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout });
  await page.goto(`/workspace/h${query}`);
  await waitForHydration(page);
  await expect(size.width <= 760 ? page.locator('.workspace-stack-pane').first() : page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
}

const THREE = [flow('f'), comparison('c'), nSens('n')];
const THREE_ROW = row(group('f'), group('c'), group('n'));

/** 見出しの行の箱と、その中の操作（対象・条件・解析設定・⋯）の縦の位置。 */
async function headerGeometry(pane: Locator) {
  return pane.evaluate((frame) => {
    const header = frame.querySelector('.pane-frame-header')!.getBoundingClientRect();
    const items = [...frame.querySelectorAll('.pane-frame-header > *')]
      .filter((el) => getComputedStyle(el).position !== 'absolute')
      .map((el) => el.getBoundingClientRect());
    return {
      width: frame.getBoundingClientRect().width,
      height: header.height,
      tops: items.map((r) => r.top),
      bottoms: items.map((r) => r.bottom),
      bodyTop: frame.querySelector('.pane-body')!.getBoundingClientRect().top,
      headerTop: header.top,
    };
  });
}

test('見出しは幅によらず1行で、高さが同じ（狭いペイン・広いペイン）', async ({ page }) => {
  // 3列（1ペインが約390px）と、2列（1ペインが約820px）
  await openWorkspace(page, THREE, THREE_ROW, { width: 1440, height: 900 });
  const narrow = await headerGeometry(page.locator('.pane-frame').first());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => localStorage.clear());
  const wide = await (async () => {
    await page.evaluate((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] })), {
      id: 'h', name: '見出し', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: THREE.slice(0, 2), layout: row(group('f'), group('c')),
    });
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator('.dv-groupview')).toHaveCount(2);
    await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
    return headerGeometry(page.locator('.pane-frame').first());
  })();
  expect(narrow.width).toBeLessThan(34 * 16);
  expect(wide.width).toBeGreaterThan(40 * 16);
  for (const g of [narrow, wide]) {
    // 操作は全部同じ行（段が分かれていたら、上端が1行分以上ずれる）
    expect(Math.max(...g.tops) - Math.min(...g.tops)).toBeLessThan(4);
    expect(g.height).toBeLessThanOrEqual(34);
  }
  expect(Math.abs(narrow.height - wide.height)).toBeLessThan(1);
});

test('名前とⓘはタブにあり、ペインの中に名前の行は無い。読み上げ用のh2は残る', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_ROW, { width: 1440, height: 900 });
  const flowPane = page.locator('.pane-frame').filter({ has: page.locator('[data-react-feature="bigram-flow"]') });
  await expect(page.locator('.dv-tab').first()).toContainText('Bigram Flow');
  await expect(page.locator('.dv-tab').first().getByRole('button', { name: 'Bigram Flowの説明' })).toBeVisible();
  await expect(flowPane.locator('.pane-frame-name')).toHaveCount(0);
  // h2はある（読み上げに残る）が、見た目では1px四方に隠れている
  const heading = flowPane.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true });
  await expect(heading).toHaveCount(1);
  const box = (await heading.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(2);
  expect(box.height).toBeLessThanOrEqual(2);
  // タブの×と、⋯の中の閉じるは今のまま（2か所）
  await expect(page.locator('.dv-tab').first().getByRole('button', { name: '閉じる' })).toBeVisible();
  await flowPane.getByRole('button', { name: /の操作$/ }).click();
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
});

test('条件: 広い時は文字のchip、狭い時は絵と変更の点。どちらも押すと条件のモーダルが開く', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_ROW, { width: 1440, height: 900 });
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

  // 広い（約820px）: 文字のchip
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] })), {
    id: 'h', name: '見出し', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: THREE.slice(0, 2), layout: row(group('f'), group('c')),
  });
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  const wideTrigger = page.locator('.pane-frame').first().locator('.pane-condition-trigger');
  await expect(wideTrigger).toHaveText('条件: 1件変更');
  expect((await wideTrigger.locator('.pane-condition-chip-text').boundingBox())!.width).toBeGreaterThan(40);
  await expect(wideTrigger.locator('.pane-condition-dot')).toBeHidden();
  await wideTrigger.click();
  await expect(page.getByRole('dialog', { name: '条件' })).toBeVisible();
});

test('ⓘの説明はタブの帯に隠れず、キーボードで届き、Escapeで閉じる', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_ROW, { width: 1440, height: 900 });
  const info = page.locator('.dv-tab').first().getByRole('button', { name: 'Bigram Flowの説明' });
  await info.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('指がキーボード上をどう動くか');
  // 帯（はみ出しを切る入れ物）の外に出ていて、その上に別の要素が被っていない
  expect(await tip.evaluate((el) => !el.closest('.dv-tabs-and-actions-container'))).toBe(true);
  const box = (await tip.boundingBox())!;
  const infoBox = (await info.boundingBox())!;
  // ⓘの真下に出る（帯の中に切り取られていれば、帯の下端より下の部分が無くなる）
  expect(box.y).toBeGreaterThanOrEqual(infoBox.y + infoBox.height);
  const band = (await page.locator('.dv-tabs-and-actions-container').first().boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(band.y + band.height + 10);
  expect(box.height).toBeGreaterThan(20);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="tooltip"]') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);

  // キーボードだけで届く（ⓘに順にフォーカスが移る）
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  await page.getByRole('button', { name: 'Analyzerを追加' }).focus();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    if (await info.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(info).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('複数のタブ: 切り替え・ドラッグで分ける・×で閉じるが今どおり。タブごとにⓘがある', async ({ page }) => {
  await openWorkspace(page, THREE, row(group('f'), group('c', 'n')), { width: 1440, height: 900 });
  const tabs = page.locator('.dv-groupview').nth(1).locator('.dv-tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.getByRole('button', { name: /の説明$/ })).toHaveCount(2);
  await tabs.filter({ hasText: 'N感度' }).click();
  await expect(tabs.filter({ hasText: 'N感度' })).toHaveClass(/dv-active-tab/);
  await expect(page.locator('.dv-groupview').nth(1).locator('.pane-frame:visible h2')).toHaveText('N感度');

  // 別のタブのⓘを押しても説明が出る（押したタブの説明）
  await tabs.filter({ hasText: '比較表' }).getByRole('button', { name: '比較表の説明' }).click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');

  // ドラッグで別のグループへ分ける（資産へ書かれ、グループが3つになる）
  const target = page.locator('.dv-groupview').first();
  const box = (await target.boundingBox())!;
  await tabs.filter({ hasText: 'N感度' }).dragTo(target, { targetPosition: { x: box.width / 2, y: box.height - 8 } });
  await expect(page.locator('.dv-groupview')).toHaveCount(3);

  // ×で閉じる
  await page.locator('.dv-tab').filter({ hasText: '比較表' }).getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
});

test('タブを隠した表示では、名前の行が枠の中に残る（見出しの1行化はタブがある時だけ）', async ({ page }) => {
  await openWorkspace(page, THREE.slice(0, 1), group('f'), { width: 1440, height: 900 }, '?tabs=hide');
  const pane = page.locator('.pane-frame').first();
  await expect(pane.locator('.pane-frame-name')).toBeVisible();
  await expect(pane.locator('.pane-condition-summary:not([data-compact])')).toBeVisible();
  await expect(pane).not.toHaveAttribute('data-name-in-tab', /.*/);
});

test('縦積み（390px）: 名前の行と条件の行は枠の中に残る', async ({ page }) => {
  await openWorkspace(page, THREE, THREE_ROW, { width: 390, height: 844 });
  const pane = page.locator('.pane-frame').first();
  await expect(pane.locator('.pane-frame-name')).toBeVisible();
  await expect(pane.getByRole('heading', { level: 2, name: 'Bigram Flow', exact: true })).toBeVisible();
  await expect(pane.locator('.pane-condition-summary')).toContainText('すべて既定値');
  await expect(page.locator('.dv-groupview')).toHaveCount(0);
});

test('個別画面の見出しは今のまま（名前の行・条件の行がある）', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/bigram-flow');
    await waitForHydration(page);
    const pane = page.locator('.pane-frame');
    await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
    await expect(pane).not.toHaveAttribute('data-name-in-tab', /.*/);
    await expect(pane.locator('.pane-condition-summary:not([data-compact])')).toContainText('すべて既定値');
    if (width === 1440) await expect(pane.locator('.pane-frame-name')).toBeVisible();
  }
});

test('狭いペインでも、連動のメニューはペインの枠からはみ出して切れない', async ({ page }) => {
  // 4列（1ペインが約290px）。連動のボタンが枠の左寄りに来るので、右端揃えのままだと左へはみ出して切れる
  const four = ['a', 'b', 'c', 'd'].map(flow);
  await openWorkspace(page, four, row(...four.map((pane) => group(pane.id))), { width: 1440, height: 900 });
  const frame = page.locator('.pane-frame').nth(2);
  await frame.locator('.pane-target-binding .pane-menu-button').click();
  const list = page.getByRole('menu').first();
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  const bounds = (await page.locator('.dv-groupview').nth(2).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(bounds.x);
  expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  // 項目が押せる（隣のペインに覆われていない）
  await page.getByRole('menuitemradio', { name: /^新しい連動/ }).click();
  await expect(frame.locator('.pane-target-binding .pane-menu-button')).toHaveAttribute('aria-label', /^連動 /);
});

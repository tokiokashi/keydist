import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 条件のモーダルの配置。
 * - スクロールするのは本文だけ（モーダル自体は二重にスクロールせず、見出しは動かない）
 * - 行の項目名・札が折り返さない（Workspaceでも）
 * - 群は列ごとに上から詰めて積み、DOMの順（Tab・読み上げの順）が列ごとの上から下と一致する
 * - 行の編集先のボタンは⋯だけで、書き先の名前は開いたメニューと読み上げ名に出る
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const GROUP_GAP_PX = 0.9 * 16;
const WORKSPACE_CHANGED = { sfbHomeCost: false, defaultShapeId: 'ortholinear' };

async function openWorkspaceModal(
  page: Page,
  size: { width: number; height: number },
  conditions: Record<string, unknown> = {},
): Promise<Locator> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, {
    id: 'm',
    name: '配置',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    conditions,
    panes: [{ id: 'p1', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } }],
    grid: [{ id: 'p1', x: 0, y: 0, w: 24, h: 24 }],
  });
  await page.goto('/workspace/m');
  await waitForHydration(page);
  const pane = page.locator('.pane-frame').first();
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  await pane.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

async function openStandaloneModal(page: Page, size: { width: number; height: number }): Promise<Locator> {
  await page.setViewportSize(size);
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  await page.locator('.pane-frame .pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

/** モーダルとその中でスクロールできる要素（overflowがauto/scrollで、中身が枠より大きいもの）。 */
async function scrollers(modal: Locator): Promise<string[]> {
  return modal.evaluate((dialog) => {
    const found: string[] = [];
    for (const el of [dialog, ...dialog.querySelectorAll('*')]) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
        found.push(el.tagName === 'DIALOG' ? 'dialog' : String(el.className));
      }
    }
    return found;
  });
}

for (const [name, size] of [
  ['パソコン幅の低い画面', { width: 1280, height: 600 }],
  ['シート（390x844）', { width: 390, height: 844 }],
  ['シートの境目（760x900）', { width: 760, height: 900 }],
] as const) {
  test(`${name}: スクロールするのは本文だけで、モーダル自体は二重にスクロールせず、見出しも動かない`, async ({ page }) => {
    const modal = await openWorkspaceModal(page, size);
    const body = modal.locator('.condition-modal-body');
    // 本文が枠より大きい（スクロールする）高さの画面を選んである
    expect(await scrollers(modal)).toEqual(['condition-modal-body']);

    const dialogSize = await modal.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(dialogSize.scroll).toBeLessThanOrEqual(dialogSize.client);

    const heading = modal.locator('.condition-modal-head h2');
    const before = await heading.boundingBox();
    await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    // 最後の群の最後の要素まで届き、モーダルの外へはみ出さない
    const last = modal.locator('.condition-group').last().locator('input, select, button').last();
    await expect(last).toBeInViewport();
    expect(await heading.boundingBox()).toEqual(before);
    const dialogBox = (await modal.boundingBox())!;
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
  });
}

test('1920x1080の既定の状態では、Workspaceも個別画面も本文がスクロールしない。閉じるとモーダルは見えない', async ({ page }) => {
  const workspace = await openWorkspaceModal(page, { width: 1920, height: 1080 });
  expect(await scrollers(workspace)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(workspace).toBeHidden();

  const standalone = await openStandaloneModal(page, { width: 1920, height: 1080 });
  expect(await scrollers(standalone)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(standalone).toBeHidden();
});

/** 項目名と札の文字が複数行に分かれているもの。 */
async function wrappedLabels(modal: Locator): Promise<string[]> {
  return modal.evaluate((dialog) => {
    const wrapped: string[] = [];
    for (const label of dialog.querySelectorAll('.option-field-label, .condition-origin, .condition-group-title')) {
      const range = document.createRange();
      range.selectNodeContents(label);
      const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
      if (tops.size > 1) wrapped.push((label.textContent ?? '').trim());
    }
    return wrapped;
  });
}

for (const [name, size, conditions] of [
  ['3列・既定', { width: 1920, height: 1080 }, {}],
  ['3列・Workspaceで変えた行がある', { width: 1920, height: 1080 }, WORKSPACE_CHANGED],
  ['シート・Workspaceで変えた行がある', { width: 390, height: 844 }, WORKSPACE_CHANGED],
] as const) {
  test(`Workspaceから開いても、項目名と札が折り返さない（${name}）`, async ({ page }) => {
    const modal = await openWorkspaceModal(page, size, conditions);
    await expect(modal.locator('.condition-origin').first()).toBeVisible();
    expect(await wrappedLabels(modal)).toEqual([]);
  });
}

interface GroupBox { readonly index: number; readonly x: number; readonly top: number; readonly bottom: number }

async function groupBoxes(modal: Locator): Promise<GroupBox[]> {
  return modal.locator('.condition-group').evaluateAll((groups) => groups.map((group, index) => {
    const rect = group.getBoundingClientRect();
    return { index, x: Math.round(rect.x), top: rect.top, bottom: rect.bottom };
  }));
}

/** 左端のx座標が近い群を1つの列にまとめる。 */
function columnsOf(boxes: readonly GroupBox[]): GroupBox[][] {
  const columns: GroupBox[][] = [];
  for (const box of [...boxes].sort((a, b) => a.x - b.x || a.top - b.top)) {
    const column = columns.find((candidate) => Math.abs(candidate[0]!.x - box.x) < 4);
    if (column === undefined) columns.push([box]);
    else column.push(box);
  }
  return columns;
}

for (const [name, size, columnCount] of [
  ['3列', { width: 1920, height: 1080 }, 3],
  ['2列', { width: 761, height: 900 }, 2],
  ['1列（シート）', { width: 390, height: 844 }, 1],
] as const) {
  test(`群は列ごとに上から詰めて積む（${name}）。DOMの順が列ごとの上から下・左から右の順と一致する`, async ({ page }) => {
    const modal = await openWorkspaceModal(page, size);
    const boxes = await groupBoxes(modal);
    expect(boxes).toHaveLength(6);
    const columns = columnsOf(boxes);
    expect(columns).toHaveLength(columnCount);

    // 列の中で、群の間に決まった間隔（0.9rem）より大きい空きが無い
    for (const column of columns) {
      for (let i = 1; i < column.length; i++) {
        const gap = column[i]!.top - column[i - 1]!.bottom;
        expect(gap, `列の中の群の間隔（${column.map((box) => box.index).join(',')}）`).toBeLessThanOrEqual(GROUP_GAP_PX + 1);
        expect(gap).toBeGreaterThanOrEqual(0);
      }
    }
    // どの列も先頭の群が列の上端から始まる
    for (const column of columns) expect(Math.abs(column[0]!.top - columns[0]![0]!.top)).toBeLessThan(2);

    // 見た目の順（列ごとに上から下、左から右）がDOMの順と同じ
    expect(columns.flat().map((box) => box.index)).toEqual(boxes.map((box) => box.index));
  });
}

test('行の編集先のボタンは⋯だけで、書き先の名前は開いたメニューと読み上げ名に出る（Workspace・個別画面）', async ({ page }) => {
  const workspaceModal = await openWorkspaceModal(page, { width: 1920, height: 1080 });
  const row = workspaceModal.locator('[data-item="windowSize"]');
  const button = row.getByRole('button', { name: '先読みNの編集先: Workspace' });
  await expect(button).toHaveText('');
  await expect(button.locator('svg')).toBeVisible();
  await button.click();
  const menu = row.getByRole('menu', { name: '先読みNの編集先: Workspace' });
  await expect(menu).toContainText('編集中: Workspace');
  await expect(menu.getByRole('menuitem', { name: '全体を編集' })).toBeVisible();
  await page.keyboard.press('Escape');

  const standaloneModal = await openStandaloneModal(page, { width: 1920, height: 1080 });
  const standaloneRow = standaloneModal.locator('[data-item="windowSize"]');
  const standaloneButton = standaloneRow.getByRole('button', { name: '先読みNの編集先: 全体' });
  await expect(standaloneButton).toHaveText('');
  await standaloneButton.click();
  await expect(standaloneRow.getByRole('menu', { name: '先読みNの編集先: 全体' })).toContainText('編集中: 全体');
});

type MenuState = 'standalone-global' | 'standalone-layout' | 'workspace-default' | 'workspace-changed';

const MENU_STATES: readonly MenuState[] = ['standalone-global', 'standalone-layout', 'workspace-default', 'workspace-changed'];
const MENU_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 761, height: 900 },
  { width: 390, height: 844 },
] as const;

async function openModalFor(page: Page, state: MenuState, size: { width: number; height: number }): Promise<Locator> {
  if (state === 'workspace-default') return openWorkspaceModal(page, size);
  if (state === 'workspace-changed') return openWorkspaceModal(page, size, WORKSPACE_CHANGED);
  const modal = await openStandaloneModal(page, size);
  if (state === 'standalone-layout') {
    // 先頭の行を配列だけの値の編集先にして、「全体へ移す」を持つ行のメニューも測る
    const row = modal.locator('[data-item="windowSize"]');
    await row.getByRole('button', { name: /の編集先: / }).click();
    await row.getByRole('menuitem', { name: /この配列だけ別に/ }).click();
    await row.getByRole('button', { name: '先読みNを1増やす' }).click();
    await expect(row.getByRole('button', { name: /の編集先: この配列$/ })).toBeVisible();
  }
  return modal;
}

for (const state of MENU_STATES) {
  for (const size of MENU_SIZES) {
    test(`編集先のメニュー: 全行で分割されず、モーダルと画面の中に収まり、全項目に当たる（${state}・${size.width}x${size.height}）`, async ({ page }) => {
      const modal = await openModalFor(page, state, size);
      const buttons = modal.locator('.condition-scope-menu > button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(6);
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const label = (await button.getAttribute('aria-label')) ?? `${i}`;
        await button.scrollIntoViewIfNeeded();
        await button.click();
        const menu = modal.getByRole('menu');
        await expect(menu).toBeVisible();
        const result = await menu.evaluate((list) => {
          const rect = list.getBoundingClientRect();
          const style = getComputedStyle(list);
          const children = [...list.children].map((child) => child.getBoundingClientRect().height);
          const frame = list.closest('dialog')!.getBoundingClientRect();
          // 項目（とメニューの見出し）の中心に、その項目自身が当たるか
          const unreachable = [...list.children].filter((child) => {
            const box = child.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return hit === null || !child.contains(hit);
          }).map((child) => (child.textContent ?? '').trim());
          return {
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height },
            frame: { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom },
            expectedHeight: children.reduce((sum, h) => sum + h, 0)
              + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
              + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
            unreachable,
            innerWidth,
            innerHeight,
          };
        });
        const { rect, frame } = result;
        // 分割されていない（段組の列をまたいで描かれると、箱の高さが項目の合計と合わない）
        expect(Math.abs(rect.height - result.expectedHeight), `${label}の高さ`).toBeLessThan(1.5);
        expect(rect.left, `${label}の左端`).toBeGreaterThanOrEqual(Math.max(frame.left, 0) - 0.5);
        expect(rect.right, `${label}の右端`).toBeLessThanOrEqual(Math.min(frame.right, result.innerWidth) + 0.5);
        expect(rect.top, `${label}の上端`).toBeGreaterThanOrEqual(Math.max(frame.top, 0) - 0.5);
        expect(rect.bottom, `${label}の下端`).toBeLessThanOrEqual(Math.min(frame.bottom, result.innerHeight) + 0.5);
        expect(result.unreachable, `${label}の当たらない項目`).toEqual([]);
        // Escapeでメニューだけが閉じ、モーダルは開いたまま、フォーカスはボタンへ戻る
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(modal).toBeVisible();
        await expect(button).toBeFocused();
      }
    });
  }
}

test('編集先のメニューは、本文をスクロールすると閉じる（ボタンから離れた位置に残らない）', async ({ page }) => {
  const modal = await openWorkspaceModal(page, { width: 1280, height: 600 });
  await modal.locator('[data-item="windowSize"]').getByRole('button', { name: /の編集先: / }).click();
  await expect(modal.getByRole('menu')).toBeVisible();
  await modal.locator('.condition-modal-body').evaluate((el) => { el.scrollTop = 40; });
  await expect(modal.getByRole('menu')).toBeHidden();
});

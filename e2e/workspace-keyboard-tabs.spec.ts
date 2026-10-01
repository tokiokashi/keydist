import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのタブをキーボードだけで操作できる（#543）。タブの帯はWAI-ARIAのTabsパターン
 * （手動選択）で、ⓘと×はTabで届き、閉じた後のフォーカスは`body`へ落ちない。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } };
const PANES = [
  { id: 'f', analyzerId: 'bigram-flow', binding: fixedSingle },
  { id: 'c', analyzerId: 'comparison', binding: fixedSet },
  { id: 'n', analyzerId: 'n-sensitivity', binding: fixedSet },
];
const group = (...paneIds: string[]) => ({ kind: 'group', paneIds, weight: 1 });
const row = (...children: unknown[]) => ({ kind: 'split', direction: 'row', weight: 1, children });

/** 左の組に「Bigram Flow」「比較表」の2枚、右の組に「N感度」の1枚。 */
async function openWorkspace(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'k', name: 'キーボード', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: PANES, layout: row(group('f', 'c'), group('n')) });
  await page.goto('/workspace/k');
  await waitForHydration(page);
  await expect(page.getByRole('tab', { name: 'N感度' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const focusedLabel = (page: Page) => page.evaluate(() => {
  const el = document.activeElement;
  if (el === null || el === document.body) return 'body';
  return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${el.getAttribute('aria-label') ?? ''}`;
});

test('タブの帯は tablist / tab / tabpanel で、選択中のタブだけがTabの止まる場所', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.getByRole('tablist')).toHaveCount(2);
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '比較表')).toHaveAttribute('aria-selected', 'false');
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, '比較表')).toHaveAttribute('tabindex', '-1');
  // tabの名前でtabpanelが読める
  await expect(page.getByRole('tabpanel', { name: 'Bigram Flow' })).toHaveCount(1);
  // 選択中でないタブのⓘと×は、Tabの止まる場所に入れない
  // （×とⓘはrole=tabの子なので、役割ではなくクラスで引く）
  await expect(tab(page, '比較表').locator('.dv-default-tab-action')).toHaveAttribute('tabindex', '-1');
  await expect(tab(page, '比較表').locator('.info-button')).toHaveAttribute('tabindex', '-1');
  await expect(tab(page, 'Bigram Flow').locator('.dv-default-tab-action')).toHaveAttribute('tabindex', '0');
  await expect(tab(page, 'Bigram Flow').locator('.info-button')).toHaveAttribute('tabindex', '0');
});

test('Tabでタブへ入り、矢印・Home/Endで動き、Enter・Spaceで選ぶ（自動では選ばない）', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Analyzerを追加' }).focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('tab:Bigram Flow');

  await page.keyboard.press('ArrowRight');
  expect(await focusedLabel(page)).toBe('tab:比較表');
  // 反証: フォーカスが動いただけでは選択は変わらない（手動選択）
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '比較表')).toHaveAttribute('aria-selected', 'false');
  // 端では止まる（輪にしない）
  await page.keyboard.press('ArrowRight');
  expect(await focusedLabel(page)).toBe('tab:比較表');

  await page.keyboard.press('Enter');
  await expect(tab(page, '比較表')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: '比較表' })).toBeVisible();

  await page.keyboard.press('Home');
  expect(await focusedLabel(page)).toBe('tab:Bigram Flow');
  await page.keyboard.press('Space');
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  expect(await focusedLabel(page)).toBe('tab:比較表');
});

test('タブからTabでⓘと×へ届き、Shift+Tabで戻る。×のEnterで閉じる', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Bigram Flow').focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('button:Bigram Flowの説明');
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('button:閉じる');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await focusedLabel(page)).toBe('tab:Bigram Flow');

  // ⓘはフォーカスで説明が出て、Escapeで消える
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  // ×のEnterで閉じる。フォーカスは同じ組に残ったタブへ
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('button:閉じる');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Bigram Flow')).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('tab:比較表');
});

test('矢印で動いたタブのⓘ・×へもTabで届く（Tabの止まる場所はフォーカス中のタブへ移る）', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Bigram Flow').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('button:比較表の説明');
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('button:閉じる');
  await page.keyboard.press('Enter');
  await expect(tab(page, '比較表')).toHaveCount(0);
  // 選択中ではなかったタブを閉じても、選択は変わらない。フォーカスは残ったタブへ
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => focusedLabel(page)).toBe('tab:Bigram Flow');
});

test('Deleteでタブを閉じ、組が空になったら次の組のタブ、最後は「Analyzerを追加」へ', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Bigram Flow').focus();
  await page.keyboard.press('Delete');
  await expect(tab(page, 'Bigram Flow')).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('tab:比較表');

  // 組に1枚だけ残ったタブを閉じると、組ごと消える。フォーカスは読み順で次の組（N感度）のタブへ
  await page.keyboard.press('Delete');
  await expect(tab(page, '比較表')).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('tab:N感度');

  // 最後の1枚を閉じると、ペインが無い状態の「Analyzerを追加」へ
  await page.keyboard.press('Delete');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyzerを追加' })).toBeFocused();
});

test('組をまたぐ閉じ方: 右の組のタブを閉じると、前の組の選択中のタブへ', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'N感度').focus();
  await page.keyboard.press('Delete');
  await expect(tab(page, 'N感度')).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('tab:Bigram Flow');
});

test('ペインの⋯の「閉じる」をキーボードだけで使え、閉じた後のフォーカスもタブと同じ規則', async ({ page }) => {
  await openWorkspace(page);
  const pane = page.locator('.workspace-pane[data-pane-id="f"]');
  await pane.getByRole('button', { name: /の操作$/ }).focus();
  await page.keyboard.press('Enter');
  // 開くとメニューの項目へフォーカスが移る。その中の「閉じる」をEnterで選ぶ
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /閉じる/ }).focus();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Bigram Flow')).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('tab:比較表');
});

test('⋯の「閉じる」で最後のペインを閉じると、「Analyzerを追加」へ', async ({ page }) => {
  await openWorkspace(page);
  for (const name of ['Bigram Flow', '比較表']) {
    await tab(page, name).focus();
    await page.keyboard.press('Delete');
    await expect(tab(page, name)).toHaveCount(0);
  }
  await page.locator('.workspace-pane[data-pane-id="n"]').getByRole('button', { name: /の操作$/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: /閉じる/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyzerを追加' })).toBeFocused();
});

/** 保存した並びで、左の組の前面にあるペインのid。 */
async function savedActivePane(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('keydist:workspaces') ?? '{}') as {
      workspaces?: { layout?: { kind: string; children?: { activePaneId?: string }[] } }[];
    };
    return saved.workspaces?.[0]?.layout?.children?.[0]?.activePaneId;
  });
}

test('並びを書いた直後に別のタブを選んでも、表示・保存・再読み込み後の3つが一致する', async ({ page }) => {
  await openWorkspace(page);
  // 比較表の選択が保存される瞬間に、Bigram FlowへのSpaceを割り込ませる（書いた並びが資産から戻る前の操作）
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fired = false;
    Storage.prototype.setItem = function patched(this: Storage, key: string, value: string) {
      original.call(this, key, value);
      if (!fired && key === 'keydist:workspaces' && value.includes('"activePaneId":"c"')) {
        fired = true;
        document.querySelector('.dv-tab[data-tab-panel-id="f"]')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      }
    };
  });
  await tab(page, 'Bigram Flow').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => savedActivePane(page)).toBe('f');
  await page.reload();
  await waitForHydration(page);
  await expect(tab(page, 'Bigram Flow')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '比較表')).toHaveAttribute('aria-selected', 'false');
});

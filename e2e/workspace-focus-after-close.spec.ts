import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ペインを閉じた後のフォーカスは`body`へ落とさない。⋯の「閉じる」をキーボードだけで使え、
 * 閉じた後は画面の読み順で次のペインの⋯へ、次が無ければ前のペインの⋯へ、最後の1つなら「ペインを追加」へ置く。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } };
const PANES = [
  { id: 'f', analyzerId: 'bigram-flow', binding: fixedSingle },
  { id: 'c', analyzerId: 'comparison', binding: fixedSet },
  { id: 'n', analyzerId: 'n-sensitivity', binding: fixedSet },
];
/** 読み順は左上のBigram Flow、右上の比較表、その下のN感度。 */
const GRID = [
  { id: 'f', x: 0, y: 0, w: 12, h: 16 },
  { id: 'c', x: 12, y: 0, w: 12, h: 16 },
  { id: 'n', x: 0, y: 16, w: 12, h: 14 },
];

async function openWorkspace(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, { id: 'k', name: 'キーボード', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: PANES, grid: GRID });
  await page.goto('/workspace/k');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
}

/** フォーカスのある要素が、どのペインの⋯か（それ以外なら要素の種類）。 */
const focused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement;
  if (el === null || el === document.body) return 'body';
  const pane = el.closest('[data-pane-id]')?.getAttribute('data-pane-id');
  return `${pane ?? '-'}:${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}`;
});

/** ペインの⋯を開き、メニューの「閉じる」をキーボードだけで選ぶ。 */
async function closeByKeyboard(page: Page, id: string): Promise<void> {
  const menu = page.locator(`.workspace-grid-item[data-pane-id="${id}"] .pane-frame-menu`).getByRole('button', { name: /の操作$/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: /閉じる/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /閉じる/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`.workspace-grid-item[data-pane-id="${id}"]`)).toHaveCount(0);
}

test('ペインの⋯の「閉じる」をキーボードだけで使え、閉じた後は読み順で次のペインの⋯へフォーカスが移る', async ({ page }) => {
  await openWorkspace(page);
  await closeByKeyboard(page, 'f');
  await expect.poll(() => focused(page)).toMatch(/^c:/);
  expect(await page.evaluate(() => document.activeElement?.closest('.pane-frame-menu') !== null)).toBe(true);
});

test('読み順で最後のペインを閉じると、前のペインの⋯へ', async ({ page }) => {
  await openWorkspace(page);
  await closeByKeyboard(page, 'n');
  await expect.poll(() => focused(page)).toMatch(/^c:/);
});

test('最後のペインを閉じると、「ペインを追加」へ', async ({ page }) => {
  await openWorkspace(page);
  for (const id of ['f', 'c']) await closeByKeyboard(page, id);
  await closeByKeyboard(page, 'n');
  await expect(page.locator('[data-workspace-empty]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ペインを追加' })).toBeFocused();
});

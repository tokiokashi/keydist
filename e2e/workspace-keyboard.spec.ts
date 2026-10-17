import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { blank, cell, itemOf, open, settle } from './workspace-grid-helper.ts';

/**
 * ペインのつかみ所にフォーカスを置いた時の矢印キーで、ペインを動かし、大きさを変える。
 * 閉じた後の次のペインが使えないAnalyzerの案内なら、フォーカスは案内の「閉じる」ボタンへ移る。
 */

async function seed(page: Page, panes: readonly object[], grid: readonly object[]): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, { id: 'g', name: '格子', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, grid });
  await page.goto('/workspace/g');
  await waitForHydration(page);
}

const handleOf = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"] .workspace-drag-handle`);

test('矢印キーで1マスずつ動かし、Shift+矢印キーで大きさを変える。フォーカスはつかみ所に残る', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 6, 4), cell('b', 6, 8, 6, 4)]);
  const handle = handleOf(page, 'a');
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => itemOf(page, 'a')).toMatchObject({ x: 1, y: 1, w: 6, h: 4 });
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => itemOf(page, 'a')).toMatchObject({ x: 1, y: 1, w: 7, h: 5 });
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => itemOf(page, 'a')).toMatchObject({ x: 1, y: 1, w: 6, h: 4 });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => itemOf(page, 'a')).toMatchObject({ x: 0, y: 0, w: 6, h: 4 });
  await settle(page);
  await expect(handle).toBeFocused();
  await expect(page.locator('.workspace-grid-area [role="status"]')).toContainText('左から1列目、上から1行目、幅6、高さ4');
});

test('動かした先で重なった相手は下へ押され、ペインの順が入れ替わってもフォーカスはつかみ所に残る', async ({ page }) => {
  await open(page, ['a', 'b'], [cell('a', 0, 0, 6, 4), cell('b', 6, 0, 6, 4)]);
  const handle = handleOf(page, 'a');
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => itemOf(page, 'b')).toMatchObject({ x: 6, y: 4 });
  expect(await itemOf(page, 'a')).toMatchObject({ x: 1, y: 0 });
  // bの下端より下まで動かして、読み順をaが後になる側へ入れ替える
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');
  await expect.poll(() => itemOf(page, 'a')).toMatchObject({ y: 6 });
  await settle(page);
  await expect(handle).toBeFocused();
});

test('端と下限で止まり、修飾キーつきの矢印キーは奪わない', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 3, 3)]);
  await handleOf(page, 'a').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  expect(await itemOf(page, 'a')).toMatchObject({ x: 0, y: 0 });
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  const small = await itemOf(page, 'a');
  expect(small.w).toBe(2);
  expect(small.h).toBe(3);
  await page.keyboard.press('Alt+ArrowRight');
  expect(await itemOf(page, 'a')).toMatchObject({ x: 0 });
});

test('つかみ所の説明にキーの割り当てがある', async ({ page }) => {
  await open(page, ['a'], [cell('a', 0, 0, 6, 4)]);
  await expect(handleOf(page, 'a')).toHaveAccessibleDescription(/矢印キーで1マスずつ動かし、Shiftを押しながら矢印キーで大きさを変えます/);
});

test('拡大表示中は矢印キーで動かさない', async ({ page }) => {
  await seed(page, [{ id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } } }], [cell('f', 0, 0, 12, 16)]);
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  await page.locator('.workspace-grid-item[data-pane-id="f"] .pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(page.locator('.workspace-grid-area[data-maximized]')).toBeVisible();
  // 拡大中はつかみ所がTabで届かず、矢印キーを受けない
  await expect(handleOf(page, 'f')).not.toHaveAttribute('tabindex', /.*/);
  await handleOf(page, 'f').focus();
  await page.keyboard.press('ArrowRight');
  expect(await itemOf(page, 'f')).toMatchObject({ x: 0, y: 0 });
});

test('閉じた後の次のペインが使えないAnalyzerの案内なら、案内の「閉じる」ボタンへフォーカスが移る', async ({ page }) => {
  await seed(
    page,
    [blank('a'), { id: 'u', analyzerId: 'future-analyzer', binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [] } } } }],
    [cell('a', 0, 0, 6, 4), cell('u', 6, 0, 8, 8)],
  );
  await expect(page.locator('[data-workspace-pane-notice]')).toHaveCount(1);
  await page.locator('.workspace-grid-item[data-pane-id="a"] .pane-blank-header .pane-menu-button').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: /閉じる/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.workspace-grid-item[data-pane-id="a"]')).toHaveCount(0);
  await expect(page.locator('[data-workspace-pane-notice]').getByRole('button', { name: '閉じる' })).toBeFocused();
});

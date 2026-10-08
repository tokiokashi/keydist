import { expect, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { settleGrid } from './settle-helper.ts';

/** Workspaceの格子のe2eが共有する部品（`workspace-grid.spec.ts`・`workspace-no-compaction.spec.ts`）。 */

export const WORKSPACES_KEY = 'keydist:workspaces';
export const ROW_STEP = 28 + 8;
export const blank = (id: string) => ({ id, analyzerId: 'blank', binding: { mode: 'none' } });

export interface Cell { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export const cell = (id: string, x: number, y: number, w: number, h: number): Cell => ({ id, x, y, w, h });

export async function open(page: Page, ids: readonly string[], grid: readonly Cell[], size = { width: 1440, height: 1200 }, compact = false): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, { id: 'g', name: '格子', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: ids.map(blank), grid, ...(compact ? { compactPanes: true } : {}) });
  await page.goto('/workspace/g');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(ids.length);
  await settle(page);
}

/**
 * ペインの位置・大きさが落ち着くまで待つ。ライブラリは配置が変わると短い動き（200ms）を付けるので、
 * 動いている最中の位置でつかみを探すと外れる（読み込み直後と、離した直後）。
 */
export const settle = settleGrid;

export async function stored(page: Page): Promise<Cell[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return JSON.parse(raw!).workspaces[0].grid;
}

export const itemOf = async (page: Page, id: string) => (await stored(page)).find((item) => item.id === id)!;

/** 1列ぶんの横の幅（列の幅 + 升の間）。格子の面の実寸から求める。 */
export async function colStep(page: Page): Promise<number> {
  const width = (await page.locator('.workspace-grid-area').boundingBox())!.width;
  return (width - 16 - 23 * 8) / 24 + 8;
}

export async function dragHandle(page: Page, id: string, axis: 's' | 'e' | 'w' | 'se', dx: number, dy: number): Promise<void> {
  const box = (await page.locator(`.workspace-grid-item[data-pane-id="${id}"] .react-resizable-handle-${axis}`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  await settle(page);
}

/** ペインの名前のつかみ所を持って`dx`・`dy`だけ動かして離す。 */
export async function dragPane(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const grab = (await page.locator(`.workspace-grid-item[data-pane-id="${id}"] .workspace-drag-handle`).boundingBox())!;
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await settle(page);
}

/** 画面に描かれているペインの上端（ページの上からの画素）。保存した並びと別に、見えている位置を測る。 */
export async function drawnTop(page: Page, id: string): Promise<number> {
  return page.locator(`.workspace-grid-item[data-pane-id="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().y + scrollY));
}


import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * WorkspaceのN感度のペインは、画面に入るまで計算を始めない。入ると計算して数値を出し、
 * 一度出した数値は画面から出ても残る。計算を頼む依頼の有無は、Workerへ送ったメッセージのAnalyzerで数える。
 * 別のペインの拡大表示で隠れている間と、スマホ幅の縦積みで下にあって見えない間も、画面に入っていないものとして扱う。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const DVORAK = { kind: 'layout', layoutId: 'dvorak' };
const set = { kind: 'set', selection: { targets: [QWERTY, DVORAK], colorSlots: [0, 1] } };
const comparison = { id: 'c', analyzerId: 'comparison', binding: { mode: 'fixed', target: set } };
const nsens = { id: 'n', analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: set } };
const flowOf = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } });
const cell = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

const DESKTOP = { width: 1440, height: 900 };
/** 縦に積んだ時、N感度のペインより上に4枚が並んで、最初の画面に入りきらない高さ。 */
const PHONE = { width: 390, height: 600 };

async function open(page: Page, panes: readonly unknown[], grid: readonly unknown[], size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript(
    (value) => {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
      const log = { nSensitivity: 0 };
      (window as unknown as { __log: typeof log }).__log = log;
      const Original = window.Worker;
      window.Worker = class extends Original {
        override postMessage(message: unknown, ...rest: unknown[]) {
          if ((message as { definitionId?: string } | null)?.definitionId === 'n-sensitivity') log.nSensitivity += 1;
          return (super.postMessage as (...args: unknown[]) => void)(message, ...rest);
        }
      } as typeof Worker;
    },
    { id: 'deferred', name: '画面に入ってから計算', text: { ref: { kind: 'builtin', id: 'builtin:en.default' } }, panes, grid },
  );
  await page.goto('/workspace/deferred');
  await waitForHydration(page);
}

const pane = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"], .workspace-stack-pane[data-pane-id="${id}"]`);
const requests = (page: Page) => page.evaluate(() => (window as unknown as { __log: { nSensitivity: number } }).__log.nSensitivity);
const series = (page: Page) => page.locator('[data-n-sensitivity-series]');

/** ほかのペインの計算が済み、画面の外のN感度のペインが待っている状態まで待つ。 */
async function expectWaiting(page: Page): Promise<void> {
  await expect(pane(page, 'c').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
  const waiting = pane(page, 'n').locator('.pane-frame');
  await expect(waiting).toHaveAttribute('data-pane-status', 'idle');
  await expect(waiting.locator('[data-pane-waiting="true"]')).toHaveText('表示すると計算します');
  expect(await requests(page)).toBe(0);
}

test('画面の外のN感度のペインは計算を始めず、画面に入ると数値を出し、出た後は画面から出ても残る', async ({ page }) => {
  await open(page, [comparison, nsens], [cell('c', 0, 0, 16, 9), cell('n', 0, 70, 16, 12)], DESKTOP);
  await expectWaiting(page);

  await pane(page, 'n').scrollIntoViewIfNeeded();
  await expect(series(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(pane(page, 'n').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready');
  expect(await requests(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(pane(page, 'c').locator('.pane-frame')).toBeInViewport();
  await expect(series(page)).toHaveCount(2);
  await expect(pane(page, 'n').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready');
});

test('画面の内にあるN感度のペインは、開いた時に計算する', async ({ page }) => {
  await open(page, [comparison, nsens], [cell('c', 0, 0, 16, 9), cell('n', 0, 10, 16, 12)], DESKTOP);
  await expect(series(page)).toHaveCount(2, { timeout: 15_000 });
  expect(await requests(page)).toBeGreaterThan(0);
});

test('別のペインを拡大表示している間は、N感度のペインが画面の範囲にあっても計算を始めず、戻すと計算する', async ({ page }) => {
  await open(page, [comparison, nsens], [cell('c', 0, 0, 16, 9), cell('n', 0, 70, 16, 12)], DESKTOP);
  await expectWaiting(page);

  await pane(page, 'c').locator('.pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(pane(page, 'c')).toHaveAttribute('data-maximized', 'true');

  // 拡大表示の下に隠れたまま、ページのスクロール位置だけがN感度のペインの位置に来る
  await page.evaluate(() => document.querySelector('.workspace-grid-item[data-pane-id="n"]')!.scrollIntoView());
  await expect(pane(page, 'n').locator('.pane-frame')).toBeInViewport({ ratio: 0.01 });
  // 画面に入っていなくても計算が始まらないことを確かめる時間そのものが条件なので、実時間で待つ
  await page.waitForTimeout(1000);
  expect(await requests(page)).toBe(0);
  await expect(pane(page, 'n').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'idle');

  await pane(page, 'c').locator('.pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '元の大きさに戻す' }).click();
  await expect(series(page)).toHaveCount(2, { timeout: 15_000 });
});

test('スマホ幅で縦に積んだ下のN感度のペインは、スクロールして見えるまで計算せず、見えると数値を出す', async ({ page }) => {
  await open(
    page,
    [flowOf('f1'), flowOf('f2'), flowOf('f3'), comparison, nsens],
    [cell('f1', 0, 0, 8, 16), cell('f2', 0, 16, 8, 16), cell('f3', 0, 32, 8, 16), cell('c', 8, 0, 16, 9), cell('n', 8, 40, 16, 12)],
    PHONE,
  );
  await expect(page.locator('[data-workspace-stack="true"]')).toBeVisible();
  await expectWaiting(page);

  await pane(page, 'n').scrollIntoViewIfNeeded();
  await expect(series(page)).toHaveCount(2, { timeout: 15_000 });
  expect(await requests(page)).toBeGreaterThan(0);
});

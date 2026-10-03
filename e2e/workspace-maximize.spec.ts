import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの拡大表示（#903）。⋯の「拡大表示」で、そのペインをWorkspaceの面いっぱいに広げる。
 * 拡大は見た目だけで、格子の並び（x・y・w・h）・Undoの履歴・保存には触れず、ペインの部品も作り直さない
 * （計算の依頼が出し直されない）。上の帯（文脈バー）と左のメニュー（サイドバー）は見えたまま。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const TEXT = { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } };
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixed = (id: string, layoutId = 'qwerty') => ({
  id,
  analyzerId: 'bigram-flow',
  binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId } } },
});
const PANES = [fixed('a'), fixed('b', 'dvorak'), fixed('c', 'colemak')];
const GRID = [
  { id: 'a', x: 0, y: 0, w: 6, h: 16 },
  { id: 'b', x: 6, y: 0, w: 6, h: 16 },
  { id: 'c', x: 0, y: 16, w: 12, h: 16 },
];

/** 保存先へWorkspaceを直接書き、Workerへの依頼と各ペインの「計算中」の回数を数える仕掛けを入れる。 */
async function open(page: Page, size = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
    const log = { requests: 0, stale: 0 };
    (window as unknown as { __log: typeof log }).__log = log;
    const Original = window.Worker;
    window.Worker = class extends Original {
      override postMessage(message: unknown, ...rest: unknown[]) {
        log.requests += 1;
        return (super.postMessage as (...args: unknown[]) => void)(message, ...rest);
      }
    } as typeof Worker;
    new MutationObserver((records) => {
      for (const record of records) {
        if ((record.target as Element).getAttribute('data-pane-status') === 'stale') log.stale += 1;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pane-status'] });
  }, { key: WORKSPACES_KEY, value: { id: 'm', name: '拡大', text: TEXT, panes: PANES, grid: GRID, groups: [{ id: 'g1', target: { single: QWERTY } }] } });
  await page.goto('/workspace/m');
  await waitForHydration(page);
}

async function openReady(page: Page, size?: { width: number; height: number }): Promise<void> {
  await open(page, size);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(PANES.length, { timeout: 15_000 });
  await settle(page);
  await waitForRequestsQuiet(page);
}

/** 開いた直後の計算（見えていないペインのぶんも含む）が済むまで待つ。依頼の数が600ms動かなければ済んだとみなす。 */
async function waitForRequestsQuiet(page: Page): Promise<void> {
  let previous = -1;
  await expect.poll(async () => {
    const current = await page.evaluate(() => (window as unknown as { __log: { requests: number } }).__log.requests);
    const quiet = current === previous;
    previous = current;
    if (!quiet) await page.waitForTimeout(600);
    return quiet;
  }).toBe(true);
}

/** ペインの位置・大きさが落ち着くまで待つ（ライブラリの配置の動き 200ms と、拡大の出入りの後）。 */
async function settle(page: Page): Promise<void> {
  let last = (await rects(page)).join('|');
  let stable = 0;
  while (stable < 4) {
    await page.waitForTimeout(100);
    const now = (await rects(page)).join('|');
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

/** 各ペインの枠の矩形（整数に丸めた文字列）。 */
function rects(page: Page): Promise<string[]> {
  return page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return `${el.getAttribute('data-pane-id')}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
  }));
}

const menuButton = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"] .pane-menu-button[aria-label$="の操作"]`);
const isMaximized = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`).evaluate((el) => el.hasAttribute('data-maximized'));
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: { requests: number; stale: number } }).__log);

async function maximize(page: Page, id: string): Promise<void> {
  await menuButton(page, id).click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect.poll(() => isMaximized(page, id)).toBe(true);
  await settle(page);
}

test('拡大すると面いっぱいになり、上の帯と左のメニューは見えたまま。他のペインは操作できない', async ({ page }) => {
  await openReady(page);
  await maximize(page, 'a');

  const box = (await page.locator('.workspace-grid-item[data-pane-id="a"]').boundingBox())!;
  const bar = (await page.locator('.context-bar').boundingBox())!;
  const area = (await page.locator('.workspace-grid-area').boundingBox())!;
  const view = page.viewportSize()!;
  // 帯の下・面の左端から、画面の右下まで（外周の余白 8px を除いて使い切る）
  expect(Math.abs(box.y - (bar.y + bar.height + 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x - (area.x + 8))).toBeLessThanOrEqual(1);
  expect(box.x + box.width).toBeGreaterThanOrEqual(view.width - 8 - 20);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width - 8 + 1);
  expect(Math.abs(box.y + box.height - (view.height - 8))).toBeLessThanOrEqual(1);
  // 元の6列より広く、元の高さより高い
  expect(box.width).toBeGreaterThan(area.width * 0.9);
  expect(box.height).toBeGreaterThan(500);

  // 帯とサイドバーは見えたまま、拡大したペインに隠されない
  await expect(page.locator('.context-bar')).toBeVisible();
  await expect(page.locator('.app-sidebar')).toBeVisible();
  const covered = await page.evaluate(() => {
    const top = (selector: string) => {
      const el = document.querySelector(selector)!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 20));
      return hit !== null && el.contains(hit);
    };
    return { bar: top('.context-bar'), sidebar: top('.app-sidebar') };
  });
  expect(covered).toEqual({ bar: true, sidebar: true });

  // 他のペインは操作できない（フォーカスが入らず、押しても届かない）。拡大したペインの上には何も重ならない
  await expect(page.locator('.workspace-grid-item[data-pane-id="b"]')).toHaveAttribute('inert', '');
  await expect(page.locator('.workspace-grid-item[data-pane-id="a"]')).not.toHaveAttribute('inert', '');
  const center = await page.evaluate(() => {
    const r = document.querySelector('.workspace-grid-item[data-pane-id="a"]')!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width - 30, r.y + r.height - 30);
    return hit?.closest('.workspace-grid-item')?.getAttribute('data-pane-id');
  });
  expect(center).toBe('a');
});

test('拡大中のドラッグ・大きさの変更は効かない', async ({ page }) => {
  await openReady(page);
  await maximize(page, 'a');
  const savedBefore = await stored(page);
  const rectsBefore = await rects(page);

  const grab = (await page.locator('.workspace-grid-item[data-pane-id="a"] .workspace-drag-handle').boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + 300, grab.y + 200, { steps: 10 });
  await page.mouse.up();
  // 右下の角（大きさのつまみがあった所）も同じ
  const view = page.viewportSize()!;
  await page.mouse.move(view.width - 12, view.height - 12);
  await page.mouse.down();
  await page.mouse.move(view.width - 200, view.height - 200, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  expect(await rects(page)).toEqual(rectsBefore);
  await page.waitForTimeout(800);
  expect(await stored(page)).toBe(savedBefore);
  await expect(page.locator('.workspace-grid-item .react-resizable-handle:visible')).toHaveCount(0);
});

test('戻すと全ペインが元の矩形に戻る。保存した格子は変わらず、元に戻すの履歴も増えない。フォーカスは⋯に残る', async ({ page }) => {
  await openReady(page);
  const rectsBefore = await rects(page);
  const savedBefore = await stored(page);
  const undo = page.locator('.context-bar').getByRole('button', { name: '元に戻す' });
  await expect(undo).toBeDisabled();

  await maximize(page, 'a');
  // 拡大したペインは元と違う矩形、他のペインは動かない
  const during = await rects(page);
  expect(during[0]).not.toBe(rectsBefore[0]);
  expect(during.slice(1)).toEqual(rectsBefore.slice(1));
  await expect(menuButton(page, 'a')).toBeFocused();
  await expect(undo).toBeDisabled();

  await menuButton(page, 'a').click();
  await expect(page.getByRole('menuitem', { name: '拡大表示' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '元の大きさに戻す' }).click();
  await expect.poll(() => isMaximized(page, 'a')).toBe(false);
  await settle(page);

  expect(await rects(page)).toEqual(rectsBefore);
  await expect(menuButton(page, 'a')).toBeFocused();
  await page.waitForTimeout(800);
  expect(await stored(page)).toBe(savedBefore);
  await expect(undo).toBeDisabled();
});

test('拡大して戻しても、計算の依頼は出し直されず、計算中にもならない', async ({ page }) => {
  await openReady(page);
  await page.evaluate(() => {
    const l = (window as unknown as { __log: { requests: number; stale: number } }).__log;
    l.requests = 0;
    l.stale = 0;
    // 部品が作り直されていないことの印。作り直されると、新しい要素には印が無い（計算済みの結果は使い回されて
    // 依頼の数には出ないので、依頼の数だけでは作り直しを見逃す）
    document.querySelectorAll('.pane-frame').forEach((el) => el.setAttribute('data-mounted-mark', '1'));
  });

  await maximize(page, 'b');
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page, 'b')).toBe(false);
  await maximize(page, 'c');
  await menuButton(page, 'c').click();
  await page.getByRole('menuitem', { name: '元の大きさに戻す' }).click();
  await expect.poll(() => isMaximized(page, 'c')).toBe(false);
  await settle(page);

  await page.waitForTimeout(800);
  expect(await log(page)).toEqual({ requests: 0, stale: 0 });
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(PANES.length);
  await expect(page.locator('.pane-frame[data-mounted-mark="1"]')).toHaveCount(PANES.length);
});

test('Escapeで戻り、フォーカスは拡大したペインの⋯へ置く。開いているメニューのEscapeはメニューを閉じるだけ', async ({ page }) => {
  await openReady(page);
  const rectsBefore = await rects(page);

  // キーボードだけで拡大する（⋯ → 先頭の項目）
  await menuButton(page, 'a').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(() => isMaximized(page, 'a')).toBe(true);
  await expect(menuButton(page, 'a')).toBeFocused();

  // メニューを開いてEscape: メニューだけ閉じ、拡大は残る
  await menuButton(page, 'a').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await isMaximized(page, 'a')).toBe(true);

  // フォーカスが他へ移っていても（bodyにあっても）、Escapeで戻って⋯へフォーカスが戻る
  await menuButton(page, 'a').blur();
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page, 'a')).toBe(false);
  await settle(page);
  expect(await rects(page)).toEqual(rectsBefore);
  await expect(menuButton(page, 'a')).toBeFocused();
});

test('拡大したまま再読み込みすると、拡大は解けて元の並びで開く', async ({ page }) => {
  await openReady(page);
  const rectsBefore = await rects(page);
  await maximize(page, 'a');
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(PANES.length, { timeout: 15_000 });
  await settle(page);
  expect(await page.locator('.workspace-grid-item[data-maximized]').count()).toBe(0);
  expect(await rects(page)).toEqual(rectsBefore);
});

test('拡大中にそのペインを複製すると拡大が解け、閉じても解ける', async ({ page }) => {
  await openReady(page);
  await maximize(page, 'a');
  await menuButton(page, 'a').click();
  await page.getByRole('menuitem', { name: '複製' }).click();
  await expect.poll(() => page.locator('.workspace-grid-item[data-maximized]').count()).toBe(0);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(4);

  await maximize(page, 'b');
  await menuButton(page, 'b').click();
  await page.getByRole('menuitem', { name: '閉じる' }).click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  expect(await page.locator('.workspace-grid-item[data-maximized]').count()).toBe(0);
});

test('背面のペインで開いていた解析設定の小窓は、拡大すると閉じ、拡大したペインの上に残らない', async ({ page }) => {
  await openReady(page);
  await page.locator('.workspace-grid-item[data-pane-id="b"]').getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('.settings-window')).toBeVisible();
  await maximize(page, 'a');
  await expect(page.locator('.settings-window')).toHaveCount(0);
  // 小窓が残らないので、Escapeで拡大が解ける
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page, 'a')).toBe(false);
});

test('図の表示（Escapeで閉じない開閉）を開いていても、Escapeで拡大が解ける（拡大したペインで開いた場合・背面で開いてから拡大した場合）', async ({ page }) => {
  await openReady(page);
  const toggle = (id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"] button[aria-label$="の表示"]`).first();
  // 背面（b）で開いてから拡大する
  await toggle('b').click();
  await expect(toggle('b')).toHaveAttribute('aria-expanded', 'true');
  await maximize(page, 'a');
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page, 'a')).toBe(false);

  // 拡大したペイン（a）で開く
  await maximize(page, 'a');
  await toggle('a').click();
  await expect(toggle('a')).toHaveAttribute('aria-expanded', 'true');
  await toggle('a').blur();
  await page.keyboard.press('Escape');
  await expect.poll(() => isMaximized(page, 'a')).toBe(false);
});

test('拡大中にTabを回しても、フォーカスは拡大したペイン・上の帯・左のメニューの外へ行かず、「ペインを追加」には入らない', async ({ page }) => {
  await openReady(page);
  await maximize(page, 'a');
  await expect(page.locator('.workspace-toolbar')).toHaveAttribute('inert', '');
  await menuButton(page, 'a').focus();
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return 'body';
      if (el.closest('.workspace-toolbar') !== null) return 'toolbar';
      const item = el.closest('.workspace-grid-item');
      if (item !== null) return item.hasAttribute('data-maximized') ? 'maximized' : 'other-pane';
      if (el.closest('.context-bar') !== null) return 'bar';
      if (el.closest('.app-sidebar') !== null) return 'sidebar';
      return 'other';
    });
    expect(['maximized', 'bar', 'sidebar', 'body', 'other'], `Tab ${i + 1}回目: ${where}`).toContain(where);
    expect(where).not.toBe('other');
  }
});

test('拡大中に元に戻す・やり直すを押すと、拡大が解ける', async ({ page }) => {
  await openReady(page);
  const undo = page.locator('.context-bar').getByRole('button', { name: '元に戻す' });
  const redo = page.locator('.context-bar').getByRole('button', { name: 'やり直す' });
  // 履歴を作る（cを閉じる）
  await menuButton(page, 'c').click();
  await page.getByRole('menuitem', { name: '閉じる' }).click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await settle(page);

  await maximize(page, 'a');
  await undo.click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await expect.poll(() => page.locator('.workspace-grid-item[data-maximized]').count()).toBe(0);
  await settle(page);

  await maximize(page, 'a');
  await redo.click();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await expect.poll(() => page.locator('.workspace-grid-item[data-maximized]').count()).toBe(0);
});

test('縦積み（スマホ幅）の⋯には「拡大表示」が出ない', async ({ page }) => {
  await open(page, { width: 700, height: 900 });
  await expect(page.locator('.workspace-stack-pane').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('.workspace-stack-pane[data-pane-id="a"] .pane-menu-button[aria-label$="の操作"]').click();
  await expect(page.getByRole('menuitem', { name: '複製' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /拡大表示|元の大きさに戻す/ })).toHaveCount(0);
});

import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceの打鍵再生のペインどうしで、「再生／一時停止」と「停止」の操作が全部のペインに伝わる。
 * 1ステップ送りとスライダーは、そのペインだけが動く。
 */

const playback = (id: string, layoutId: string, options?: Record<string, unknown>) => ({
  id,
  analyzerId: 'playback',
  binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId } } },
  ...(options === undefined ? {} : { options }),
});

async function open(page: Page, panes: readonly { readonly id: string }[]): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, {
    id: 'p',
    name: '再生',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes,
    grid: panes.map((pane, i) => ({ id: pane.id, x: (i % 2) * 12, y: Math.floor(i / 2) * 24, w: 12, h: 24 })),
  });
  await page.goto('/workspace/p');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(panes.length, { timeout: 30_000 });
  await expect(page.locator('[data-playback-action="toggle"]')).toHaveCount(panes.length);
}

const pane = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);
const button = (page: Page, id: string, action: string): Locator => pane(page, id).locator(`[data-playback-action="${action}"]`);

async function cursor(page: Page, id: string): Promise<number> {
  const text = await pane(page, id).locator('[data-playback-position]').innerText();
  return Number(/^(\d+) \//.exec(text)?.[1]);
}

const playing = (page: Page, id: string) => button(page, id, 'toggle').innerText().then((text) => text.includes('一時停止'));

test('停止のあとに再生すると全部のペインが同じ時刻に先頭から始まり、一時停止で同じ位置に並ぶ', async ({ page }) => {
  await open(page, [playback('a', 'qwerty'), playback('b', 'qwerty')]);
  await button(page, 'a', 'toggle').click();
  await expect.poll(() => cursor(page, 'a')).toBeGreaterThan(2);
  await button(page, 'a', 'stop').click();
  expect([await cursor(page, 'a'), await cursor(page, 'b')]).toEqual([0, 0]);

  await button(page, 'b', 'toggle').click();
  await expect.poll(async () => (await playing(page, 'a')) && (await playing(page, 'b'))).toBe(true);
  await expect.poll(() => cursor(page, 'a')).toBeGreaterThan(2);
  // 一時停止は1回の操作で全部のペインを同じ描画の確定の中で止めるので、位置は同じ
  await button(page, 'a', 'toggle').click();
  const [a, b] = [await cursor(page, 'a'), await cursor(page, 'b')];
  expect(a).toBeGreaterThan(0);
  expect(b).toBe(a);
  expect(await playing(page, 'b')).toBe(false);
});

test('再生倍率が違うペインにも伝わり、1ステップ送りとスライダーはそのペインだけが動く。先頭のペインの停止で進んだ他のペインが戻る', async ({ page }) => {
  await open(page, [playback('a', 'qwerty'), playback('b', 'dvorak', { speedMultiplier: 2 })]);
  await button(page, 'a', 'toggle').click();
  await expect.poll(async () => (await cursor(page, 'a')) > 1 && (await cursor(page, 'b')) > 1).toBe(true);
  expect(await playing(page, 'b')).toBe(true);
  await button(page, 'b', 'toggle').click();
  await expect.poll(async () => (await playing(page, 'a')) || (await playing(page, 'b'))).toBe(false);

  // 1ステップ送りはそのペインだけ
  const before = await cursor(page, 'b');
  await button(page, 'a', 'forward').click();
  expect(await cursor(page, 'b')).toBe(before);

  // スライダーもそのペインだけ
  await pane(page, 'a').locator('[data-playback-seek]').fill('0');
  expect(await cursor(page, 'a')).toBe(0);
  expect(await cursor(page, 'b')).toBe(before);

  // 先頭で止まっているaの停止で、進んだbが先頭へ戻る
  await expect(button(page, 'a', 'stop')).toBeEnabled();
  await button(page, 'a', 'stop').click();
  expect(await cursor(page, 'b')).toBe(0);
  await expect(button(page, 'a', 'stop')).toBeDisabled();
});

test('拡大表示の間も、隠れたペインに操作が伝わる', async ({ page }) => {
  await open(page, [playback('a', 'qwerty'), playback('b', 'qwerty')]);
  await pane(page, 'a').locator('.pane-frame-menu').getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(pane(page, 'a')).toHaveAttribute('data-maximized', 'true');

  await button(page, 'a', 'toggle').click();
  await expect.poll(() => cursor(page, 'b')).toBeGreaterThan(1);
  await button(page, 'a', 'toggle').click();
  await expect(pane(page, 'a')).toHaveAttribute('data-maximized', 'true');
  const a = await cursor(page, 'a');
  expect(await cursor(page, 'b')).toBe(a);
});

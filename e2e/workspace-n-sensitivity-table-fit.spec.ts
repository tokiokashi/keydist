import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * N感度の「各Nの実測値」の表は、Workspaceのペインで図の下の余りに収まる時は開いて始まり、
 * 収まらない時だけ畳んで始まる（#837）。判定は表が初めて大きさを持った時に一度だけで、以後は利用者の開閉に従う。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const LAYOUT_IDS_17 = [
  'qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi', 'naginata-v18', 'nicola', 'shin-koume', 'asuka',
  'shin-jis-prefix', 'shin-jis-simultaneous', 'shingeta', 'tsuki-2-263', 'kawasemi-kai', 'kawasemi-plus', 'oonishi-custom',
];
const setOf = (ids: readonly string[]) => ({
  kind: 'set',
  selection: { targets: ids.map((layoutId) => ({ kind: 'layout', layoutId })), colorSlots: ids.map((_, i) => i % 8) },
});
const nsensOf = (ids: readonly string[]) => ({ id: 'n', analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: setOf(ids) } });
const nsens2 = nsensOf(['qwerty', 'dvorak']);
const nsens17 = nsensOf(LAYOUT_IDS_17);
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const group = (id: string) => ({ kind: 'group', paneIds: [id], weight: 1 });
const row = (...children: unknown[]) => ({ kind: 'split', direction: 'row', weight: 1, children });

/** N感度＋Bigram Flow×2 を横に3つ並べる（N感度の下に、頭打ちの図の余りができる）。 */
const threePanes = (nsensPane: unknown) => ({
  panes: [nsensPane, { ...flow, id: 'f1' }, { ...flow, id: 'f2' }],
  layout: row(group('n'), group('f1'), group('f2')),
});

async function seed(page: Page, panes: readonly unknown[], layout: unknown) {
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, { id: 'fit', name: '収まりの確認', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout });
}

async function openWorkspace(page: Page, panes: readonly unknown[], layout: unknown, size: { width: number; height: number }, seriesCount = 2) {
  await page.setViewportSize(size);
  await seed(page, panes, layout);
  await page.goto('/workspace/fit');
  await waitForHydration(page);
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(seriesCount, { timeout: 15_000 });
  // 図の大きさが領域の実寸に合うまで待つ
  await expect.poll(() => page.locator('.n-sensitivity-svg').first().evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    return Math.abs(box.width - w!) < 1.5 && Math.abs(box.height - h!) < 1.5;
  })).toBe(true);
}

const isOpen = (page: Page) => page.locator('details.n-sensitivity-table-details').evaluate((el: HTMLDetailsElement) => el.open);

function measure(page: Page) {
  return page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="n-sensitivity"]')!;
    const body = feature.closest('.pane-body')!;
    const svg = feature.querySelector('.n-sensitivity-svg')!.getBoundingClientRect();
    return {
      bodyHeight: body.getBoundingClientRect().height,
      bodyBottom: body.getBoundingClientRect().bottom,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      svgWidth: svg.width,
      svgHeight: svg.height,
      detailsBottom: feature.querySelector('details')!.getBoundingClientRect().bottom,
    };
  });
}

test('余りに表が収まる時（2件・3ペイン 1440×900）は開いて始まり、図の大きさは頭打ちのまま', async ({ page }) => {
  const { panes, layout } = threePanes(nsens2);
  await openWorkspace(page, panes, layout, { width: 1440, height: 900 });
  expect(await isOpen(page)).toBe(true);
  await expect(page.locator('.n-sensitivity-table')).toBeVisible();
  const m = await measure(page);
  expect(m.svgHeight).toBeLessThanOrEqual(m.svgWidth + 1);
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
  expect(m.detailsBottom).toBeLessThanOrEqual(m.bodyBottom + 1);
});

test('余りに表が収まらない時（17件・3ペイン 1440×900）は畳んで始まる', async ({ page }) => {
  const { panes, layout } = threePanes(nsens17);
  await openWorkspace(page, panes, layout, { width: 1440, height: 900 }, 17);
  expect(await isOpen(page)).toBe(false);
  const m = await measure(page);
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
});

test('判定の境目の高さでも、開閉と図の描画は振動せず、開いた時にペインの本体が溢れない', async ({ page }) => {
  const { panes, layout } = threePanes(nsens2);
  test.setTimeout(180_000);
  const states = new Set<boolean>();
  // 画面の高さを刻んで開き直し、表が収まる高さから収まらない高さまでを通る
  for (let height = 900; height >= 520; height -= 30) {
    await openWorkspace(page, panes, layout, { width: 1440, height });
    const frames = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const out: string[] = [];
      const tick = () => {
        const svg = document.querySelector('.n-sensitivity-svg')!;
        const details = document.querySelector('details.n-sensitivity-table-details') as HTMLDetailsElement;
        out.push(`${details.open}|${svg.getAttribute('viewBox')}|${(svg.parentElement as HTMLElement).clientHeight}`);
        if (out.length >= 30) resolve(out);
        else setTimeout(tick, 16);
      };
      setTimeout(tick, 16);
    }));
    expect(new Set(frames).size, `高さ ${height}: ${frames[0]} / ${frames[frames.length - 1]}`).toBe(1);
    const open = frames[0]!.startsWith('true');
    states.add(open);
    if (open) {
      const m = await measure(page);
      expect(m.bodyScrollHeight, `高さ ${height}`).toBeLessThanOrEqual(m.bodyClientHeight + 1);
    }
  }
  // 開いて始まる高さと畳んで始まる高さの両方を通っている（境目を跨いでいる）
  expect([...states].sort()).toEqual([false, true]);
});

test('開いた後にペインを小さくしても、利用者が畳んだ後に大きくしても、勝手に開閉しない', async ({ page }) => {
  const { panes, layout } = threePanes(nsens2);
  await openWorkspace(page, panes, layout, { width: 1440, height: 900 });
  expect(await isOpen(page)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 520 });
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeLessThan(400);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(true);
  await page.getByText('各Nの実測値 [u]', { exact: true }).click();
  expect(await isOpen(page)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeGreaterThan(800);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(false);
});

test('畳んで始まった表は、ペインを大きくしても勝手に開かない', async ({ page }) => {
  const { panes, layout } = threePanes(nsens17);
  await openWorkspace(page, panes, layout, { width: 1440, height: 900 }, 17);
  expect(await isOpen(page)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1800 });
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeGreaterThan(1300);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(false);
});

for (const [name, pane, count, expected] of [
  ['収まれば開く', nsens2, 2, true],
  ['収まらなければ畳む', nsens17, 17, false],
] as const) {
  test(`裏のタブにあったN感度も、表示した時の余りで判定される（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await seed(
      page,
      [flow, pane, { ...flow, id: 'f2' }],
      row({ kind: 'group', paneIds: ['f', 'n'], weight: 1, activePaneId: 'f' }, group('f2')),
    );
    await page.goto('/workspace/fit');
    await waitForHydration(page);
    await expect(page.locator('[data-react-feature="bigram-flow"]').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    // 表示後の各フレームで、描画の直前（rAFの中で作ったResizeObserverのcallback。アプリのものより後に呼ばれる）に、
    // 大きさを持った表が開いたまま描かれようとしていないかを記録する
    await page.evaluate(() => {
      const w = window as unknown as { __drawnOpen: number; __frames: number };
      w.__drawnOpen = 0;
      w.__frames = 0;
      const frame = () => {
        const details = document.querySelector('details.n-sensitivity-table-details') as HTMLDetailsElement | null;
        if (details) {
          const observer = new ResizeObserver(() => {
            observer.disconnect();
            if (details.offsetWidth > 0 && details.open && !(details as HTMLElement).dataset.userOpened) w.__drawnOpen += 1;
          });
          observer.observe(details);
        }
        w.__frames += 1;
        if (w.__frames < 400) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await page.locator('.dv-tab', { hasText: 'N感度' }).click();
    await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(count, { timeout: 15_000 });
    await expect.poll(() => isOpen(page)).toBe(expected);
    await page.waitForTimeout(300);
    expect(await isOpen(page)).toBe(expected);
    // 畳むと決まる場合に、開いた表が描かれたフレームが無い（収まる場合は開くのが正なので数えない）
    if (!expected) expect(await page.evaluate(() => (window as unknown as { __drawnOpen: number }).__drawnOpen)).toBe(0);
  });
}

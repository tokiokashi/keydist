import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * N感度の「各Nの実測値」の表は、Workspaceのペインで図の下の余りに収まる時は開いて始まり、
 * 収まらない時だけ畳んで始まる（#837）。判定は表が初めて大きさを持った時に一度だけで、以後は利用者の開閉に従う。
 * ペインの大きさは格子（1升 = 28px、升の間 8px、列は12）で決まる。
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
const cell = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

/** N感度＋Bigram Flow×2 を横に3つ並べる（N感度の下に、頭打ちの図の余りができる）。高さは行数（既定の22行は784px）。 */
const threePanes = (nsensPane: unknown, rows = 22) => ({
  panes: [nsensPane, { ...flow, id: 'f1' }, { ...flow, id: 'f2' }],
  grid: [cell('n', 0, 0, 4, rows), cell('f1', 4, 0, 4, rows), cell('f2', 8, 0, 4, rows)],
});

async function seed(page: Page, panes: readonly unknown[], grid: unknown) {
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, { id: 'fit', name: '収まりの確認', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, grid });
}

async function openWorkspace(page: Page, panes: readonly unknown[], grid: unknown, size: { width: number; height: number }, seriesCount = 2) {
  await page.setViewportSize(size);
  await seed(page, panes, grid);
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

/** N感度のペインの右下の角をつかんで、`dy`（画素）だけ縦に動かす。 */
async function dragCornerBy(page: Page, dy: number): Promise<void> {
  // ライブラリの配置の動き（200ms）が済んでから、つかみを探す
  await page.waitForTimeout(400);
  const corner = (await page.locator('.workspace-grid-item[data-pane-id="n"] .react-resizable-handle-se').boundingBox())!;
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
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

test('余りに表が収まる時（2件・3ペイン 各4列 x 22行）は開いて始まり、図の大きさは頭打ちのまま', async ({ page }) => {
  const { panes, grid } = threePanes(nsens2);
  await openWorkspace(page, panes, grid, { width: 1440, height: 900 });
  expect(await isOpen(page)).toBe(true);
  await expect(page.locator('.n-sensitivity-table')).toBeVisible();
  const m = await measure(page);
  expect(m.svgHeight).toBeLessThanOrEqual(m.svgWidth + 1);
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
  expect(m.detailsBottom).toBeLessThanOrEqual(m.bodyBottom + 1);
});

test('余りに表が収まらない時（17件・3ペイン 各4列 x 22行）は畳んで始まる', async ({ page }) => {
  const { panes, grid } = threePanes(nsens17);
  await openWorkspace(page, panes, grid, { width: 1440, height: 900 }, 17);
  expect(await isOpen(page)).toBe(false);
  const m = await measure(page);
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
});

test('判定の境目の高さでも、開閉と図の描画は振動せず、開いた時にペインの本体が溢れない', async ({ page }) => {
  test.setTimeout(180_000);
  const states = new Set<boolean>();
  // ペインの行数を刻んで開き直し、表が収まる高さから収まらない高さまでを通る（22行 → 11行）
  for (let rows = 22; rows >= 11; rows -= 1) {
    const { panes, grid } = threePanes(nsens2, rows);
    await openWorkspace(page, panes, grid, { width: 1440, height: 900 });
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
    expect(new Set(frames).size, `${rows}行: ${frames[0]} / ${frames[frames.length - 1]}`).toBe(1);
    const open = frames[0]!.startsWith('true');
    states.add(open);
    if (open) {
      const m = await measure(page);
      expect(m.bodyScrollHeight, `${rows}行`).toBeLessThanOrEqual(m.bodyClientHeight + 1);
    }
  }
  // 開いて始まる高さと畳んで始まる高さの両方を通っている（境目を跨いでいる）
  expect([...states].sort()).toEqual([false, true]);
});

test('開いた後にペインを小さくしても、利用者が畳んだ後に大きくしても、勝手に開閉しない', async ({ page }) => {
  const { panes, grid } = threePanes(nsens2);
  await openWorkspace(page, panes, grid, { width: 1440, height: 1800 });
  expect(await isOpen(page)).toBe(true);
  // ペインの下の辺を10行（360px）縮める
  await dragCornerBy(page, -360);
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeLessThan(400);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(true);
  await page.getByText('各Nの実測値 [u]', { exact: true }).click();
  expect(await isOpen(page)).toBe(false);
  // 18行（648px）伸ばす
  await dragCornerBy(page, 648);
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeGreaterThan(800);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(false);
});

test('畳んで始まった表は、ペインを大きくしても勝手に開かない', async ({ page }) => {
  const { panes, grid } = threePanes(nsens17);
  await openWorkspace(page, panes, grid, { width: 1440, height: 1800 }, 17);
  expect(await isOpen(page)).toBe(false);
  // 19行（684px）伸ばす
  await dragCornerBy(page, 684);
  await expect.poll(async () => (await measure(page)).bodyHeight).toBeGreaterThan(1300);
  await page.waitForTimeout(300);
  expect(await isOpen(page)).toBe(false);
});

import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * N感度のグラフがWorkspaceのペインの残りの高さに合わせて伸縮し、実測値の表を畳んで始める（#808）。
 * 個別画面（高さが図で決まる）には効かないことも確かめる。
 */

const REM = 16;
/** 図の領域の下限（n-sensitivity-view.css の min-height: 12rem）。 */
const CHART_FLOOR = 12 * REM;

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const set = { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } };
const nsens = { id: 'n', analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: set } };
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const group = (id: string) => ({ kind: 'group', paneIds: [id], weight: 1 });
const split = (direction: string, ...children: unknown[]) => ({ kind: 'split', direction, weight: 1, children });

async function openWorkspace(page: Page, panes: readonly unknown[], layout: unknown, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, { id: 'fit', name: '収まりの確認', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout });
  await page.goto('/workspace/fit');
  await waitForHydration(page);
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 15_000 });
  // 図の大きさが領域の実寸に合うまで待つ（最初の描画は既定の幅）
  await expect.poll(() => page.locator('.n-sensitivity-svg').first().evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    return Math.abs(box.width - w!) < 1.5 && Math.abs(box.height - h!) < 1.5;
  })).toBe(true);
}

/** 個別画面を、配列2つの集合で開く。 */
async function openStandalone(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: ['qwerty', 'dvorak'].map((layoutId) => ({ kind: 'layout', layoutId })) }),
    );
  });
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 15_000 });
}

/** N感度のペインの本体と図・表の位置（図は先頭のN感度のもの）。 */
function measure(page: Page) {
  return page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="n-sensitivity"]')!;
    const body = feature.closest('.pane-body')!;
    const pane = feature.closest('.workspace-pane')!;
    const svg = feature.querySelector('.n-sensitivity-svg')!.getBoundingClientRect();
    const details = feature.querySelector('details')!;
    return {
      bodyHeight: body.getBoundingClientRect().height,
      bodyBottom: body.getBoundingClientRect().bottom,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      paneScrollHeight: pane.scrollHeight,
      paneClientHeight: pane.clientHeight,
      svgWidth: svg.width,
      svgHeight: svg.height,
      svgBottom: svg.bottom,
      detailsOpen: details.open,
      detailsBottom: details.getBoundingClientRect().bottom,
    };
  });
}

/** 凡例の枠と線・点の重なり（standalone-n-sensitivity.spec.ts の検査と同じ）。 */
function measureLegend(page: Page) {
  return page.locator('.n-sensitivity-svg').first().evaluate((svg) => {
    const svgRect = svg.getBoundingClientRect();
    const frame = svg.querySelector('.n-sensitivity-legend-frame')!.getBoundingClientRect();
    const touches = (x: number, y: number) => x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
    let linePointsInside = 0;
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-n-sensitivity-series] path')) {
      const matrix = path.getScreenCTM()!;
      const length = path.getTotalLength();
      for (let at = 0; at <= length; at += 1) {
        const point = path.getPointAtLength(at).matrixTransform(matrix);
        if (touches(point.x, point.y)) linePointsInside += 1;
      }
    }
    let dotsInside = 0;
    for (const circle of svg.querySelectorAll('.n-sensitivity-point')) {
      const r = circle.getBoundingClientRect();
      if (r.right >= frame.left && r.left <= frame.right && r.bottom >= frame.top && r.top <= frame.bottom) dotsInside += 1;
    }
    return {
      insideSvg: frame.left >= svgRect.left && frame.right <= svgRect.right && frame.top >= svgRect.top && frame.bottom <= svgRect.bottom,
      linePointsInside,
      dotsInside,
    };
  });
}

test('Workspaceでは実測値の表が畳まれて始まり、キーボードで開ける', async ({ page }) => {
  await openWorkspace(page, [nsens], group('n'), { width: 1440, height: 900 });
  const summary = page.getByText('各Nの実測値 [u]', { exact: true });
  await expect(summary).toBeVisible();
  expect((await measure(page)).detailsOpen).toBe(false);
  await expect(page.locator('.n-sensitivity-table')).toBeHidden();
  // 畳んでいても、見出しにTabで届き、Enterで開く
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.n-sensitivity-table')).toBeVisible();
  expect((await measure(page)).detailsOpen).toBe(true);
  // 開くと表の名前が読み上げに届く
  await expect(page.getByRole('table', { name: '各Nの実測値 [u]' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'QWERTY' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.n-sensitivity-table')).toBeHidden();
});

test('個別画面では実測値の表が開いている', async ({ page }) => {
  await openStandalone(page);
  await expect(page.locator('.n-sensitivity-table')).toBeVisible();
  expect(await page.locator('details.n-sensitivity-table-details').evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
});

test('グラフはペインの残りの高さに合わせ、領域はスクロールせず、ペインの高さに追従する', async ({ page }) => {
  await openWorkspace(page, [nsens], group('n'), { width: 1440, height: 900 });
  const tall = await measure(page);
  expect(tall.bodyScrollHeight).toBeLessThanOrEqual(tall.bodyClientHeight + 1);
  expect(tall.paneScrollHeight).toBeLessThanOrEqual(tall.paneClientHeight + 1);
  // 個別画面の上限（360px）を超えて、領域の高さを使っている。表の見出し1行ぶんだけを残して下端まで使う
  expect(tall.svgHeight).toBeGreaterThan(450);
  expect(tall.bodyBottom - tall.svgBottom).toBeLessThan(60);
  // 画面の高さを300px下げると、図の高さも同じだけ縮む
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect.poll(async () => (await measure(page)).svgHeight).toBeLessThan(tall.svgHeight - 250);
  const low = await measure(page);
  expect(low.svgHeight).toBeGreaterThanOrEqual(CHART_FLOOR - 1);
  expect(low.bodyScrollHeight).toBeLessThanOrEqual(low.bodyClientHeight + 1);
});

test('下限より低いペインでは本体の中でスクロールし、図は下限より小さくならない', async ({ page }) => {
  // 縦に3段にすると、1段の本体が最低の窓（12rem）まで縮む
  await openWorkspace(
    page,
    [nsens, { ...flow, id: 'f1' }, { ...flow, id: 'f2' }],
    split('column', group('n'), group('f1'), group('f2')),
    { width: 1440, height: 700 },
  );
  const m = await measure(page);
  expect(m.bodyHeight).toBeLessThan(CHART_FLOOR + 20);
  expect(m.svgHeight).toBeGreaterThanOrEqual(CHART_FLOOR - 1);
  expect(m.bodyScrollHeight).toBeGreaterThan(m.bodyClientHeight);
  // 本体の中でスクロールすれば表の見出しに届く
  await page.getByText('各Nの実測値 [u]', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('各Nの実測値 [u]', { exact: true })).toBeInViewport();
});

test('凡例は、ペインの高さが変わっても線や点に重ならず図の中に収まる', async ({ page }) => {
  await openWorkspace(page, [nsens], group('n'), { width: 1440, height: 900 });
  for (const height of [900, 760, 640, 560]) {
    await page.setViewportSize({ width: 1440, height });
    await expect.poll(() => page.locator('.n-sensitivity-svg').first().evaluate((svg) => {
      const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      return Math.abs(svg.getBoundingClientRect().height - h!);
    })).toBeLessThan(1.5);
    const legend = await measureLegend(page);
    expect(legend, `高さ ${height}`).toEqual({ insideSvg: true, linePointsInside: 0, dotsInside: 0 });
  }
});

test('個別画面に漏れない: 外側に高さを測れるcontainerがあっても、図は幅から決まり表は開いたまま', async ({ page }) => {
  await openStandalone(page);
  const before = await page.locator('.n-sensitivity-svg').evaluate((svg) => svg.getBoundingClientRect().height);
  await page.addStyleTag({ content: '.pane-frame { container-type: size; height: 400px; }' });
  const info = await page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="n-sensitivity"]')!;
    return {
      svgPosition: getComputedStyle(feature.querySelector('.n-sensitivity-svg')!).position,
      svgHeight: feature.querySelector('.n-sensitivity-svg')!.getBoundingClientRect().height,
      featureDisplay: getComputedStyle(feature).display,
      fitFlag: getComputedStyle(feature).getPropertyValue('--n-sensitivity-fit').trim(),
      open: (feature.querySelector('details') as HTMLDetailsElement).open,
    };
  });
  expect(info.svgPosition).toBe('static');
  expect(info.featureDisplay).toBe('grid');
  expect(info.fitFlag).toBe('');
  expect(info.open).toBe(true);
  expect(Math.abs(info.svgHeight - before)).toBeLessThan(1);
  // 個別画面の図は幅の半分（上限360px）
  expect(before).toBeLessThanOrEqual(360 + 1);
});

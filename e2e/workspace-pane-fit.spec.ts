import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceのペインの本体が「ペインの残りの高さ」を持ち、Bigram Flowの図がそこに収まる（#808）。
 * 収まる・並び方が領域の縦横比で変わる・下限より低いペインは本体の領域の中でスクロールに戻る、を確かめる。
 * 個別画面（高さが中身で決まる）には効かないことも確かめる。
 */

const REM = 16;
/** 縦に積む時・横に並べる時の、Bigram Flowの下限（bigram-vector-view.css）。 */
const STACKED_FLOOR = 26 * REM;
const SIDE_BY_SIDE_FLOOR = 16 * REM;

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const comparison = {
  id: 'c',
  analyzerId: 'comparison',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } },
};
const group = (id: string) => ({ kind: 'group', paneIds: [id], weight: 1 });

/** 保存先へWorkspaceを直接書いて開く。 */
async function openWorkspace(page: Page, panes: readonly unknown[], layout: unknown, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, { id: 'fit', name: '収まりの確認', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout });
  await page.goto('/workspace/fit');
  await waitForHydration(page);
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-react-feature="bigram-flow"] [data-flow-edge="true"]').first()).toBeAttached();
}

/** Bigram Flowのペインの本体の領域と、中の2つの図の位置。 */
function measure(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (el === null) throw new Error('要素が無い');
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const body = feature.closest('.pane-body')!;
    const pane = feature.closest('.workspace-pane')!;
    return {
      pane: box(pane),
      paneScrollHeight: pane.scrollHeight,
      paneClientHeight: pane.clientHeight,
      body: box(body),
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      feature: box(feature),
      keyboard: box(feature.querySelector('[aria-label="Keyboard Flow"]')),
      keyboardSvg: box(feature.querySelector('.flow-keyboard-svg')),
      relative: box(feature.querySelector('[aria-label="Relative vectors"]')),
    };
  });
}

test('2ペイン横並び（Bigram Flow＋比較表）の1440×900で、Bigram Flowの本体はスクロールせず図が収まる', async ({ page }) => {
  await openWorkspace(page, [flow, comparison], { kind: 'split', direction: 'row', weight: 1, children: [group('f'), group('c')] }, { width: 1440, height: 900 });
  const m = await measure(page);
  // 本体の領域の中でも、ペイン全体でもスクロールしない（図の下端がペインの枠の中にある）
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
  expect(m.paneScrollHeight).toBeLessThanOrEqual(m.paneClientHeight + 1);
  expect(m.relative.bottom).toBeLessThanOrEqual(m.body.bottom + 1);
  expect(m.relative.bottom).toBeLessThanOrEqual(m.pane.bottom);
  // 図は領域の下端まで使っている（縮んだだけで、余白を大きく残さない）
  expect(m.body.bottom - m.relative.bottom).toBeLessThan(40);
});

test('領域が横長なら図は左右に並び、縦長なら縦に積む。切り替えは画面の幅ではなく領域の縦横比', async ({ page }) => {
  await openWorkspace(page, [flow], group('f'), { width: 1440, height: 900 });
  let m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.keyboard.right).toBeLessThanOrEqual(m.relative.left + 1);
  expect(Math.abs(m.keyboard.top - m.relative.top)).toBeLessThan(40);

  // 画面の幅は十分に広いまま、高さを伸ばして領域を縦長に近づける（幅 / 高さ < 1.5）と、縦に積む。
  await page.setViewportSize({ width: 1440, height: 1500 });
  await expect.poll(async () => {
    const next = await measure(page);
    return next.body.width / next.body.height < 1.5;
  }).toBe(true);
  m = await measure(page);
  expect(m.relative.top).toBeGreaterThanOrEqual(m.keyboard.bottom - 1);

  // 高さを戻して領域が再び横長になると、また左右に並ぶ。
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => {
    const next = await measure(page);
    return next.keyboard.right <= next.relative.left + 1;
  }).toBe(true);
});

test('下限より低いペインでは本体の領域の中でスクロールに戻り、図は下限より小さくならない', async ({ page }) => {
  // 横に並ぶ形: 領域が下限（16rem）より低くなる高さ
  await openWorkspace(page, [flow], group('f'), { width: 1440, height: 470 });
  let m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.bodyClientHeight).toBeLessThan(SIDE_BY_SIDE_FLOOR);
  expect(m.feature.height).toBeGreaterThanOrEqual(SIDE_BY_SIDE_FLOOR - 1);
  expect(m.bodyScrollHeight).toBeGreaterThan(m.bodyClientHeight + 4);
  const keyboardHeightAtFloor = m.keyboardSvg.height;

  // もっと低くしても、図は下限のまま縮まない（領域の中でスクロールする）
  await page.setViewportSize({ width: 1440, height: 400 });
  await expect.poll(async () => (await measure(page)).bodyClientHeight).toBeLessThan(m.bodyClientHeight);
  m = await measure(page);
  expect(m.keyboardSvg.height).toBeGreaterThanOrEqual(keyboardHeightAtFloor - 1);
  expect(m.feature.height).toBeGreaterThanOrEqual(SIDE_BY_SIDE_FLOOR - 1);
  // 領域の中でスクロールして、下の端まで届く
  await page.locator('.workspace-pane .pane-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const scrolled = await measure(page);
  expect(scrolled.relative.bottom).toBeLessThanOrEqual(scrolled.body.bottom + 2);
});

test('縦に積む形にも下限があり、それより低いペインでは領域の中でスクロールする', async ({ page }) => {
  // 領域が幅472・高さ386ほどで、横長にならない
  await openWorkspace(page, [flow], group('f'), { width: 770, height: 700 });
  const m = await measure(page);
  expect(m.body.width / m.body.height).toBeLessThan(1.5);
  expect(m.relative.top).toBeGreaterThanOrEqual(m.keyboard.bottom - 1);
  expect(m.bodyClientHeight).toBeLessThan(STACKED_FLOOR);
  expect(m.feature.height).toBeGreaterThanOrEqual(STACKED_FLOOR - 1);
  expect(m.bodyScrollHeight).toBeGreaterThan(m.bodyClientHeight + 4);
});

test('縦が足りない領域では件数の文と手ごとの要約を隠し、足りる領域では出す', async ({ page }) => {
  await openWorkspace(page, [flow], group('f'), { width: 1440, height: 900 });
  const stats = page.locator('.workspace-pane .flow-profile-stats').first();
  const coverage = page.locator('.workspace-pane .flow-coverage');
  await expect(stats).toBeVisible();
  await expect(coverage).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(stats).toBeHidden();
  await expect(coverage).toBeHidden();
});

test('個別画面では効かない: 本体は高さを持たず、図は縦に積み、領域の高さは中身で決まる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 15_000 });
  const info = await page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const body = feature.closest('.pane-body')!;
    const keyboard = feature.querySelector('[aria-label="Keyboard Flow"]')!.getBoundingClientRect();
    const relative = feature.querySelector('[aria-label="Relative vectors"]')!.getBoundingClientRect();
    return {
      containerType: getComputedStyle(body).containerType,
      statsDisplay: getComputedStyle(feature.querySelector('.flow-profile-stats')!).display,
      coverageDisplay: getComputedStyle(feature.querySelector('.flow-coverage')!).display,
      keyboardBottom: keyboard.bottom,
      relativeTop: relative.top,
      featureMinHeight: getComputedStyle(feature).minHeight,
    };
  });
  expect(info.containerType).toBe('inline-size');
  expect(info.relativeTop).toBeGreaterThanOrEqual(info.keyboardBottom - 1);
  // 下限（min-height）は付かない
  expect(parseFloat(info.featureMinHeight)).toBeLessThan(1);
  expect(info.statsDisplay).not.toBe('none');
  expect(info.coverageDisplay).not.toBe('none');
});

test('左右の手をまたぐ2打鍵の注記は図の下ではなくRelative vectorsのⓘの中にある', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  const flowRoot = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowRoot).toBeVisible({ timeout: 15_000 });
  await expect(flowRoot).not.toContainText('左右の手をまたぐ');
  await flowRoot.getByRole('button', { name: 'Relative vectorsの説明' }).click();
  await expect(page.getByRole('tooltip')).toContainText('左右の手をまたぐ2打鍵は、Keyboard Flowには含めるが、Relative vectorsからは除く');
});

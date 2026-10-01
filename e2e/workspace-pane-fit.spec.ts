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

test('個別画面の外側に高さを測れるcontainerがあっても、Workspace用の規則は漏れない（本体の領域は名前つきで問う）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 15_000 });
  // 名前の無い問い合わせだと、幅しか測れない本体の領域は飛ばされ、この外側のcontainerの高さを読んでしまう。
  await page.addStyleTag({ content: '.pane-frame { container-type: size; height: 400px; }' });
  const info = await page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    return {
      minHeight: getComputedStyle(feature).minHeight,
      statsDisplay: getComputedStyle(feature.querySelector('.flow-profile-stats')!).display,
      coverageDisplay: getComputedStyle(feature.querySelector('.flow-coverage')!).display,
      columns: getComputedStyle(feature).gridTemplateColumns.split(' ').length,
    };
  });
  expect(parseFloat(info.minHeight)).toBeLessThan(1);
  expect(info.statsDisplay).not.toBe('none');
  expect(info.coverageDisplay).not.toBe('none');
  expect(info.columns).toBe(1);
});

test('高さに合わせて縮んだ図の線は、枠の幅ではなく実際に描かれる幅を倍率にして太さを保つ', async ({ page }) => {
  await openWorkspace(page, [flow], group('f'), { width: 1440, height: 520 });
  const info = await page.evaluate(() => {
    const svg = document.querySelector('[data-react-feature="bigram-flow"] .flow-keyboard-svg') as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    // 縦横比を保って枠の中に収まるので、描かれる幅は高さから決まる
    const drawnWidth = Math.min(rect.width, (rect.height * view.width) / view.height);
    const widths = [...svg.querySelectorAll('[data-flow-edge="true"]')].map((edge) => parseFloat(getComputedStyle(edge).strokeWidth));
    return { boxWidth: rect.width, drawnWidth, zoom: drawnWidth / view.width, minStroke: Math.min(...widths) };
  });
  // 横長の枠に、縦で決まる小さい図が収まっている（枠の幅で測ると倍率が大きすぎて線が細くなる）
  expect(info.drawnWidth).toBeLessThan(info.boxWidth - 20);
  // 最も細い線でも、描かれる幅での画面上の太さが下限（1.25px）を割らない。正しい実装の誤差は1e-5未満なので許容は狭く取る
  // （枠の幅を倍率にすると、この値は1.19ほどに下がる）
  expect(info.minStroke * info.zoom).toBeGreaterThanOrEqual(1.25 - 0.01);
});

/** Bigram Flowを細い列に置く配置（768×1024で本体が幅200px前後・高さ670px前後の細長いペインになる）。 */
const narrowColumnLayout = {
  kind: 'split',
  direction: 'row',
  weight: 1,
  children: [
    group('f'),
    { kind: 'split', direction: 'column', weight: 1, children: [group('c'), group('d')] },
  ],
};
const comparison2 = { ...comparison, id: 'd' };

/** 図の枠と、実際に描かれる大きさ。 */
function measureFit(page: Page) {
  return page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const rect = (el: Element) => el.getBoundingClientRect();
    const svg = feature.querySelector('.flow-keyboard-svg') as SVGSVGElement;
    const view = svg.viewBox.baseVal;
    const stage = rect(feature.querySelector('.flow-stage')!);
    const legend = rect(feature.querySelector('.flow-legend')!);
    const keyboard = rect(svg);
    const profile = rect(feature.querySelector('.flow-profile-svg')!);
    const viewport = rect(feature.querySelector('.flow-profile-viewport')!);
    const keyRect = rect(feature.querySelector('.flow-key rect')!);
    const badge = feature.querySelector('.flow-repeat-badge') as SVGGElement;
    const scale = Number(/scale\(([\d.]+)\)/.exec(badge.getAttribute('transform') ?? '')?.[1]);
    const drawnWidth = Math.min(keyboard.width, (keyboard.height * view.width) / view.height);
    return {
      stage,
      legendHeight: legend.height,
      keyboard,
      keyboardDrawnHeight: (drawnWidth * view.height) / view.width,
      zoom: drawnWidth / view.width,
      profile,
      viewport,
      keyWidth: keyRect.width,
      badgeScale: scale,
      badgeHeight: rect(badge).height,
    };
  });
}

test('細長いペインでは枠が図の縦横比より縦に伸びず、余った高さは枠の外に置かれる', async ({ page }) => {
  await openWorkspace(page, [flow, comparison, comparison2], narrowColumnLayout, { width: 768, height: 1024 });
  const m = await measureFit(page);
  const body = (await measure(page)).body;
  // 幅で大きさが決まる細長いペイン（領域は縦に十分長い）
  expect(body.height).toBeGreaterThan(body.width * 2.5);
  // Keyboard Flowの枠の高さ = 描かれる図の高さ + 凡例（枠が縦に伸びていない）
  expect(m.keyboard.height).toBeLessThanOrEqual(m.keyboardDrawnHeight + 1);
  expect(m.stage.height).toBeLessThanOrEqual(m.keyboardDrawnHeight + m.legendHeight + 16);
  // Relative vectorsの図の枠は正方形（余白を枠の中に持たない）
  expect(Math.abs(m.profile.width - m.profile.height)).toBeLessThan(2);
  expect(m.viewport.height).toBeLessThanOrEqual(m.profile.height + 8);
  // 余りは枠の外: 領域の下端と図の下端のあいだが大きく空く
  const after = await measure(page);
  expect(after.body.bottom - after.relative.bottom).toBeGreaterThan(40);
  expect(after.bodyScrollHeight).toBeLessThanOrEqual(after.bodyClientHeight + 1);
});

test('幅が狭い横長のペインでは、縦横比が横長でも左右に並べず縦に積む', async ({ page }) => {
  // 2ペインの横並びで、Bigram Flowの領域が幅550・高さ300ほど（縦横比は1.5を超える）
  await openWorkspace(
    page,
    [flow, comparison],
    { kind: 'split', direction: 'row', weight: 1, children: [group('f'), group('c')] },
    { width: 1440, height: 620 },
  );
  await expect.poll(async () => {
    const next = await measure(page);
    return next.body.height < 330;
  }).toBe(true);
  let m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.body.width).toBeLessThan(600);
  expect(m.relative.top).toBeGreaterThanOrEqual(m.keyboard.bottom - 1);

  // 同じ縦横比でも、幅が600px以上なら左右に並ぶ（境目は幅600px）
  await openWorkspace(page, [flow], group('f'), { width: 1100, height: 600 });
  m = await measure(page);
  expect(m.body.width).toBeGreaterThanOrEqual(600);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.keyboard.right).toBeLessThanOrEqual(m.relative.left + 1);
});

test('連打ラベルは図の倍率に合わせて縮み、図が小さくてもキーより大きくならない', async ({ page }) => {
  await openWorkspace(page, [flow, comparison, comparison2], narrowColumnLayout, { width: 768, height: 1024 });
  const small = await measureFit(page);
  // 図は幅200px未満に縮んでいる。ラベルの拡大率は上限（2）を超えず、画面上のラベルの高さはキーの幅より小さい
  expect(small.zoom).toBeLessThan(0.3);
  expect(small.badgeScale).toBeLessThanOrEqual(2 + 1e-6);
  expect(small.badgeHeight).toBeLessThan(small.keyWidth);

  // 図が広いペインでは、ラベルも倍率に応じて大きい
  await openWorkspace(page, [flow], group('f'), { width: 1440, height: 900 });
  const large = await measureFit(page);
  expect(large.zoom).toBeGreaterThan(small.zoom * 2);
  expect(large.badgeHeight).toBeGreaterThan(small.badgeHeight * 1.5);
});

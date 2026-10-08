import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { afterFrames, settleBy, settleGrid } from './settle-helper.ts';

/**
 * Workspaceのペインの本体が「ペインの残りの高さ」を持ち、Bigram Flowの図がそこに収まる。
 * 収まる・並び方が領域の縦横比で変わる・下限より低いペインは本体の領域の中でスクロールに戻る、を確かめる。
 * ペインの大きさは格子（1升 = 28px、升の間 8px、列は24）で決まる。画面の幅1440pxでは1列がおよそ45px。
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
const cell = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

/** 保存先へWorkspaceを直接書いて開く。 */
async function openWorkspace(page: Page, panes: readonly unknown[], grid: unknown, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
  }, { id: 'fit', name: '収まりの確認', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, grid });
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

test('2ペイン横並び（Bigram Flow＋比較表、各12列 x 19行）で、Bigram Flowの本体はスクロールせず図が収まる', async ({ page }) => {
  // 21行では図が幅で決まる最大の大きさに達していて、余った高さは設計どおり下に置かれる。
  // 「縮んでも下端まで使う」を確かめるには、図が縮む高さの19行を使う
  await openWorkspace(page, [flow, comparison], [cell('f', 0, 0, 12, 19), cell('c', 12, 0, 12, 19)], { width: 1440, height: 900 });
  const m = await measure(page);
  // 本体の領域の中でも、ペイン全体でもスクロールしない（図の下端がペインの枠の中にある）
  expect(m.bodyScrollHeight).toBeLessThanOrEqual(m.bodyClientHeight + 1);
  expect(m.paneScrollHeight).toBeLessThanOrEqual(m.paneClientHeight + 1);
  expect(m.relative.bottom).toBeLessThanOrEqual(m.body.bottom + 1);
  expect(m.relative.bottom).toBeLessThanOrEqual(m.pane.bottom);
  // 図は領域の下端まで使っている（縮んだだけで、余白を大きく残さない）
  expect(m.body.bottom - m.relative.bottom).toBeLessThan(40);
});

/** ペインの右下の角をつかんで、`dx`・`dy`（画素）だけ動かす。 */
async function dragCorner(page: Page, id: string, dx: number, dy: number): Promise<void> {
  // ライブラリの配置の動き（200ms）が済んでから、つかみを探す
  await settleGrid(page);
  const corner = (await page.locator(`.workspace-grid-item[data-pane-id="${id}"] .react-resizable-handle-se`).boundingBox())!;
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test('領域が横長なら図は左右に並び、縦長なら縦に積む。切り替えは画面の幅ではなく領域の縦横比', async ({ page }) => {
  // 幅24列 x 20行（本体は約1020 x 650）
  await openWorkspace(page, [flow], [cell('f', 0, 0, 24, 20)], { width: 1440, height: 1300 });
  let m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.keyboard.right).toBeLessThanOrEqual(m.relative.left + 1);
  expect(Math.abs(m.keyboard.top - m.relative.top)).toBeLessThan(40);

  // 画面の幅はそのまま、ペインの下の辺を伸ばして領域を縦長に近づける（幅 / 高さ < 1.5）と、縦に積む。
  await dragCorner(page, 'f', 0, 144);
  await expect.poll(async () => {
    const next = await measure(page);
    return next.body.width / next.body.height < 1.5;
  }).toBe(true);
  m = await measure(page);
  expect(m.relative.top).toBeGreaterThanOrEqual(m.keyboard.bottom - 1);

  // 縮めて領域が再び横長になると、また左右に並ぶ。
  await dragCorner(page, 'f', 0, -144);
  await expect.poll(async () => {
    const next = await measure(page);
    return next.keyboard.right <= next.relative.left + 1;
  }).toBe(true);
});

test('下限より低いペインでは本体の領域の中でスクロールに戻り、図は下限より小さくならない', async ({ page }) => {
  // 横に並ぶ形: 領域が下限（16rem）より低くなる高さ（幅24列 x 8行 = 280px）
  await openWorkspace(page, [flow], [cell('f', 0, 0, 24, 8)], { width: 1440, height: 900 });
  const m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.bodyClientHeight).toBeLessThan(SIDE_BY_SIDE_FLOOR);
  // 図は下限のまま縮まず、領域の中でスクロールする
  expect(m.feature.height).toBeGreaterThanOrEqual(SIDE_BY_SIDE_FLOOR - 1);
  expect(m.bodyScrollHeight).toBeGreaterThan(m.bodyClientHeight + 4);
  // 領域の中でスクロールして、下の端まで届く
  await page.locator('.workspace-pane .pane-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const scrolled = await measure(page);
  expect(scrolled.relative.bottom).toBeLessThanOrEqual(scrolled.body.bottom + 2);
});

test('縦に積む形にも下限があり、それより低いペインでは領域の中でスクロールする', async ({ page }) => {
  // 領域が幅460・高さ320ほどで、横長にならない（10列 x 12行）
  await openWorkspace(page, [flow], [cell('f', 0, 0, 10, 12)], { width: 1440, height: 900 });
  const m = await measure(page);
  expect(m.body.width / m.body.height).toBeLessThan(1.5);
  expect(m.relative.top).toBeGreaterThanOrEqual(m.keyboard.bottom - 1);
  expect(m.bodyClientHeight).toBeLessThan(STACKED_FLOOR);
  expect(m.feature.height).toBeGreaterThanOrEqual(STACKED_FLOOR - 1);
  expect(m.bodyScrollHeight).toBeGreaterThan(m.bodyClientHeight + 4);
});

test('縦が足りない領域では件数の文と手ごとの要約を隠し、足りる領域では出す', async ({ page }) => {
  await openWorkspace(page, [flow], [cell('f', 0, 0, 24, 19)], { width: 1440, height: 1300 });
  const stats = page.locator('.workspace-pane .flow-profile-stats').first();
  const coverage = page.locator('.workspace-pane .flow-coverage');
  await expect(stats).toBeVisible();
  await expect(coverage).toBeVisible();

  // ペインの下の辺を3行ぶん縮める
  await dragCorner(page, 'f', 0, -108);
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
  await expect(page.getByRole('tooltip')).toContainText('左右の手をまたぐ2打鍵は、Keyboard Flowには含めますが、Relative vectorsからは除きます');
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
  // 図が高さで決まる形（24列 x 24行、図を縦に積む縦長の本体）。組の数のラベルが行を使わなくなったので、
  // 横に並べる形（24列 x 8行）は本体の高さの下限で図が枠の幅いっぱいに収まり、高さで決まる形にならない
  await openWorkspace(page, [flow], [cell('f', 0, 0, 24, 24)], { width: 1440, height: 1300 });
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
  // （枠の幅を倍率にすると、この値は1.058ほどに下がる）
  expect(info.minStroke * info.zoom).toBeGreaterThanOrEqual(1.25 - 0.01);
});

/** Bigram Flowを細い列（4列）に置く配置（本体が幅165px前後・高さ590px前後の細長いペインになる）。 */
const narrowColumnGrid = [cell('f', 0, 0, 4, 20), cell('c', 4, 0, 20, 10), cell('d', 4, 10, 20, 10)];
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
  await openWorkspace(page, [flow, comparison, comparison2], narrowColumnGrid, { width: 1440, height: 900 });
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

/** 並びを返す（Keyboard FlowがRelative vectorsの左にあれば横並び）。 */
async function arrangement(page: Page) {
  const m = await measure(page);
  return m.keyboard.right <= m.relative.left + 1 ? 'side' : 'stack';
}

/**
 * 2ペイン（Bigram Flow＋比較表）の横並び（各12列 x 10行）。本体の幅は画面の幅で決まる
 * （1300pxで約494px、1440pxで約564px）。高さは10行（約286px）。
 */
const twoPaneRow = [cell('f', 0, 0, 12, 10), cell('c', 12, 0, 12, 10)];

test('幅が狭い横長のペインでは、縦横比が横長でも左右に並べず縦に積む。境目は本体の幅520px', async ({ page }) => {
  // 本体の幅が520pxに届かない横長（縦横比は1.5を超える）
  await openWorkspace(page, [flow, comparison], twoPaneRow, { width: 1300, height: 900 });
  let m = await measure(page);
  expect(m.body.height).toBeLessThan(330);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(m.body.width).toBeLessThan(520);
  expect(await arrangement(page)).toBe('stack');

  // 幅だけを広げて520pxを超えると、同じ縦横比のまま左右に並ぶ
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await measure(page)).body.width).toBeGreaterThanOrEqual(530);
  m = await measure(page);
  expect(m.body.width / m.body.height).toBeGreaterThanOrEqual(1.5);
  expect(await arrangement(page)).toBe('side');
});

test('境目の前後で並びが行き来しても振動せず、同じ幅なら往復しても同じ並びになる', async ({ page }) => {
  // 16回の幅の変更を、それぞれ落ち着くまで待つ。1回に約1秒かかるので、既定の30秒には収まらない
  test.setTimeout(90_000);
  // 縦が低く、縦に積むと領域の中でスクロールが出る高さ（スクロールバーが幅を狭めて境目を行き来しないことの確認）
  await openWorkspace(page, [flow, comparison], twoPaneRow, { width: 1300, height: 900 });
  const widths = [1300, 1320, 1340, 1360, 1380, 1400, 1420, 1440];
  // 画面の幅を変えた直後は、前の幅のフレームが1つあり、その後しばらくメインスレッドが詰まってから、
  // ペインの幅が動き出す。格子の面の実寸から求めた、ペイン（12列）の幅になるまで先に待ち、
  // 落ち着きの確認の回数を減らす（時間では待たない）
  const gridFollowsArea = () => page.evaluate(() => {
    const area = document.querySelector('.workspace-grid-area')!.getBoundingClientRect().width;
    const item = document.querySelector('.workspace-grid-item[data-pane-id="f"]')!.getBoundingClientRect().width;
    const colStep = (area - 16 - 23 * 8) / 24 + 8;
    return Math.abs(item - (12 * colStep - 8)) < 1.5;
  });
  // 本体の幅と並びを1回の往復で読む
  const readSignature = () => page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const body = feature.closest('.pane-body')!.getBoundingClientRect();
    const keyboard = feature.querySelector('[aria-label="Keyboard Flow"]')!.getBoundingClientRect();
    const relative = feature.querySelector('[aria-label="Relative vectors"]')!.getBoundingClientRect();
    return `${body.width}|${keyboard.right <= relative.left + 1 ? 'side' : 'stack'}`;
  });
  const record = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(gridFollowsArea).toBe(true);
    await expect.poll(async () => (await measure(page)).body.height).toBeLessThan(330);
    // 本体の幅と並びが落ち着くまで待ち、その後のフレームでも並びが変わらないことを確かめる
    await settleBy(page, readSignature, 2);
    const first = (await readSignature()).split('|')[1]!;
    for (let i = 0; i < 6; i += 1) {
      await afterFrames(page);
      expect((await readSignature()).split('|')[1]).toBe(first);
    }
    return first;
  };
  const up: string[] = [];
  for (const width of widths) up.push(await record(width));
  const down: string[] = [];
  for (const width of [...widths].reverse()) down.push(await record(width));
  expect(down.reverse()).toEqual(up);
  expect(up[0]).toBe('stack');
  expect(up[up.length - 1]).toBe('side');
});

test('Relative vectorsの図は、枠が図より広くてもカードの中央に置かれ、外形の線が左端に触れない', async ({ page }) => {
  const cases: Array<[string, readonly unknown[], unknown, { width: number; height: number }]> = [
    ['2ペイン1440×900', [flow, comparison], [cell('f', 0, 0, 12, 21), cell('c', 12, 0, 12, 21)], { width: 1440, height: 900 }],
    ['1ペイン1920×1080', [flow], [cell('f', 0, 0, 24, 25)], { width: 1920, height: 1080 }],
    ['縦2分割の上（横並び）', [flow, comparison], [cell('f', 0, 0, 24, 16), cell('c', 0, 16, 24, 16)], { width: 1440, height: 900 }],
  ];
  for (const [name, panes, layout, size] of cases) {
    await openWorkspace(page, panes, layout, size);
    const gaps = await page.evaluate(() => [...document.querySelectorAll('[data-react-feature="bigram-flow"] .flow-mini-panel')].map((panel) => {
      const card = panel.getBoundingClientRect();
      const svg = panel.querySelector('.flow-profile-svg')!.getBoundingClientRect();
      // 描かれる正方形（縦横比を保って枠の中に収まる）の左右の余白
      const side = Math.min(svg.width, svg.height);
      const left = svg.left + (svg.width - side) / 2 - card.left;
      const right = card.right - (svg.left + (svg.width + side) / 2);
      return { left, right, side, card: card.width };
    }));
    expect(gaps.length, name).toBe(2);
    for (const gap of gaps) {
      expect(gap.side, name).toBeGreaterThan(60);
      expect(Math.abs(gap.left - gap.right), name).toBeLessThanOrEqual(1);
    }
  }
});

test('連打ラベルは図の倍率に合わせて縮み、図が小さくてもキーより大きくならない', async ({ page }) => {
  await openWorkspace(page, [flow, comparison, comparison2], narrowColumnGrid, { width: 1440, height: 900 });
  const small = await measureFit(page);
  // 図は幅200px未満に縮んでいる。ラベルの拡大率は上限（1.4）を超えず、画面上のラベルの高さはキーの幅の約半分
  expect(small.zoom).toBeLessThan(0.3);
  expect(small.badgeScale).toBeLessThanOrEqual(1.4 + 1e-6);
  expect(small.badgeHeight / small.keyWidth).toBeGreaterThan(0.45);
  expect(small.badgeHeight / small.keyWidth).toBeLessThan(0.55);

  // 図が広いペインでは、ラベルも倍率に応じて大きい
  await openWorkspace(page, [flow], [cell('f', 0, 0, 24, 22)], { width: 1440, height: 900 });
  const large = await measureFit(page);
  expect(large.zoom).toBeGreaterThan(small.zoom * 2);
  expect(large.badgeHeight).toBeGreaterThan(small.badgeHeight * 1.5);
});

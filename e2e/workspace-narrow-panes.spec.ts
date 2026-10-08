import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectBrowserErrors } from './browser-errors-helper.ts';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';
import { holdWorker, installWorkerHold } from './worker-hold-helper.ts';

/**
 * 下限の幅まで縮めたペイン（FHD・左のメニューを開いた状態で24列のうち2列 = 約131px、面が狭い時の100px前後）で、
 * Bigram Flow・比較表・N感度の見出しのボタンが重ならずに押せ、図・凡例が枠からはみ出さないこと。
 * 下限は操作できなくなるのを防ぐためだけに置いたもので、狭くて見づらければ利用者が広げる。
 * ここで確かめるのは「見づらい」ではなく、「重なって押せない」「枠で切れる」「隣のペインへはみ出す」が起きないこと。
 */

const FHD = { width: 1920, height: 1080 };
const NARROW_SURFACE = { width: 761, height: 900 };
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const DVORAK = { kind: 'layout', layoutId: 'dvorak' };
const SETUP_LIBRARY_KEY = 'keydist:setup-library';
const WORKSPACES_KEY = 'keydist:workspaces';

/** 長い名前になる Setup（新JIS × カラム/ロウ・ANSI/JIS の組）。名前の違いが末尾側にある。 */
const LONG_SETUPS = [
  { id: 'long-1', layoutId: 'shin-jis-prefix', shapeId: 'column-staggered' },
  { id: 'long-2', layoutId: 'shin-jis-prefix', shapeId: 'jis-column-staggered' },
  { id: 'long-3', layoutId: 'shin-jis-prefix', shapeId: 'row-staggered' },
  { id: 'long-4', layoutId: 'shin-jis-prefix', shapeId: 'jis-row-staggered' },
  { id: 'long-5', layoutId: 'naginata-v18', shapeId: 'column-staggered' },
  { id: 'long-6', layoutId: 'naginata-v18', shapeId: 'jis-column-staggered' },
];

type AnalyzerId = 'bigram-flow' | 'comparison' | 'n-sensitivity';
const ANALYZERS: readonly AnalyzerId[] = ['bigram-flow', 'comparison', 'n-sensitivity'];

function paneOf(id: string, analyzerId: AnalyzerId, longNames: boolean, missingTarget = false) {
  const set = longNames
    ? { kind: 'set', selection: { targets: LONG_SETUPS.map((s) => ({ kind: 'setup', setupId: s.id })), colorSlots: LONG_SETUPS.map((_, i) => i) } }
    : { kind: 'set', selection: { targets: [QWERTY, DVORAK], colorSlots: [0, 1] } };
  return {
    id,
    analyzerId,
    binding: analyzerId === 'bigram-flow'
      ? { mode: 'fixed', target: { kind: 'single', target: missingTarget ? { kind: 'setup', setupId: 'no-such-setup' } : QWERTY } }
      : { mode: 'fixed', target: set },
  };
}

/** 対象のペイン（x=0）と、その右の隣のペイン（はみ出しの検査用）を置く。 */
async function open(page: Page, analyzerId: AnalyzerId, size: { width: number; height: number }, options: { longNames?: boolean; theme?: 'light' | 'dark'; cols?: number; status?: 'ready' | 'failed'; conditions?: Record<string, unknown>; overrides?: Record<string, unknown> } = {}): Promise<void> {
  const longNames = options.longNames === true;
  await page.setViewportSize(size);
  await page.addInitScript(({ key, setupKey, setups, overrides, theme, value }) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
      localStorage.setItem(setupKey, JSON.stringify({ version: 1, setups, overrides }));
      localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, appearance: { theme } }));
    }
  }, {
    key: WORKSPACES_KEY,
    setupKey: SETUP_LIBRARY_KEY,
    setups: LONG_SETUPS,
    overrides: options.overrides ?? {},
    theme: options.theme ?? 'light',
    value: {
      id: 'narrow',
      name: '細いペイン',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      ...(options.conditions === undefined ? {} : { conditions: options.conditions }),
      panes: [paneOf('a', analyzerId, longNames, options.status === 'failed'), paneOf('b', 'comparison', false)],
      grid: [
        { id: 'a', x: 0, y: 0, w: options.cols ?? 8, h: 20 },
        { id: 'b', x: 8, y: 0, w: 8, h: 20 },
      ],
    },
  });
  await page.goto('/workspace/narrow');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await expect(itemOf(page, 'a').locator('.pane-frame')).toHaveAttribute('data-pane-status', options.status ?? 'ready', { timeout: 20_000 });
  await settle(page);
}

const itemOf = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

/** 描画と見出しの測り直し（ResizeObserverの通知の次のフレーム）が済むまで待つ。 */
const afterFrames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}));

/**
 * ライブラリの配置の動き（200ms）と図の測り直しが済むまで待つ。
 * 時間では待たず、フレームを3つ進めるたびに寸法を測り、8回続けて同じになるまで繰り返す（約24フレーム = 約400ms分）。
 */
async function settle(page: Page): Promise<void> {
  const signature = () => page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    const inner = [...el.querySelectorAll('.n-sensitivity-svg, .flow-two-up, .comparison-table')].map((e) => {
      const b = e.getBoundingClientRect();
      return `${Math.round(b.width)}x${Math.round(b.height)}`;
    }).join(',');
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}:${inner}`;
  }).join('|'));
  let last = await signature();
  let stable = 0;
  while (stable < 8) {
    await afterFrames(page);
    const now = await signature();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

/** 右の辺を左へ大きく引いて、下限の幅まで縮める。 */
async function shrinkToMin(page: Page, id: string): Promise<void> {
  const handle = (await itemOf(page, id).locator('.react-resizable-handle-e').boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 1000, y, { steps: 12 });
  await page.mouse.up();
  await settle(page);
}

interface HeaderReport {
  readonly frameWidth: number;
  readonly controls: readonly { name: string; left: number; right: number; width: number; height: number; topmost: boolean }[];
  readonly overlaps: readonly string[];
}

/**
 * 見出しの操作部品（ボタン・つかみ・対象の選択）。ペインの枠の中にあり、一番手前にあり、互いに重ならないかを測る。
 * 押せるかは、中心の点の一番手前がその部品自身（かその中）かで決める（上に別の部品が重なっていると押せない）。
 */
async function headerReport(item: Locator): Promise<HeaderReport> {
  return item.evaluate((root) => {
    const frame = root.querySelector('.pane-frame')!.getBoundingClientRect();
    const els = [...root.querySelectorAll<HTMLElement>('.pane-frame-header button, .pane-frame-header select, .pane-frame-header .workspace-drag-handle')]
      // 条件の要約は、中の1つのボタンが部品。入れ物と中の両方を数えない
      .filter((el) => el.getBoundingClientRect().width > 0);
    const nameOf = (el: HTMLElement) => el.getAttribute('aria-label') ?? el.className.toString().split(' ')[0] ?? el.tagName;
    const rects = els.map((el) => ({ el, rect: el.getBoundingClientRect() }));
    const controls = rects.map(({ el, rect }) => {
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { name: nameOf(el), left: rect.left - frame.left, right: rect.right - frame.left, width: rect.width, height: rect.height, topmost: hit !== null && el.contains(hit) };
    });
    const overlaps: string[] = [];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]!;
        const b = rects[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (w > 1 && h > 1) overlaps.push(`${nameOf(a.el)} x ${nameOf(b.el)} (${Math.round(w)}x${Math.round(h)})`);
      }
    }
    return { frameWidth: frame.width, controls, overlaps };
  });
}

/**
 * `root`の中で、`root`の外へ出ている要素のうち、間に切り抜き（overflowがvisibleでない祖先）が無いもの。
 * 切り抜きがあれば、見えない分は中でスクロール・切り捨てされる設計なので数えない（その入れ物自身は数える）。
 */
async function spillingOutOf(root: Locator, scope: 'x' | 'both' = 'x'): Promise<string[]> {
  return root.evaluate((rootEl, scopeValue) => {
    const box = rootEl.getBoundingClientRect();
    const out: string[] = [];
    for (const el of rootEl.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      let clipped = false;
      for (let a = el.parentElement; a !== null && a !== rootEl; a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.overflowX !== 'visible' && (scopeValue === 'x' || style.overflowY !== 'visible')) clipped = true;
        if (style.position === 'absolute' && a.className.toString().includes('measure')) clipped = true;
      }
      if (clipped) continue;
      const spillX = r.left < box.left - 1 || r.right > box.right + 1;
      const spillY = scopeValue === 'both' && (r.top < box.top - 1 || r.bottom > box.bottom + 1);
      if (spillX || spillY) out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]} ${Math.round(r.left - box.left)}..${Math.round(r.right - box.left)} / ${Math.round(box.width)}`);
    }
    return out;
  });
}

async function expectHeaderUsable(page: Page, id: string, minTargetWidth = 60): Promise<void> {
  const item = itemOf(page, id);
  const report = await headerReport(item);
  expect(report.controls.length, '見出しの部品が見つかる').toBeGreaterThanOrEqual(5);
  for (const control of report.controls) {
    expect(control.width, `${control.name} の幅`).toBeGreaterThanOrEqual(16);
    expect(control.left, `${control.name} は枠の左から出ない`).toBeGreaterThanOrEqual(-0.5);
    expect(control.right, `${control.name} は枠の右から出ない（枠 ${Math.round(report.frameWidth)}px）`).toBeLessThanOrEqual(report.frameWidth + 0.5);
    expect(control.topmost, `${control.name} が一番手前`).toBe(true);
  }
  expect(report.overlaps, '部品どうしが重ならない').toEqual([]);
  // ⋯と対象の選択には必ず届く。押してメニュー・選択が開く
  const menu = item.getByRole('button', { name: /の操作$/ });
  const target = item.locator('.target-selection-button');
  expect(((await target.boundingBox())!).width, '対象の選択が潰れない').toBeGreaterThanOrEqual(minTargetWidth);
  await menu.click();
  const close = page.getByRole('menuitem', { name: /閉じる/ });
  await expect(close).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(close).toBeHidden();
  await target.click();
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(target).toHaveAttribute('aria-expanded', 'false');
}

/** ペインの外（隣のペイン）へ何もはみ出さない。横スクロールは本体の中だけ。 */
async function expectNoSpillOutsidePane(page: Page, id: string): Promise<void> {
  const item = itemOf(page, id);
  expect(await spillingOutOf(item.locator('.pane-frame'), 'x'), '枠の中の、本体の外の部品').toEqual([]);
  const pane = (await item.boundingBox())!;
  const neighbor = (await itemOf(page, id === 'a' ? 'b' : 'a').boundingBox())!;
  expect(pane.x + pane.width, '隣のペインと重ならない').toBeLessThanOrEqual(neighbor.x + 0.5);
  // 本体が横にスクロールする時だけ、その幅は本体の中（ペインの幅は変わらない）
  const frameOverflow = await item.locator('.pane-frame').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(frameOverflow, 'ペインの枠自体は横に伸びない').toBeLessThanOrEqual(1);
}

const cases = [
  { name: 'FHD・2列', size: FHD },
  { name: '面が狭い（761px）・下限の列数', size: NARROW_SURFACE },
] as const;

for (const analyzerId of ANALYZERS) {
  for (const c of cases) {
    test(`${analyzerId}: ${c.name}のペインで、見出しのボタンが重ならず押せる。隣のペインへはみ出さない`, async ({ page }) => {
      await open(page, analyzerId, c.size);
      await shrinkToMin(page, 'a');
      expect(((await itemOf(page, 'a').boundingBox())!).width, '下限まで縮んでいる').toBeLessThan(140);
      await expectHeaderUsable(page, 'a');
      await expectNoSpillOutsidePane(page, 'a');
    });
  }
}

for (const c of cases) {
  test(`Bigram Flow: ${c.name}のペインで、Relative vectorsの図がカードからはみ出さず、見出し・凡例・ボタンが本体の中に収まる`, async ({ page }) => {
    await open(page, 'bigram-flow', c.size);
    await shrinkToMin(page, 'a');
    const item = itemOf(page, 'a');
    const body = item.locator('.pane-body');
    // 本体の横幅の外へ出る部品が無い（図の見出しのⓘ・表示調整のボタン、凡例）
    expect(await spillingOutOf(body, 'x'), '本体の外へ出る部品').toEqual([]);
    expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth), '本体が横にスクロールしない').toBeLessThanOrEqual(1);
    const cards = item.locator('.flow-mini-panel');
    await expect(cards).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      const card = cards.nth(i);
      // 図の正方形・見出し・割合の文字が、カードの枠（切り抜きがある）で切れない
      expect(await spillingOutOf(card, 'x'), `カード${i}の中身`).toEqual([]);
      const cardBox = (await card.boundingBox())!;
      const viewport = (await card.locator('.flow-profile-viewport').boundingBox())!;
      expect(viewport.x, `図${i}の左`).toBeGreaterThanOrEqual(cardBox.x - 0.5);
      expect(viewport.x + viewport.width, `図${i}の右`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
      expect(viewport.height, `図${i}の高さ`).toBeGreaterThan(20);
      const svg = (await card.locator('.flow-profile-svg').boundingBox())!;
      expect(svg.x + svg.width, `図${i}の描画の右`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
      expect(svg.y + svg.height, `図${i}の描画の下`).toBeLessThanOrEqual(cardBox.y + cardBox.height + 0.5);
    }
    // 左右のカードで、図の上端・下端が揃う
    const tops = await cards.evaluateAll((els) => els.map((el) => {
      const v = el.querySelector('.flow-profile-viewport')!.getBoundingClientRect();
      return [Math.round(v.top), Math.round(v.bottom)];
    }));
    expect(tops[0]).toEqual(tops[1]);
    // 凡例（内向き・外向き）が本体の幅の中にある
    const legend = (await item.locator('.flow-roll-legend').boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    expect(legend.x).toBeGreaterThanOrEqual(bodyBox.x - 0.5);
    expect(legend.x + legend.width).toBeLessThanOrEqual(bodyBox.x + bodyBox.width + 0.5);
  });
}

/** 凡例（図の中の枠、または図の下の一覧）を読む。 */
async function readLegend(item: Locator) {
  return item.evaluate((root) => {
    const svg = root.querySelector('.n-sensitivity-svg')!;
    const svgBox = svg.getBoundingClientRect();
    const group = svg.querySelector('[data-n-sensitivity-legend]');
    const list = root.querySelector('.n-sensitivity-legend-list');
    const body = root.querySelector('.pane-body')!.getBoundingClientRect();
    if (group !== null) {
      const frame = svg.querySelector('.n-sensitivity-legend-frame')!.getBoundingClientRect();
      const labels = [...svg.querySelectorAll('.n-sensitivity-legend-label')];
      return {
        mode: group.getAttribute('data-n-sensitivity-legend')!,
        names: labels.map((el) => el.textContent ?? ''),
        frameInsideFigure: frame.left >= svgBox.left - 0.5 && frame.right <= svgBox.right + 0.5,
        labelsInsideFrame: labels.every((el) => {
          const b = el.getBoundingClientRect();
          return b.left >= frame.left - 0.5 && b.right <= frame.right + 0.5;
        }),
        insideBody: frame.left >= body.left - 0.5 && frame.right <= body.right + 0.5,
      };
    }
    const items = list === null ? [] : [...list.querySelectorAll('li')];
    return {
      mode: list === null ? 'none' : 'list',
      names: items.map((li) => li.querySelector('.n-sensitivity-legend-name')?.textContent ?? ''),
      frameInsideFigure: true,
      labelsInsideFrame: true,
      insideBody: list !== null && items.every((li) => {
        const b = li.getBoundingClientRect();
        return b.left >= body.left - 0.5 && b.right <= body.right + 0.5;
      }),
    };
  });
}

for (const c of cases) {
  for (const longNames of [false, true]) {
    test(`N感度: ${c.name}のペインで、${longNames ? '長いSetup名を6つ並べても' : '配列2つでも'}凡例が図からはみ出さず、名前を見分けられる`, async ({ page }) => {
      await open(page, 'n-sensitivity', c.size, { longNames });
      await shrinkToMin(page, 'a');
      const count = longNames ? LONG_SETUPS.length : 2;
      const item = itemOf(page, 'a');
      await expect(item.locator('[data-n-sensitivity-series]')).toHaveCount(count, { timeout: 20_000 });
      await settle(page);
      const legend = await readLegend(item);
      expect(legend.names, '凡例は対象の数だけ').toHaveLength(count);
      expect(new Set(legend.names).size, `名前が互いに違う: ${legend.names.join(' | ')}`).toBe(count);
      expect(legend.frameInsideFigure, '凡例の枠が図の幅に収まる').toBe(true);
      expect(legend.labelsInsideFrame, '名前が枠に収まる').toBe(true);
      expect(legend.insideBody, '凡例が本体の幅に収まる').toBe(true);
      const svg = (await item.locator('.n-sensitivity-svg').boundingBox())!;
      const body = (await item.locator('.pane-body').boundingBox())!;
      expect(svg.x + svg.width, '図が本体からはみ出さない').toBeLessThanOrEqual(body.x + body.width + 0.5);
      await expectHeaderUsable(page, 'a');
    });
  }
}

/**
 * 見出しの段。つかみ所・ⓘ・対象の選択・連動・条件・解析設定・⋯の中心の縦位置を、近いものどうしでまとめた数。
 * 1段なら1、先頭を1段目に分けたら2以上。
 */
async function headerRowCount(item: Locator): Promise<number> {
  return item.evaluate((root) => {
    const els = [...root.querySelectorAll<HTMLElement>('.pane-frame-header button, .pane-frame-header .workspace-drag-handle')]
      .filter((el) => el.getBoundingClientRect().width > 0);
    const centers = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    }).sort((a, b) => a - b);
    let rows = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const c of centers) {
      if (c - last > 12) rows += 1;
      last = c;
    }
    return rows;
  });
}

/** 見出しの名前（つかみ所の名前）が省略記号で縮んでいるか。 */
async function nameIsClipped(item: Locator): Promise<boolean> {
  return item.locator('.workspace-pane-lead-name').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
}

// 見出しが狭い時の詰め方は、名前を省略（つかみ所とⓘは残す）→ それでも入らない時に段を分ける。
// 名前を省略する幅（FHD・左のメニューを開いた状態で24列のうち5列 = 約314px）でも、ボタンは1段目に残る
// 見出しの組み立て（PaneFrame）は全Analyzerで共通で、Analyzerごとに違うのは名前の文字だけ（最小幅まで縮む）。
// 見出しの検査は代表のBigram Flowで1回にする。Analyzerごとの本体は、下限の幅のテストと3列のテストが全Analyzerで調べる
for (const analyzerId of ['bigram-flow'] as const) {
  test(`${analyzerId}: 5列のペインでは見出しが1段のまま、⋯と対象の選択に届く`, async ({ page }) => {
    await open(page, analyzerId, FHD, { cols: 5 });
    const item = itemOf(page, 'a');
    expect(((await item.locator('.pane-frame').boundingBox())!).width, '5列の幅').toBeLessThan(330);
    expect(await headerRowCount(item), '見出しが1段').toBe(1);
    // 1段に収める幅では、対象の選択は押せる最小の幅まで縮む（絵と開閉の印が入る幅）
    await expectHeaderUsable(page, 'a', 44);
    // つかみ所とⓘは残る。名前を省略しても、読み上げでAnalyzerの名前が分かる
    await expect(item.locator('.workspace-pane-grab .workspace-grip-icon')).toBeVisible();
    await expect(item.locator('.workspace-pane-lead .info-button')).toBeVisible();
    await expect(item.locator('.workspace-pane-lead .info-button')).toHaveAttribute('aria-label', /.+の説明/);
    const name = ((await item.locator('h2.pane-frame-title').textContent()) ?? '').trim();
    expect(name, '読み上げ用の見出しにAnalyzerの名前がある').not.toBe('');
    await expect(item.locator('.pane-frame')).toHaveAttribute('aria-label', new RegExp(`^${name}`));
    await expect(item.locator('.workspace-pane-lead .info-button')).toHaveAttribute('aria-label', `${name}の説明`);
  });
}

test('Bigram Flow: 5列では名前を省略して1段に収める。名前の全文は見出し（読み上げ）・title・枠の名前に残る', async ({ page }) => {
  await open(page, 'bigram-flow', FHD, { cols: 5 });
  const item = itemOf(page, 'a');
  expect(await nameIsClipped(item), '5列では名前を省略する').toBe(true);
  const visible = (await item.locator('.workspace-pane-lead-name').boundingBox())!;
  expect(visible.width, '名前は全部を消さず、手がかりの幅を残す').toBeGreaterThanOrEqual(30);
  await expect(item.locator('.workspace-pane-lead-name')).toHaveText('Bigram Flow');
  await expect(item.locator('.workspace-pane-grab')).toHaveAttribute('title', /^Bigram Flow/);
  await expect(item.locator('h2.pane-frame-title')).toHaveText('Bigram Flow');
  await expect(item.locator('.pane-frame')).toHaveAttribute('aria-label', /^Bigram Flow — /);
});

for (const cols of [6, 8]) {
  test(`Bigram Flow: ${cols}列のペインでも見出しが1段のまま、⋯と対象の選択に届く`, async ({ page }) => {
    await open(page, 'bigram-flow', FHD, { cols });
    const item = itemOf(page, 'a');
    expect(await headerRowCount(item), '見出しが1段').toBe(1);
    await expectHeaderUsable(page, 'a', 44);
  });
}

test('Bigram Flow: 8列まで広げれば名前は省略しない', async ({ page }) => {
  await open(page, 'bigram-flow', FHD, { cols: 8 });
  expect(await nameIsClipped(itemOf(page, 'a'))).toBe(false);
});

for (const analyzerId of ANALYZERS) {
  test(`${analyzerId}: 3列より狭いペインでは、名前を省略しても入らないので先頭を1段目に分ける。ボタンは重ならない`, async ({ page }) => {
    await open(page, analyzerId, FHD, { cols: 3 });
    const item = itemOf(page, 'a');
    expect(await headerRowCount(item), '先頭と操作で段が分かれる').toBeGreaterThanOrEqual(2);
    await expectHeaderUsable(page, 'a');
    await expectNoSpillOutsidePane(page, 'a');
  });
}

// 縮める順は、先に名前を最小幅まで、その後で対象の選択。名前が縮んでいる間、対象の選択の幅は変わらない
test('Bigram Flow: 見出しが狭まると、先に名前が最小幅まで縮み、その間は対象の選択の幅が変わらない。その後で対象の選択が縮む', async ({ page }) => {
  await open(page, 'bigram-flow', FHD, { cols: 8 });
  const item = itemOf(page, 'a');
  const measure = async (width: number) => item.evaluate((root, w) => {
    const frame = root.querySelector<HTMLElement>('.pane-frame')!;
    frame.style.width = `${w}px`;
    frame.style.maxWidth = `${w}px`;
    return {
      name: root.querySelector('.workspace-pane-lead-name')!.getBoundingClientRect().width,
      target: root.querySelector('.target-selection-button')!.getBoundingClientRect().width,
    };
  }, width);
  const full = await measure(480);
  expect(full.name, '広い時は名前の全文').toBeGreaterThan(80);
  const shrinkingName = [];
  for (const width of [380, 360]) shrinkingName.push(await measure(width));
  for (const m of shrinkingName) {
    expect(m.name, '名前が縮んでいる').toBeLessThan(full.name - 2);
    expect(m.name, 'まだ最小幅には着いていない').toBeGreaterThan(48);
    expect(Math.abs(m.target - full.target), `名前が縮んでいる間、対象の選択は変わらない（${m.target} / ${full.target}）`).toBeLessThanOrEqual(2);
  }
  const atMin = await measure(340);
  expect(atMin.name, '名前は最小幅（2.4rem = 約38px）まで').toBeLessThanOrEqual(42);
  const narrower = await measure(314);
  expect(narrower.name, '最小幅の名前はそれ以上縮まない').toBeGreaterThanOrEqual(atMin.name - 1);
  expect(narrower.target, '名前が最小幅になった後で、対象の選択が縮む').toBeLessThan(full.target - 10);
  expect(narrower.target, '5列（枠 314px）の対象の選択は押せる幅').toBeGreaterThanOrEqual(60);
});

// ---- 状態のバッジ（実際の状態で検査する）----
// 失敗: Bigram Flowの対象に、存在しないSetupを置く。計算中（直前の結果を表示）: 計算の依頼を保留して、計算中のまま保つ。
// 状態のバッジを文字で出すか点で出すかは、見出しの実際の幅と中身から測って決める。条件のchipは中身で幅が変わる
// （「既定値」・「N件変更」・「対象ごとに差あり」）ので、3種類をそれぞれ作る。

const LONG_TEXT = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. '.repeat(1500);
const BADGE_TEXT = { failed: '失敗', stale: '計算中…（直前の結果を表示）' } as const;
type BadgeStatus = keyof typeof BADGE_TEXT;

interface Chip {
  readonly name: string;
  readonly expected: string;
  readonly conditions?: Record<string, unknown>;
  readonly overrides?: Record<string, unknown>;
}
const CHIPS: readonly Chip[] = [
  { name: '既定値', expected: '条件: 既定値' },
  { name: 'N件変更', expected: '条件: 1件変更', conditions: { windowSize: 4 } },
  // 比較表の2つの配列で、先読みNの上書きが違う
  { name: '対象ごとに差あり', expected: '条件: 対象ごとに差あり', overrides: { layout: { dvorak: { windowSize: 2 } } } },
];

/**
 * 実際の状態のバッジを作る。`stale`は、直前の結果を残したまま計算の依頼を保留して作る（計算の速さに頼らない。
 * `worker-hold-helper.ts`）。テキストの値は、今までどおり長いものへ変える。
 */
async function openWithBadge(page: Page, analyzerId: AnalyzerId, status: BadgeStatus, cols: number, chip: Chip): Promise<void> {
  if (status === 'stale') await installWorkerHold(page);
  await open(page, analyzerId, FHD, { cols, status: status === 'failed' ? 'failed' : 'ready', ...(chip.conditions === undefined ? {} : { conditions: chip.conditions }), ...(chip.overrides === undefined ? {} : { overrides: chip.overrides }) });
  if (status === 'stale') {
    await holdWorker(page);
    const panel = await openTextChip(page);
    await panel.getByLabel('テキスト', { exact: true }).fill(LONG_TEXT);
    await page.keyboard.press('Escape');
    await expect(itemOf(page, 'a').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'stale', { timeout: 10_000 });
  }
  await expect(itemOf(page, 'a').locator('.pane-status-badge')).toHaveText(BADGE_TEXT[status]);
}

interface BadgeReport {
  readonly asText: boolean;
  readonly badgeWidth: number;
  readonly badgeInsideFrame: boolean;
  readonly overlaps: number;
  readonly textInsideBadge: boolean;
  readonly textClipped: boolean;
  readonly nameWidth: number;
  readonly title: string | null;
  readonly textContent: string | null;
}

async function badgeReport(item: Locator): Promise<BadgeReport> {
  return item.evaluate((root) => {
    const frame = root.querySelector('.pane-frame')!.getBoundingClientRect();
    const b = root.querySelector('.pane-status-badge')!;
    const text = b.querySelector('.pane-status-badge-text')!;
    const br = b.getBoundingClientRect();
    const tr = text.getBoundingClientRect();
    const others = [...root.querySelectorAll('.pane-frame-header button, .pane-frame-header .workspace-drag-handle')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => el.getBoundingClientRect());
    const overlaps = others.filter((r) => Math.min(r.right, br.right) - Math.max(r.left, br.left) > 1 && Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 1).length;
    // 文字で出ているかは見た目（文字の要素の幅）で決める。点の時は文字が1px四方に隠れる
    const asText = tr.width > 4;
    return {
      asText,
      badgeWidth: br.width,
      badgeInsideFrame: br.left >= frame.left - 0.5 && br.right <= frame.right + 0.5,
      overlaps,
      textInsideBadge: tr.left >= br.left - 0.5 && tr.right <= br.right + 0.5,
      textClipped: text.scrollWidth > text.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1,
      nameWidth: root.querySelector('.workspace-pane-lead-name')!.getBoundingClientRect().width,
      title: b.getAttribute('title'),
      textContent: text.textContent,
    };
  });
}

// 見出しは全Analyzerで共通のPaneFrameが組み、バッジの文字/点の境目もAnalyzerによらない（下の幅の確認で測った）。
// Bigram Flowは3つの幅と2つの状態で調べ、ComparisonとN感度は点になる5列と文字になる8列の2つの幅で、各Analyzerの対象の選択・解析設定との並びを調べる。
const BADGE_CASES: readonly { readonly analyzerId: AnalyzerId; readonly status: BadgeStatus; readonly cols: readonly number[] }[] = [
  { analyzerId: 'bigram-flow', status: 'failed', cols: [5, 6, 8] },
  { analyzerId: 'bigram-flow', status: 'stale', cols: [5, 6, 8] },
  { analyzerId: 'comparison', status: 'stale', cols: [5, 8] },
  { analyzerId: 'n-sensitivity', status: 'stale', cols: [5, 8] },
];

for (const { analyzerId, status, cols: colsList } of BADGE_CASES) {
  for (const cols of colsList) {
    test(`${analyzerId}: ${cols}列で、実際の状態「${BADGE_TEXT[status]}」のバッジが見え、ボタンと重ならず、字の途中で切れない`, async ({ page }) => {
      await openWithBadge(page, analyzerId, status, cols, CHIPS[0]!);
      const item = itemOf(page, 'a');
      await afterFrames(page);
      const report = await badgeReport(item);
      expect(report.badgeInsideFrame, 'バッジが枠の中にある').toBe(true);
      expect(report.overlaps, 'バッジがボタンの下に隠れない').toBe(0);
      expect(report.title, '状態の文がtitleに残る').toBe(BADGE_TEXT[status]);
      expect(report.textContent, '状態の文が読み上げ用の文字に残る').toBe(BADGE_TEXT[status]);
      if (report.asText) {
        expect(report.textInsideBadge, '文字がバッジの中に収まる').toBe(true);
        expect(report.textClipped, '字の途中で切れない').toBe(false);
      } else {
        expect(report.badgeWidth, '点の幅').toBeLessThanOrEqual(12);
      }
      // 8列（523px）は、名前を縮めれば全文が入る。名前を先に省略して、バッジは文字で出る
      if (cols === 8) {
        expect(report.asText, '8列ではバッジを文字で出す').toBe(true);
        if (status === 'stale') expect(report.nameWidth, '名前が縮んで空きを作る').toBeLessThan(80);
      }
      await expectHeaderUsable(page, 'a', 44);
    });
  }
}

// 枠の幅を変えて、バッジがボタンと重ならず枠から出ない、点にするのは名前が最小幅の時だけ、判定が往復しない
// （幅を変えて数フレーム待った後、さらに待っても文字/点が変わらない）、ResizeObserverの警告が出ない、を確かめる。
//
// 幅は全幅を掃引せず、見出しの状態が切り替わる境目の前後（境目の幅とその1px手前）と、両端（250px・900px）だけにする。
// 境目は推測で置かず、以前の掃引（250〜900pxを1px刻み）を実際に回して、次のどれかが変わる幅を測った。
//   バッジの文字/点、見出しの段数（1段/2段）、名前の省略（Bigram Flowの名前だけが省略される幅がある）
// 測った条件: dev server・Chromium・FHD相当の画面・8列のペインの枠の幅だけを変える・ライトテーマ・条件のchipは各ケースのとおり。
// 境目の多くはAnalyzerによらない（chipの幅は条件の中身で決まり、名前は最小幅まで縮むため）。
// Comparison・N感度の「既定値」「N件変更」はBigram Flowの同じ条件と文字/点の境目が一致したので、掃引はBigram Flowで代表させる。
// 「対象ごとに差あり」は対象が複数の時だけ出るので、Comparisonで測る。
//   共通: 311px。見出しが2段→1段（`pane-frame.css` の `@container pane (width > 19.4rem)`）
//   共通: 486px。バッジが点→文字
//   共通: 545px。条件のchipが開く（544pxを越える）ので、バッジは点に戻る
// CSSを変えて境目が動くと、境目の前後で状態が変わらなくなる。その時は「境目が動いた」と落ちるので、
// `SWEEP_FULL=1 npx playwright test e2e/workspace-narrow-panes.spec.ts -g 掃引 --workers=1` で全幅を回して測り直す。
// 境目を書き換える前に、全幅の掃引で `bad` が空なことを確かめる。
interface Sweep {
  readonly analyzerId: AnalyzerId;
  readonly status: BadgeStatus;
  readonly chip: Chip;
  /** 状態が切り替わる幅（この幅から新しい状態。1px手前は古い状態）。 */
  readonly boundaries: readonly number[];
}

const SWEEP_EDGES = [250, 900] as const;
// 環境変数 `SWEEP_FULL=1` で、250〜900pxを1px刻みで全部回し、状態が変わる幅を出力する（境目の測り直し用。CIの既定では回さない）。
const SWEEP_FULL = process.env['SWEEP_FULL'] === '1';
const widthsOf = (boundaries: readonly number[]): number[] => SWEEP_FULL
  ? Array.from({ length: 900 - 250 + 1 }, (_, i) => 250 + i)
  : [...new Set([...SWEEP_EDGES, ...boundaries.flatMap((b) => [b - 1, b])])].sort((a, b) => a - b);

const [CHIP_DEFAULT, CHIP_CHANGED, CHIP_DIFF] = CHIPS as readonly [Chip, Chip, Chip];
const SWEEPS: readonly Sweep[] = [
  // 311: 1段、名前を省略 / 402: 名前が全文 / 486: 文字 / 545: chipが開いて点 / 572: 文字 / 733: 名前が全文
  { analyzerId: 'bigram-flow', status: 'stale', chip: CHIP_DEFAULT, boundaries: [311, 402, 486, 545, 572, 733] },
  // 580: 文字 / 641: 点 / 649: 文字 / 742: 名前が全文
  { analyzerId: 'bigram-flow', status: 'stale', chip: CHIP_CHANGED, boundaries: [311, 402, 486, 545, 580, 641, 649, 742] },
  // 失敗は条件のchipが出ず、「失敗」は短いので、311pxから文字で出る。449: 名前が全文
  { analyzerId: 'bigram-flow', status: 'failed', chip: CHIP_DEFAULT, boundaries: [311, 449] },
  // 637: 文字 / 641: 点 / 706: 文字
  { analyzerId: 'comparison', status: 'stale', chip: CHIP_DIFF, boundaries: [311, 486, 545, 637, 641, 706] },
];

for (const { analyzerId, status, chip, boundaries } of SWEEPS) {
  test(`${analyzerId}: 条件が「${chip.name}」で、枠の幅を掃引しても、実際の状態「${BADGE_TEXT[status]}」のバッジがボタンと重ならず、判定が往復しない`, async ({ page }) => {
    if (SWEEP_FULL) test.setTimeout(300_000);
    const browserErrors = await collectBrowserErrors(page);
    await openWithBadge(page, analyzerId, status, 8, chip);
    const item = itemOf(page, 'a');
    // 条件のchipの文言を確かめる（既定値・N件変更・対象ごとに差あり）
    if (status === 'stale') await expect(item.getByRole('button', { name: chip.expected })).toHaveCount(1);
    const bad: string[] = [];
    const seen = new Map<number, string>();
    for (const width of widthsOf(boundaries)) {
      await item.locator('.pane-frame').evaluate((el, w) => {
        el.style.width = `${w}px`;
        el.style.maxWidth = `${w}px`;
      }, width);
      await afterFrames(page);
      const first = await badgeReport(item);
      await afterFrames(page);
      const second = await badgeReport(item);
      seen.set(width, [second.asText ? '文字' : '点', `${await headerRowCount(item)}段`, (await nameIsClipped(item)) ? '名前を省略' : '名前が全文'].join('/'));
      if (first.asText !== second.asText) bad.push(`${width}px: 判定が往復する`);
      if (second.overlaps > 0) bad.push(`${width}px: 重なり ${second.overlaps}件（${second.asText ? '文字' : '点'}）`);
      if (!second.badgeInsideFrame) bad.push(`${width}px: 枠からはみ出す`);
      if (second.asText && (second.textClipped || !second.textInsideBadge)) bad.push(`${width}px: 字の途中で切れる`);
      if (!second.asText && width > 311) {
        // 点にしたのは、名前を最小幅まで縮めても全文が入らないから。文字にして確かめる（入るなら、点にする理由が無い）
        // 文字にした時にボタンとの間隔（約5.6px）が残るかで見る。間隔が8px未満になる時（必要な間隔 5.6px に測り誤差を足した値）は、点にしてよい
        const textFits = await item.evaluate((root) => {
          const b = root.querySelector('.pane-status-badge')!;
          b.setAttribute('data-text', '');
          const br = b.getBoundingClientRect();
          const hit = [...root.querySelectorAll('.pane-frame-header button, .pane-frame-header .workspace-drag-handle')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .some((el) => {
              const r = el.getBoundingClientRect();
              return Math.min(r.right, br.right + 8) - Math.max(r.left, br.left) > 0.5 && Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 1;
            });
          const header = root.querySelector('.pane-frame-header')!;
          const overflow = header.scrollWidth > header.clientWidth + 1;
          b.removeAttribute('data-text');
          return !hit && !overflow;
        });
        if (textFits) bad.push(`${width}px: 文字でも入るのに点（名前 ${Math.round(second.nameWidth)}px）`);
      }
    }
    if (SWEEP_FULL) {
      // 全幅の掃引では、状態が変わる幅を出力する（上の境目の表と見比べる）
      const changes: string[] = [];
      let previous = '';
      for (const [width, state] of seen) {
        if (state !== previous) changes.push(`${width}px: ${state}`);
        previous = state;
      }
      console.log(`[SWEEP_FULL] ${analyzerId}・${status}・${chip.name}\n${changes.join('\n')}`);
    } else {
      // 境目の前後で状態が変わっていること。変わっていなければ、CSSの変更で境目が動いている
      for (const boundary of boundaries) {
        expect(seen.get(boundary - 1), `境目が動いた: ${boundary}px付近で見出しの状態が変わらない。SWEEP_FULL=1で全幅を回して測り直す。境目を書き換える前に、全幅の掃引で \`bad\` が空なことを確かめる`).not.toBe(seen.get(boundary));
      }
    }
    expect(bad, 'バッジの不具合がある幅').toEqual([]);
    expect(browserErrors.resizeObserver(), 'ResizeObserverの警告が出ない').toEqual([]);
  });
}

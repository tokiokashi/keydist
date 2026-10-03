import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

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

function paneOf(id: string, analyzerId: AnalyzerId, longNames: boolean) {
  const set = longNames
    ? { kind: 'set', selection: { targets: LONG_SETUPS.map((s) => ({ kind: 'setup', setupId: s.id })), colorSlots: LONG_SETUPS.map((_, i) => i) } }
    : { kind: 'set', selection: { targets: [QWERTY, DVORAK], colorSlots: [0, 1] } };
  return {
    id,
    analyzerId,
    binding: analyzerId === 'bigram-flow'
      ? { mode: 'fixed', target: { kind: 'single', target: QWERTY } }
      : { mode: 'fixed', target: set },
  };
}

/** 対象のペイン（x=0）と、その右の隣のペイン（はみ出しの検査用）を置く。 */
async function open(page: Page, analyzerId: AnalyzerId, size: { width: number; height: number }, options: { longNames?: boolean; theme?: 'light' | 'dark' } = {}): Promise<void> {
  const longNames = options.longNames === true;
  await page.setViewportSize(size);
  await page.addInitScript(({ key, setupKey, setups, theme, value }) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
      localStorage.setItem(setupKey, JSON.stringify({ version: 1, setups, overrides: {} }));
      localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, appearance: { theme } }));
    }
  }, {
    key: WORKSPACES_KEY,
    setupKey: SETUP_LIBRARY_KEY,
    setups: LONG_SETUPS,
    theme: options.theme ?? 'light',
    value: {
      id: 'narrow',
      name: '細いペイン',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [paneOf('a', analyzerId, longNames), paneOf('b', 'comparison', false)],
      grid: [
        { id: 'a', x: 0, y: 0, w: 8, h: 20 },
        { id: 'b', x: 8, y: 0, w: 8, h: 20 },
      ],
    },
  });
  await page.goto('/workspace/narrow');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(2);
  await expect(itemOf(page, 'a').locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await settle(page);
}

const itemOf = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

/** ライブラリの配置の動き（200ms）と図の測り直しが済むまで待つ。 */
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
  while (stable < 4) {
    await page.waitForTimeout(100);
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

async function expectHeaderUsable(page: Page, id: string): Promise<void> {
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
  expect(((await target.boundingBox())!).width, '対象の選択が潰れない').toBeGreaterThanOrEqual(60);
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

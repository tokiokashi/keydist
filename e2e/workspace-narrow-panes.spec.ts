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
async function open(page: Page, analyzerId: AnalyzerId, size: { width: number; height: number }, options: { longNames?: boolean; theme?: 'light' | 'dark'; cols?: number } = {}): Promise<void> {
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
        { id: 'a', x: 0, y: 0, w: options.cols ?? 8, h: 20 },
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
for (const analyzerId of ANALYZERS) {
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

const BADGES = {
  failed: '失敗',
  computing: '計算中…',
  stale: '計算中…（直前の結果を表示）',
} as const;

/**
 * 状態のバッジを見出しの対象の欄の末尾に差し込む（アプリが出すのと同じ構造・属性）。
 * 計算を遅らせたり失敗させたりする経路は、結果が出るまで本体の幅の検査ができないので、構造を直接置く。
 */
async function insertBadge(item: Locator, status: keyof typeof BADGES): Promise<void> {
  await item.evaluate((root, args) => {
    const target = root.querySelector('.pane-frame-target')!;
    target.insertAdjacentHTML('beforeend', `<span class="pane-status-badge" data-status="${args.status}" title="${args.label}"><span class="pane-status-badge-text">${args.label}</span></span>`);
  }, { status, label: BADGES[status] });
}

// 状態のバッジは、全文が入る幅では文字で、入らない幅では文字の無い点で出す。どちらでも、見えて、ボタンの下に隠れず、
// 字の途中で切れない。状態の文は読み上げ用の文字とtitleに残る
for (const analyzerId of ['bigram-flow', 'comparison'] as const) {
  for (const status of Object.keys(BADGES) as (keyof typeof BADGES)[]) {
    for (const cols of [5, 6, 8]) {
      test(`${analyzerId}: ${cols}列で状態「${BADGES[status]}」のバッジが見え、ボタンと重ならず、字の途中で切れない`, async ({ page }) => {
        await open(page, analyzerId, FHD, { cols });
        const item = itemOf(page, 'a');
        await insertBadge(item, status);
        const badge = item.locator('.pane-status-badge');
        await expect(badge).toBeVisible();
        const report = await item.evaluate((root) => {
          const frame = root.querySelector('.pane-frame')!.getBoundingClientRect();
          const b = root.querySelector('.pane-status-badge')!;
          const text = b.querySelector('.pane-status-badge-text')!;
          const br = b.getBoundingClientRect();
          const tr = text.getBoundingClientRect();
          const others = [...root.querySelectorAll('.pane-frame-header button, .pane-frame-header .workspace-drag-handle')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => el.getBoundingClientRect());
          const overlaps = others.filter((r) => Math.min(r.right, br.right) - Math.max(r.left, br.left) > 1 && Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 1).length;
          return {
            badgeWidth: br.width,
            badgeInsideFrame: br.left >= frame.left - 0.5 && br.right <= frame.right + 0.5,
            overlaps,
            textWidth: tr.width,
            textInsideBadge: tr.left >= br.left - 0.5 && tr.right <= br.right + 0.5,
            textClipped: text.scrollWidth > text.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1,
            title: b.getAttribute('title'),
            textContent: text.textContent,
          };
        });
        expect(report.badgeInsideFrame, 'バッジが枠の中にある').toBe(true);
        expect(report.overlaps, 'バッジがボタンの下に隠れない').toBe(0);
        expect(report.title, '状態の文がtitleに残る').toBe(BADGES[status]);
        expect(report.textContent, '状態の文が読み上げ用の文字に残る').toBe(BADGES[status]);
        // 文字で出すなら全文が収まる。入らないなら点（文字は隠れて、幅は小さい）
        const asText = report.textWidth > 4;
        if (asText) {
          expect(report.textInsideBadge, '文字がバッジの中に収まる').toBe(true);
          expect(report.textClipped, '字の途中で切れない').toBe(false);
        } else {
          expect(report.badgeWidth, '点の幅').toBeLessThanOrEqual(12);
        }
        // 5列・6列では文字が入らない状態もある。8列（523px）は、失敗と計算中…の全文が入る。
        // 「直前の結果を表示」は、条件のchipが出る幅（34rem超）の合計に合わせて38remから文字にするので、8列は点
        if (cols === 8) expect(asText, '8列では文字で出す').toBe(status !== 'stale');
        await expectHeaderUsable(page, 'a', 44);
      });
    }
  }
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

// 枠の幅を掃引して、状態のバッジが全幅でボタンと重ならず、枠からはみ出さないことを確かめる。
// 条件が「条件: 既定値」のchipになる境目（34rem = 544px）と、バッジが文字と点で切り替わる各幅
// （23rem = 368px・25rem = 400px・38rem = 608px）の前後は1px刻みで、その間の広い範囲は10px刻みで測る
const SWEEP_WIDTHS = (() => {
  const widths = new Set<number>();
  for (let w = 250; w <= 900; w += 10) widths.add(w);
  for (const edge of [368, 400, 544, 608]) for (let w = edge - 4; w <= edge + 4; w += 1) widths.add(w);
  // 文字のバッジがchipと重なっていた幅（545〜565px）と、その上の切り替えまでを1px刻みで
  for (let w = 540; w <= 620; w += 1) widths.add(w);
  return [...widths].sort((a, b) => a - b);
})();

for (const analyzerId of ANALYZERS) {
  for (const status of Object.keys(BADGES) as (keyof typeof BADGES)[]) {
    test(`${analyzerId}: 枠の幅を250〜900pxで掃引しても、状態「${BADGES[status]}」のバッジがボタンと重ならず、枠からはみ出さない`, async ({ page }) => {
      await open(page, analyzerId, FHD, { cols: 8 });
      const item = itemOf(page, 'a');
      await insertBadge(item, status);
      const bad = await item.evaluate((root, widths) => {
        const frame = root.querySelector<HTMLElement>('.pane-frame')!;
        const badge = root.querySelector('.pane-status-badge')!;
        const found: string[] = [];
        for (const w of widths) {
          frame.style.width = `${w}px`;
          frame.style.maxWidth = `${w}px`;
          const f = frame.getBoundingClientRect();
          const b = badge.getBoundingClientRect();
          const others = [...root.querySelectorAll('.pane-frame-header button, .pane-frame-header .workspace-drag-handle')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => el.getBoundingClientRect());
          let worst = 0;
          for (const r of others) {
            const ww = Math.min(r.right, b.right) - Math.max(r.left, b.left);
            const hh = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
            if (ww > 1 && hh > 1) worst = Math.max(worst, ww);
          }
          const out = Math.max(b.right, ...others.map((r) => r.right)) - f.right;
          if (worst > 0 || out > 0.5) found.push(`${w}px: 重なり ${worst.toFixed(1)}px・はみ出し ${out.toFixed(1)}px`);
        }
        return found;
      }, SWEEP_WIDTHS);
      expect(bad, 'バッジがボタンと重なる・枠からはみ出す幅').toEqual([]);
    });
  }
}

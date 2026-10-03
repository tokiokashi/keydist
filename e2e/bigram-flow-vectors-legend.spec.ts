import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Relative vectorsの凡例（内向き・外向き・最大{N}u · ±{N}°）は、左右の図の下に1行で置く（#906）。
 * Keyboard Flowの凡例が図の下にあるのと揃い、2つを横に並べた時に図の上端・下端が揃う。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };

/**
 * 図の位置が落ち着くまで待つ。格子のライブラリは配置が変わると短い動き（200ms）を付けるので、
 * 動いている最中の矩形を測ると上端がずれる（`workspace-grid.spec.ts` の `settle()` と同じ考え方）。
 */
async function settle(page: Page): Promise<void> {
  const signature = () => page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    return ['.flow-stage', '.flow-two-up', '.flow-roll-legend']
      .map((q) => {
        const r = feature.querySelector(q)!.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      }).join('|');
  });
  let last = await signature();
  let stable = 0;
  while (stable < 4) {
    await page.waitForTimeout(100);
    const now = await signature();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

function measure(page: Page) {
  return page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const box = (q: string) => {
      const r = feature.querySelector(q)!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const legend = feature.querySelector('.flow-roll-legend')!;
    const tops = [...legend.children].map((c) => Math.round(c.getBoundingClientRect().top));
    return {
      keyboardFigure: box('.flow-stage'),
      vectorsFigure: box('.flow-two-up'),
      legend: box('.flow-roll-legend'),
      section: box('.flow-analysis'),
      keyboardSvgBox: (() => {
        const r = feature.querySelector('.flow-keyboard-svg')!.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })(),
      keyboardSvgRatio: (() => {
        const vb = feature.querySelector('.flow-keyboard-svg')!.getAttribute('viewBox')!.split(/\s+/).map(Number);
        return vb[2]! / vb[3]!;
      })(),
      bodyWidth: feature.closest('.pane-body')?.clientWidth ?? 0,
      bodyOverflowX: (feature.closest('.pane-body')?.scrollWidth ?? 0) - (feature.closest('.pane-body')?.clientWidth ?? 0),
      legendOneLine: new Set(tops).size === 1,
    };
  });
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-react-feature="bigram-flow"] [data-flow-edge="true"]').first()).toBeAttached();
  await settle(page);
}

interface SideCase {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  /** 画面の幅。ペインの本体の幅を狭い側へ寄せる（本体の幅は検査の中で確かめる）。 */
  readonly viewport?: number;
  readonly fingers?: readonly string[];
  readonly rootFontSize?: string;
  readonly openSettings?: 'Keyboard Flow' | 'Relative vectors';
  /** 本体の幅の範囲。 */
  readonly bodyWidth?: readonly [number, number];
}

/** 保存先へWorkspaceを直接書いて開く。 */
async function openWorkspace(page: Page, c: SideCase): Promise<void> {
  await page.setViewportSize({ width: c.viewport ?? 1440, height: 1100 });
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, {
    id: 'legend',
    name: '凡例の確認',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: [c.fingers === undefined ? flow : { ...flow, options: { selectedFingers: c.fingers } }],
    grid: [{ id: 'f', x: 0, y: 0, w: c.w, h: c.h }],
  });
  await page.goto('/workspace/legend');
  await waitForHydration(page);
  await ready(page);
  if (c.rootFontSize !== undefined) {
    // 利用者のブラウザの文字サイズ設定（rem の基準）を大きくした状態。読み込み後に変えて、組み直しを待つ。
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, c.rootFontSize);
    await settle(page);
  }
  if (c.openSettings !== undefined) {
    await page.getByRole('button', { name: `${c.openSettings}の表示`, exact: true }).click();
    await expect(page.getByRole('group', { name: `${c.openSettings}の表示` })).toBeVisible();
    await settle(page);
  }
}

/** 横に並ぶ範囲の狭い側から広い側、行が低い・高いペイン、見出し・文字・設定の違いで、2つの図の上端・下端が揃う。 */
const sideBySide: SideCase[] = [
  { name: '広い（12列 x 19行）', w: 12, h: 19 },
  { name: '広くて低い（12列 x 12行）', w: 12, h: 12 },
  { name: '中ぐらい（8列 x 14行）', w: 8, h: 14 },
  { name: '狭い側（6列 x 10行）', w: 6, h: 10 },
  { name: '下限付近（本体520〜560px）', w: 12, h: 10, viewport: 840, bodyWidth: [520, 560] },
  { name: '下限付近で指を2つ選ぶ', w: 12, h: 10, viewport: 840, bodyWidth: [520, 560], fingers: ['ring', 'pinky'] },
  { name: '6列で指を2つ選ぶ', w: 6, h: 10, fingers: ['ring', 'pinky'] },
  { name: '文字サイズ24px・下限付近', w: 12, h: 10, viewport: 940, bodyWidth: [520, 560], rootFontSize: '24px' },
  { name: '文字サイズ24px・やや広い', w: 12, h: 10, viewport: 960, bodyWidth: [520, 600], rootFontSize: '24px', fingers: ['ring', 'pinky'] },
  { name: 'Relative vectorsの設定だけ開く', w: 12, h: 19, openSettings: 'Relative vectors' },
  { name: 'Keyboard Flowの設定だけ開く', w: 12, h: 19, openSettings: 'Keyboard Flow' },
];

// 文字サイズ24pxで、横に並ぶ下限付近の幅を細かく動かしても、横スクロールが出ず、上端・下端が揃う。
for (let viewport = 940; viewport <= 990; viewport += 10) {
  sideBySide.push({ name: `文字サイズ24px・画面${viewport}px`, w: 12, h: 10, viewport, rootFontSize: '24px', fingers: ['ring', 'pinky'] });
}

for (const c of sideBySide) {
  test(`Workspaceで2つの図が横に並ぶ時（${c.name}）、Keyboard Flowと左右の図の上端・下端が揃い、凡例は図の下にある`, async ({ page }) => {
    await openWorkspace(page, c);
    const m = await measure(page);
    if (c.bodyWidth !== undefined) {
      expect(m.bodyWidth).toBeGreaterThanOrEqual(c.bodyWidth[0]);
      expect(m.bodyWidth).toBeLessThanOrEqual(c.bodyWidth[1]);
    }
    // 横に並んでいる（左右の図がKeyboard Flowの右にある）
    expect(m.vectorsFigure.left).toBeGreaterThan(m.keyboardFigure.right - 1);
    // 行を共有するので、差は端数の丸めの1pxだけ許す
    expect(Math.abs(m.vectorsFigure.top - m.keyboardFigure.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.vectorsFigure.bottom - m.keyboardFigure.bottom)).toBeLessThanOrEqual(1);
    expect(m.legend.top).toBeGreaterThanOrEqual(m.vectorsFigure.bottom - 1);
    if (c.rootFontSize === undefined) expect(m.legendOneLine).toBe(true);
    // 本体に横スクロールが出ない
    expect(m.bodyOverflowX).toBeLessThanOrEqual(0);
    // 絵は縦横比を保つ（枠だけが伸び、絵は枠の中に収まる）
    expect(m.keyboardSvgBox.height).toBeLessThanOrEqual(m.keyboardFigure.height + 1);
    expect(m.keyboardSvgBox.width / m.keyboardSvgBox.height).toBeCloseTo(m.keyboardSvgRatio, 1);
  });
}

// 低いペインで片方の図のそばの設定を開いても、反対側の図は縮まず、開いた側の図も消えない。
const lowPanes: readonly SideCase[] = [
  { name: '12列 x 12行', w: 12, h: 12, fingers: ['ring', 'pinky'] },
  { name: '12列 x 10行（本体520〜560px）', w: 12, h: 10, viewport: 840, bodyWidth: [520, 560], fingers: ['ring', 'pinky'] },
  { name: '6列 x 10行', w: 6, h: 10, fingers: ['ring', 'pinky'] },
  { name: '8列 x 14行・文字サイズ24px', w: 8, h: 14, rootFontSize: '24px', fingers: ['ring', 'pinky'] },
];

for (const c of lowPanes) {
  for (const figure of ['Keyboard Flow', 'Relative vectors'] as const) {
    test(`低いペイン（${c.name}）で${figure}の設定を開いても、反対側の図は縮まず、上端・下端が揃う`, async ({ page }) => {
      await openWorkspace(page, c);
      const closed = await measure(page);
      await page.getByRole('button', { name: `${figure}の表示`, exact: true }).click();
      await expect(page.getByRole('group', { name: `${figure}の表示` })).toBeVisible();
      await settle(page);
      const open = await measure(page);
      // 横に並んだまま
      expect(open.vectorsFigure.left).toBeGreaterThan(open.keyboardFigure.right - 1);
      const height = (m: typeof closed, side: 'keyboardFigure' | 'vectorsFigure') => m[side].bottom - m[side].top;
      const opposite = figure === 'Keyboard Flow' ? 'vectorsFigure' : 'keyboardFigure';
      // 反対側の図は縮まない。閉じていた時に高さへ収めるために縮んでいた分は、開くと本体の中のスクロールへ回って元の大きさに戻るので、増える分は許す。
      expect(height(open, opposite)).toBeGreaterThanOrEqual(height(closed, opposite) - 1);
      expect(height(open, 'keyboardFigure')).toBeGreaterThan(50);
      expect(height(open, 'vectorsFigure')).toBeGreaterThan(50);
      expect(Math.abs(open.vectorsFigure.top - open.keyboardFigure.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(open.vectorsFigure.bottom - open.keyboardFigure.bottom)).toBeLessThanOrEqual(1);
    });
  }
}

for (const width of [1200, 390]) {
  test(`個別画面（幅${width}px）で縦に積んでも、凡例は左右の図の下に出て枠からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/bigram-flow');
    await ready(page);
    const m = await measure(page);
    expect(m.legend.top).toBeGreaterThanOrEqual(m.vectorsFigure.bottom - 1);
    expect(m.legend.right).toBeLessThanOrEqual(m.section.right + 1);
    expect(m.legend.left).toBeGreaterThanOrEqual(m.section.left - 1);
  });
}

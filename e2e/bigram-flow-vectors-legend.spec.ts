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
      legendOneLine: new Set(tops).size === 1,
    };
  });
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-react-feature="bigram-flow"] [data-flow-edge="true"]').first()).toBeAttached();
  await settle(page);
}

/** 横に並ぶ範囲の狭い側から広い側、行が低い・高いペインで、2つの図の上端・下端が揃う。 */
const sideBySide = [
  { name: '広い（12列 x 19行）', w: 12, h: 19 },
  { name: '広くて低い（12列 x 12行）', w: 12, h: 12 },
  { name: '中ぐらい（8列 x 14行）', w: 8, h: 14 },
  { name: '狭い側（6列 x 10行）', w: 6, h: 10 },
];

for (const c of sideBySide) {
  test(`Workspaceで2つの図が横に並ぶ時（${c.name}）、Keyboard Flowと左右の図の上端・下端が揃い、凡例は図の下にある`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.addInitScript((value) => {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }, {
      id: 'legend',
      name: '凡例の確認',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      panes: [flow],
      grid: [{ id: 'f', x: 0, y: 0, w: c.w, h: c.h }],
    });
    await page.goto('/workspace/legend');
    await waitForHydration(page);
    await ready(page);
    const m = await measure(page);
    // 横に並んでいる（左右の図がKeyboard Flowの右にある）
    expect(m.vectorsFigure.left).toBeGreaterThan(m.keyboardFigure.right - 1);
    // 同じ行の見出しは同じ高さ、枠は同じ行の高さまで伸ばすので、差は端数の丸めの1pxだけ許す
    expect(Math.abs(m.vectorsFigure.top - m.keyboardFigure.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.vectorsFigure.bottom - m.keyboardFigure.bottom)).toBeLessThanOrEqual(1);
    expect(m.legend.top).toBeGreaterThanOrEqual(m.vectorsFigure.bottom - 1);
    expect(m.legendOneLine).toBe(true);
    // 絵は縦横比を保つ（枠だけが伸び、絵は枠の中に収まる）
    expect(m.keyboardSvgBox.height).toBeLessThanOrEqual(m.keyboardFigure.height + 1);
    expect(m.keyboardSvgBox.width / m.keyboardSvgBox.height).toBeCloseTo(m.keyboardSvgRatio, 1);
  });
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

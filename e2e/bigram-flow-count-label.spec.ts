import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Bigram Flowの「2打鍵 N組」は、本文の先頭に1行を使わず、Keyboard Flowの見出しの行に置く（#928）。
 * 見出しの名前の一部なので、読み上げでも組の数が分かる。細いペインでも、同じ行のⓘ・表示調整のボタンと重ならない。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const flow = { id: 'a', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };

async function openWorkspace(page: Page, cols: number): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, {
    id: 'c', name: '組の数', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: [flow],
    grid: [{ id: 'a', x: 0, y: 0, w: cols, h: 22 }],
  });
  await page.goto('/workspace/c');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible();
  // 格子の配置の動き（200ms）が済むまで待つ。
  await page.waitForTimeout(600);
}

/** 本文の最初の要素が、ラベルだけの行ではなくKeyboard Flowの枠であること。 */
async function expectNoLabelOnlyRow(page: Page): Promise<void> {
  const feature = page.locator('[data-react-feature="bigram-flow"]');
  await expect(feature.locator('.flow-status')).toHaveCount(0);
  const first = await feature.evaluate((el) => el.firstElementChild?.getAttribute('aria-label') ?? null);
  expect(first).toBe('Keyboard Flow');
  // 見出しの行の中に組の数がある。
  const heading = feature.locator('.flow-keyboard-block .flow-block-heading');
  await expect(heading).toContainText(/2打鍵 [\d,]+組/);
}

test('個別画面: 組の数は本文の先頭の行を使わず、見出しの名前として読み上げられる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await expectNoLabelOnlyRow(page);
  await expect(page.getByRole('heading', { level: 3, name: /^Keyboard Flow 2打鍵 [\d,]+組$/ })).toBeVisible();
  // 本文の先頭の要素の上端と、Keyboard Flowの見出しの上端が同じ（間に行が無い）。
  const gap = await page.evaluate(() => {
    const feature = document.querySelector('[data-react-feature="bigram-flow"]')!;
    const heading = feature.querySelector('.flow-keyboard-block .flow-block-heading')!.getBoundingClientRect();
    return heading.top - feature.getBoundingClientRect().top;
  });
  expect(gap).toBeLessThan(2);
});

for (const cols of [2, 4, 6, 12]) {
  test(`Workspace（${cols}列）: 組の数が見出しのボタンと重ならず、本文の幅に収まる`, async ({ page }) => {
    await openWorkspace(page, cols);
    await expectNoLabelOnlyRow(page);
    const report = await page.evaluate(() => {
      const body = document.querySelector('.pane-body')!.getBoundingClientRect();
      const heading = document.querySelector('.flow-keyboard-block .flow-block-heading')!;
      const parts = [
        ['count', heading.querySelector('.flow-block-count')!],
        ['info', heading.querySelector('.info')!],
        ['toggle', heading.querySelector('.flow-figure-settings-toggle')!],
      ] as const;
      const rects = parts.map(([name, el]) => ({ name, r: el.getBoundingClientRect() }));
      const overlaps: string[] = [];
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]!.r;
          const b = rects[j]!.r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 0.5 && h > 0.5) overlaps.push(`${rects[i]!.name}/${rects[j]!.name}`);
        }
      }
      return {
        overlaps,
        outside: rects.filter(({ r }) => r.left < body.left - 0.5 || r.right > body.right + 0.5).map((x) => x.name),
        bodyOverflow: document.querySelector('.pane-body')!.scrollWidth - document.querySelector('.pane-body')!.clientWidth,
      };
    });
    expect(report.overlaps).toEqual([]);
    expect(report.outside).toEqual([]);
    expect(report.bodyOverflow).toBeLessThanOrEqual(0);
  });
}

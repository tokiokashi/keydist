import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceでは、画面全体（全ペインの対象の和）を1つの集合として対象の色を配る（#630）。
 * 同じ対象は、ペインに入れた順が違っても、どのペインの図・見出しでも同じ色になる。
 */

const layout = (layoutId: string) => ({ kind: 'layout', layoutId });
const QWERTY = layout('qwerty');
const COLEMAK = layout('colemak-dh');
const DVORAK = layout('dvorak');

const sensitivity = (id: string, targets: unknown[]) => ({
  id,
  analyzerId: 'n-sensitivity',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } },
});
const comparison = (id: string, targets: unknown[]) => ({
  id,
  analyzerId: 'comparison',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } },
});

async function openWorkspace(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
  }, {
    id: 'colors',
    name: '色の確認',
    // 3ペインで同じ対象を違う順に入れる。先頭のペインの順が色の順になる
    panes: [
      sensitivity('a', [QWERTY, COLEMAK, DVORAK]),
      sensitivity('b', [DVORAK, QWERTY, COLEMAK]),
      comparison('c', [DVORAK, QWERTY]),
    ],
    layout: {
      kind: 'split', direction: 'row', weight: 1, children: [
        { kind: 'group', paneIds: ['a'], weight: 1 },
        { kind: 'group', paneIds: ['b'], weight: 1 },
        { kind: 'group', paneIds: ['c'], weight: 1 },
      ],
    },
  });
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/workspace/colors');
  await waitForHydration(page);
}

test('同じ対象は、別のペインに違う順で入れても、図の線と見出しの色見本で同じ色になる', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(6, { timeout: 30_000 });

  const strokes = async (svgIndex: number) => {
    const svg = page.locator('.n-sensitivity-svg').nth(svgIndex);
    const result: Record<string, string | null> = {};
    for (const key of ['layout:qwerty', 'layout:colemak-dh', 'layout:dvorak']) {
      result[key] = await svg.locator(`[data-n-sensitivity-series="${key}"] .n-sensitivity-line`).first().getAttribute('stroke');
    }
    return result;
  };
  const first = await strokes(0);
  const second = await strokes(1);
  expect(second).toEqual(first);
  // 3つの対象は互いに違う色（集合の中で配っているので重ならない）
  expect(new Set(Object.values(first)).size).toBe(3);

  // 比較表のペインの見出しの色見本（表示順は一覧の順: QWERTY, Dvorak）も、図の線と同じ色
  const swatches = await page.locator('.pane-frame').nth(2).locator('.target-selection-swatch').evaluateAll(
    (nodes) => nodes.map((node) => {
      const shape = node.querySelector('path')!;
      return (shape.getAttribute('fill') !== 'none' ? shape.getAttribute('fill')! : shape.getAttribute('stroke')!).toLowerCase();
    }),
  );
  expect(swatches).toEqual([first['layout:qwerty'], first['layout:dvorak']].map((color) => color!.toLowerCase()));
});

test('同じ対象は、別のペインでも同じ点の形と線種になり、見出しの色見本の形も図と同じ（色以外の手がかり）', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(6, { timeout: 30_000 });

  const keys = ['layout:qwerty', 'layout:colemak-dh', 'layout:dvorak'];
  const marks = async (svgIndex: number) => {
    const svg = page.locator('.n-sensitivity-svg').nth(svgIndex);
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      const series = svg.locator(`[data-n-sensitivity-series="${key}"]`);
      const shape = await series.locator('.n-sensitivity-point').first().getAttribute('data-mark');
      const dash = await series.locator('.n-sensitivity-line').getAttribute('stroke-dasharray');
      result[key] = `${shape}/${dash ?? 'solid'}`;
    }
    return result;
  };
  const first = await marks(0);
  expect(await marks(1)).toEqual(first);
  expect(new Set(Object.values(first)).size).toBe(3);

  // 比較表のペイン（QWERTY, Dvorakの順）の色見本は、図の点と同じ形
  const swatchShapes = await page.locator('.pane-frame').nth(2).locator('.target-selection-swatch').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('data-mark')),
  );
  expect(swatchShapes).toEqual([first['layout:qwerty'], first['layout:dvorak']].map((mark) => mark!.split('/')[0]));
});

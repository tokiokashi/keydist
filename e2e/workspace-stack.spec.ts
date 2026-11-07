import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { advance, settleBy } from './settle-helper.ts';
import { SHORT_TEXT_REF, useShortText } from './short-text-helper.ts';

/**
 * スマホ幅（760px以下）のWorkspaceは、格子を使わずペインを縦に積む。境目をまたいでも、格子の位置・大きさは資産に残る。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const comparison = {
  id: 'c',
  analyzerId: 'comparison',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }] } } },
};
const sensitivity = { id: 'n', analyzerId: 'n-sensitivity', binding: { mode: 'follow', group: 'link-1' } };
/** 左にBigram Flow、右に上から比較表・N感度。大きさは既定から外しておく（戻した時に大きさが残るかを見る）。 */
const GRID = [
  { id: 'f', x: 0, y: 0, w: 8, h: 16 },
  { id: 'c', x: 8, y: 0, w: 16, h: 9 },
  { id: 'n', x: 8, y: 9, w: 16, h: 12 },
];

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function openWorkspace(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await useShortText(page);
  await page.addInitScript(
    (value) => {
      if (localStorage.getItem('keydist:workspaces') === null) {
        localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
      }
    },
    {
      id: 'stack',
      name: '新しいWorkspace',
      text: { ref: SHORT_TEXT_REF },
      panes: [flow, comparison, sensitivity],
      grid: GRID,
      groups: [{ id: 'link-1', target: {} }],
    },
  );
  await page.goto('/workspace/stack');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveCount(3);
}

const storedGrid = async (page: Page) =>
  page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key) ?? '{}').workspaces?.[0]?.grid), WORKSPACES_KEY);

test('境目をまたいで狭めて戻しても、格子の位置・大きさ（資産の配置）は元のまま', async ({ page }) => {
  await page.clock.install();
  await openWorkspace(page, DESKTOP);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  const rects = () =>
    page.locator('.workspace-grid-item').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      }),
    );
  // ライブラリの配置の動き（200ms）が済んでから測る（動いている最中の寸法を基準にしない）
  const settled = () => settleBy(page, async () => JSON.stringify(await rects()));
  await settled();
  const before = await rects();
  const gridBefore = await storedGrid(page);

  await page.setViewportSize(PHONE);
  await expect(page.locator('[data-workspace-stack="true"]')).toBeVisible();
  await expect(page.locator('.workspace-grid-item')).toHaveCount(0);
  // 狭い間に、待ち時間を越えても書き換わらない。保存の間引きを越える時間をタイマーで進める
  await advance(page, 600);
  expect(await storedGrid(page)).toBe(gridBefore);

  await page.setViewportSize(DESKTOP);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(3);
  await expect(page.locator('[data-workspace-stack="true"]')).toHaveCount(0);
  await advance(page, 600);
  expect(await storedGrid(page)).toBe(gridBefore);
  await settled();
  const after = await rects();
  for (let n = 0; n < before.length; n += 1) {
    for (let k = 0; k < 4; k += 1) expect(Math.abs(after[n]![k]! - before[n]![k]!)).toBeLessThanOrEqual(3);
  }
  // ペインは1つも失われていない
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', '比較表', 'N感度']);
});

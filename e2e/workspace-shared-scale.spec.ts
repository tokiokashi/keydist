import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceで、同じAnalyzerの同じ見る量のペインどうしは、グラフの目盛りの範囲を揃える。
 * 片方を閉じると、残ったペインは自分の範囲に戻る。見る量が違うペインどうしは揃わない。
 */

const layout = (layoutId: string) => ({ kind: 'layout', layoutId });
const fixed = (layoutId: string) => ({ mode: 'fixed', target: { kind: 'single', target: layout(layoutId) } });
const fingerDistance = (id: string, layoutId: string, chartMetric?: string) => ({
  id,
  analyzerId: 'finger-distance',
  binding: fixed(layoutId),
  ...(chartMetric === undefined ? {} : { options: { chartMetric } }),
});
const bigramFlow = (id: string, layoutId: string) => ({ id, analyzerId: 'bigram-flow', binding: fixed(layoutId) });

async function openWorkspace(page: Page, panes: readonly { readonly id: string }[]): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(
    (value) => {
      if (localStorage.getItem('keydist:workspaces') === null) {
        localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
      }
    },
    {
      id: 's',
      name: '目盛り',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.modern' } },
      panes,
      grid: panes.map((pane, i) => ({ id: pane.id, x: (i % 2) * 12, y: Math.floor(i / 2) * 20, w: 12, h: 20 })),
    },
  );
  await page.goto('/workspace/s');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(panes.length);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(panes.length, { timeout: 30_000 });
}

const pane = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

/** 棒のうち一番高いものの高さ（SVGの座標系の値。ペインの幅に依らない）。 */
async function tallestBar(item: Locator): Promise<number> {
  const heights = await item.locator('.finger-distance-chart-bar').evaluateAll((bars) => bars.map((bar) => Number(bar.getAttribute('height'))));
  return Math.max(...heights);
}

async function closePane(page: Page, id: string): Promise<void> {
  await pane(page, id)
    .locator('.pane-frame-menu')
    .getByRole('button', { name: /の操作$/ })
    .click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(pane(page, id)).toHaveCount(0);
}

test('指ごとの距離は、同じ見る量のペインで縦軸を揃え、値の小さい方の棒は低くなる。片方を閉じると残りは自分の範囲に戻る', async ({ page }) => {
  await openWorkspace(page, [fingerDistance('a', 'qwerty'), fingerDistance('b', 'dvorak')]);
  await expect.poll(async () => (await tallestBar(pane(page, 'a'))) !== (await tallestBar(pane(page, 'b')))).toBe(true);
  const a = await tallestBar(pane(page, 'a'));
  const b = await tallestBar(pane(page, 'b'));
  const [largerId, smallerId] = a > b ? ['a', 'b'] : ['b', 'a'];
  const larger = Math.max(a, b);

  await closePane(page, largerId);
  // 残った方は自分の最大が縦軸いっぱいになる（揃えている間の、大きい方の棒と同じ高さ）
  await expect.poll(() => tallestBar(pane(page, smallerId))).toBeCloseTo(larger, 5);
});

test('指ごとの距離は、見る量が違うペインどうしでは縦軸を揃えない', async ({ page }) => {
  await openWorkspace(page, [fingerDistance('a', 'qwerty', 'distance'), fingerDistance('b', 'dvorak', 'presses')]);
  const a = await tallestBar(pane(page, 'a'));
  const b = await tallestBar(pane(page, 'b'));
  expect(a).toBeCloseTo(b, 5);
});

test('Bigram FlowのRelative vectorsは、並んだペインで最大の半径を揃える。片方を閉じると残りは自分の最大に戻る', async ({ page }) => {
  // 単独で開くと、最長のベクトルはQWERTYが5u、Dvorakが4u（同じテキスト・既定の条件）
  await openWorkspace(page, [bigramFlow('a', 'qwerty'), bigramFlow('b', 'dvorak')]);
  const summary = (id: string) => pane(page, id).locator('.flow-profile-scale-summary').first();
  await expect(summary('a')).toContainText('最大5u');
  await expect(summary('b')).toContainText('最大5u');
  await closePane(page, 'a');
  await expect(summary('b')).toContainText('最大4u');
});

const playback = (id: string, layoutId: string, options?: Record<string, number>) => ({
  id,
  analyzerId: 'playback',
  binding: fixed(layoutId),
  ...(options === undefined ? {} : { options }),
});
const sensitivity = (id: string, layoutId: string, options: Record<string, string>) => ({
  id,
  analyzerId: 'n-sensitivity',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [layout(layoutId)] } } },
  options,
});

/** 打鍵再生の速度の推移の縦軸の目盛りの文字。 */
async function rateTicks(item: Locator): Promise<string[]> {
  return item.locator('.playback-rate-chart .playback-rate-tick').allTextContents();
}

/** N感度の縦軸の目盛りの文字（横軸のNは含めない）。 */
async function sensitivityTicks(item: Locator): Promise<string[]> {
  const labels = await item.locator('.n-sensitivity-svg .n-sensitivity-axis-label').allTextContents();
  return labels.filter((label) => / u$|%$/.test(label));
}

test('打鍵再生の速度の推移は、並んだペインで縦軸を揃える。片方を閉じると残りは自分の範囲に戻る', async ({ page }) => {
  await openWorkspace(page, [playback('a', 'qwerty'), playback('b', 'qwerty', { speedMultiplier: 5 })]);
  await expect(pane(page, 'a').locator('.playback-rate-chart')).toBeVisible();
  await expect(pane(page, 'b').locator('.playback-rate-chart')).toBeVisible();
  await expect.poll(async () => (await rateTicks(pane(page, 'a'))).join()).toBe((await rateTicks(pane(page, 'b'))).join());
  const shared = await rateTicks(pane(page, 'a'));
  // 再生倍率の違いで速さが変わる2枚なので、揃えた縦軸は片方の単独の縦軸と違う
  await closePane(page, 'b');
  await expect.poll(async () => (await rateTicks(pane(page, 'a'))).join()).not.toBe(shared.join());
});

test('N感度は、縦軸の見せ方と範囲の決め方が同じペインで縦軸を揃え、違うペインでは揃えない', async ({ page }) => {
  const fit = { scale: 'absolute', yRange: 'fit' };
  await openWorkspace(page, [
    sensitivity('a', 'qwerty', fit),
    sensitivity('b', 'dvorak', fit),
    sensitivity('c', 'dvorak', { scale: 'absolute', yRange: 'full' }),
  ]);
  const same = async () => (await sensitivityTicks(pane(page, 'a'))).join() === (await sensitivityTicks(pane(page, 'b'))).join();
  await expect.poll(same).toBe(true);
  const shared = await sensitivityTicks(pane(page, 'b'));
  // 決め方が違うペインは別の組なので、揃った縦軸にならない
  expect((await sensitivityTicks(pane(page, 'c'))).join()).not.toBe(shared.join());
  await closePane(page, 'a');
  await expect.poll(async () => (await sensitivityTicks(pane(page, 'b'))).join()).not.toBe(shared.join());
});

test('Bigram Flowの単体のペインは、自分の最長のベクトルまでで描く', async ({ page }) => {
  await openWorkspace(page, [bigramFlow('b', 'dvorak')]);
  await expect(pane(page, 'b').locator('.flow-profile-scale-summary').first()).toContainText('最大4u');
});

import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceの板の高さ（#833）。板は「画面の高さ」と「保存した高さ」の大きい方で、配置の形が変わって
 * ペインが下限を割る時にだけ伸びる。サッシのドラッグ（比の変化）では板を動かさない。縦積み（スマホ幅）では使わない。
 */

const REM = 16;
/** ペインの下限 = 見出し・余白 + 本体の下限。本体の下限は各Analyzerのpane-meta、見出し・余白は`board-policy.ts`。 */
const CHROME_REM = 9.9 + 2.6;
const FLOOR_BODY_REM = { 'bigram-flow': 26, 'n-sensitivity': 13.6, comparison: 12 } as const;
const floorOf = (id: keyof typeof FLOOR_BODY_REM) => CHROME_REM + FLOOR_BODY_REM[id];

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const fixedSingle = { mode: 'fixed', target: { kind: 'single', target: QWERTY } };
const fixedSet = { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }], colorSlots: [0, 1] } } };
const flow = (id: string) => ({ id, analyzerId: 'bigram-flow', binding: fixedSingle });
const nSens = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: fixedSet });
const comparison = (id: string) => ({ id, analyzerId: 'comparison', binding: fixedSet });
const group = (id: string, weight = 1) => ({ kind: 'group', paneIds: [id], weight });
const column = (...children: unknown[]) => ({ kind: 'split', direction: 'column', weight: 1, children });

/** 保存先へWorkspaceを直接書いて開く（初回だけ書く。再読み込みでは保存した値を残す）。 */
async function openWorkspace(
  page: Page,
  panes: readonly unknown[],
  layout: unknown,
  size: { width: number; height: number },
  extra: Record<string, unknown> = {},
  waitForDock = true,
) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'board', name: '板の高さ', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout, ...extra });
  await page.goto('/workspace/board');
  await waitForHydration(page);
  if (!waitForDock) return;
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

interface Geometry {
  readonly docHeight: number;
  readonly viewHeight: number;
  readonly area: number;
  /** 各ペインの枠の高さと、本体の領域の高さ（画素）。上から下の順。 */
  readonly groups: readonly { readonly top: number; readonly height: number; readonly body: number; readonly analyzer: string }[];
}

function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => ({
    docHeight: document.documentElement.scrollHeight,
    viewHeight: window.innerHeight,
    area: document.querySelector('.workspace-dock-area')!.getBoundingClientRect().height,
    groups: [...document.querySelectorAll('.dv-groupview')]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const feature = el.querySelector('[data-react-feature]');
        return {
          top: rect.top + window.scrollY,
          height: rect.height,
          body: el.querySelector('.pane-body')?.getBoundingClientRect().height ?? 0,
          analyzer: feature?.getAttribute('data-react-feature') ?? '',
        };
      })
      .sort((a, b) => a.top - b.top),
  }));
}

async function storedBoardHeight(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('keydist:workspaces') ?? '{}') as { workspaces?: { boardHeightRem?: number }[] };
    return stored.workspaces?.[0]?.boardHeightRem;
  });
}

async function duplicatePane(page: Page, analyzer: string) {
  const pane = page.locator('.workspace-pane').filter({ has: page.locator(`[data-react-feature="${analyzer}"]`) }).first();
  await pane.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /複製/ }).click();
}

test('既定（ペインが少ない）では板は1画面で、ページはスクロールしない。保存も無い', async ({ page }) => {
  await openWorkspace(page, [flow('f'), comparison('c')], { kind: 'split', direction: 'row', weight: 1, children: [group('f'), group('c')] }, { width: 1440, height: 900 });
  const m = await measure(page);
  expect(m.docHeight).toBe(m.viewHeight);
  // 板は画面の下端までを使う
  expect(m.groups[0]!.top + m.groups[0]!.height).toBeGreaterThan(m.viewHeight - 24);
  expect(await storedBoardHeight(page)).toBeUndefined();
});

test('ペインを足して下限を割ると板が伸び、ページが縦にスクロールする。再読み込みでも残る', async ({ page }) => {
  // 縦に3段（等分）。1440×900では各段が下限を大きく割る形
  await openWorkspace(page, [flow('f'), nSens('n'), comparison('c')], column(group('f'), group('n'), group('c')), { width: 1440, height: 900 });
  expect((await measure(page)).docHeight).toBe(900);

  // 比較表を複製すると、縦3段の1段が横に2つに分かれる（形が変わる）
  await duplicatePane(page, 'comparison');
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0).toBeGreaterThan(900 / REM);
  const stored = (await storedBoardHeight(page))!;
  await expect.poll(async () => (await measure(page)).docHeight).toBeGreaterThan(900);
  let m = await measure(page);
  expect(m.area).toBeGreaterThan(900 - 120);
  expect(m.area / REM).toBeGreaterThanOrEqual(stored - 0.05);
  // 縦に並んだ3つの段（上から flow・N感度・比較表×2）は、どれも本体が下限を割らない
  const stack = m.groups;
  for (const g of stack) {
    const floorBody = FLOOR_BODY_REM[g.analyzer as keyof typeof FLOOR_BODY_REM] ?? 12;
    expect(g.body, `${g.analyzer} の本体`).toBeGreaterThanOrEqual(floorBody * REM - 2);
  }

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await measure(page)).docHeight).toBeGreaterThan(900);
  expect(await storedBoardHeight(page)).toBe(stored);
  m = await measure(page);
  expect(Math.abs(m.area / REM - stored)).toBeLessThan(0.1);
});

test('足した時の高さの配分は、各Analyzerの下限に比例する（等分にしない）', async ({ page }) => {
  await openWorkspace(page, [flow('f'), nSens('n'), comparison('c')], column(group('f'), group('n'), group('c')), { width: 1440, height: 900 });
  await duplicatePane(page, 'comparison');
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0).toBeGreaterThan(900 / REM);
  await page.waitForTimeout(500);
  const m = await measure(page);
  const tops = [...new Set(m.groups.map((g) => Math.round(g.top)))];
  expect(tops).toHaveLength(3);
  const heightAt = (top: number) => m.groups.find((g) => Math.round(g.top) === top)!.height;
  const [hFlow, hN, hCmp] = tops.map(heightAt) as [number, number, number];
  // 下限（見出し・余白を含む）の比。縦の分割の余白は子の高さの和に入らないので、比は枠の高さでそのまま見られる
  expect(hFlow / hN).toBeCloseTo(floorOf('bigram-flow') / floorOf('n-sensitivity'), 1);
  expect(hN / hCmp).toBeCloseTo(floorOf('n-sensitivity') / floorOf('comparison'), 1);
  expect(Math.abs(hFlow - hN)).toBeGreaterThan(100);
});

test('サッシで狭めると隣が広がり、板の高さは変わらない', async ({ page }) => {
  // すでに伸びている板（保存済み）に、上から2段目と3段目の境のサッシを動かす
  await openWorkspace(page, [flow('f'), nSens('n'), comparison('c')], column(group('f', 3), group('n', 2), group('c', 2)), { width: 1440, height: 900 }, { boardHeightRem: 100 });
  const before = await measure(page);
  expect(before.area / REM).toBeGreaterThan(99);
  const sash = page.locator('.dv-sash').nth(1);
  await sash.scrollIntoViewIfNeeded();
  const box = (await sash.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 150, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await measure(page)).groups[1]!.height).toBeLessThan(before.groups[1]!.height - 100);
  const after = await measure(page);
  // 狭めた分は隣（下）が取り、板の高さも保存値も動かない
  expect(after.groups[2]!.height).toBeGreaterThan(before.groups[2]!.height + 100);
  expect(Math.abs(after.area - before.area)).toBeLessThan(1);
  await page.waitForTimeout(600);
  expect(await storedBoardHeight(page)).toBe(100);
  // 再読み込みしても板の高さは同じ
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  expect(Math.abs((await measure(page)).area - before.area)).toBeLessThan(1);
});

test('ペインは下限より狭められ、狭めても板は伸びない', async ({ page }) => {
  await openWorkspace(page, [flow('f'), comparison('c')], column(group('f'), group('c')), { width: 1440, height: 900 }, { boardHeightRem: 80 });
  const before = await measure(page);
  const box = (await page.locator('.dv-sash').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 2000, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await measure(page)).groups[0]!.height).toBeLessThan(floorOf('bigram-flow') * REM - 100);
  const after = await measure(page);
  expect(after.groups[0]!.height).toBeGreaterThanOrEqual(90);
  expect(Math.abs(after.area - before.area)).toBeLessThan(1);
  await page.waitForTimeout(600);
  expect(await storedBoardHeight(page)).toBe(80);
});

test('Analyzerを追加しても、下限を割らなければ板は動かない', async ({ page }) => {
  await openWorkspace(page, [flow('f')], group('f'), { width: 1440, height: 900 });
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /比較表/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  const m = await measure(page);
  expect(m.docHeight).toBe(m.viewHeight);
});

test('Analyzerを追加して下限を割る形になると、板が伸びて保存される', async ({ page }) => {
  // 縦に3段（等分）の右に1つ足す。3段は等分のままなので、各段が下限を満たす高さまで板が伸びる
  await openWorkspace(page, [flow('f'), nSens('n'), comparison('c')], column(group('f'), group('n'), group('c')), { width: 1440, height: 900 });
  expect(await storedBoardHeight(page)).toBeUndefined();
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /比較表/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(4);
  // 3段 × 一番高い下限（Bigram Flow）+ 段の間の余白 + 外周の余白
  const expected = 3 * floorOf('bigram-flow') + 2 * 0.5 + 1.5;
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0).toBeGreaterThanOrEqual(expected - 0.1);
  const m = await measure(page);
  expect(m.docHeight).toBeGreaterThan(900);
  for (const g of m.groups.filter((g) => g.analyzer === 'bigram-flow')) expect(g.body).toBeGreaterThanOrEqual(26 * REM - 2);
});

test('縦積みの幅（760px以下）では板の高さを使わない', async ({ page }) => {
  await openWorkspace(page, [flow('f'), comparison('c')], column(group('f'), group('c')), { width: 700, height: 900 }, { boardHeightRem: 300 }, false);
  await expect(page.locator('.workspace-stack')).toBeVisible();
  await expect(page.locator('.workspace-dock-area')).toHaveCount(0);
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(docHeight).toBeLessThan(300 * REM);
});

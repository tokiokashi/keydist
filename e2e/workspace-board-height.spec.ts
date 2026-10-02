import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { BOARD_PADDING_REM, PANE_GAP_REM } from '../src/hosts/workspace/board-spacing.ts';

/**
 * Workspaceの板の高さ（#833）。板は「画面の高さ」と「保存した高さ」の大きい方で、配置の形が変わって
 * ペインが下限を割る時にだけ伸びる。サッシのドラッグ（比の変化）では板を動かさない。縦積み（スマホ幅）では使わない。
 */

const REM = 16;
/** ペインの下限 = 見出し・余白 + 本体の下限。本体の下限は各Analyzerのpane-meta、見出し・余白は`board-policy.ts`。 */
const CHROME_REM = 4.2 + 2.6;
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

/** 縦に並べた段の、どれも下限を割らない板の高さ [rem]（保存値の種に使う。`workspace-board.ts`の計算と同じ）。 */
function requiredRem(floors: readonly number[], weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const need = Math.max(...floors.map((floor, i) => floor / (weights[i]! / total))) + PANE_GAP_REM * (floors.length - 1) + BOARD_PADDING_REM;
  return Math.ceil(need * 100) / 100;
}

/** 保存された配置のルート（縦の分割）の、子の割合。Dockviewが書いた比を、書き込みの後に読むために使う。 */
async function storedColumnFractions(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('keydist:workspaces') ?? '{}') as { workspaces?: { layout?: { children?: { weight: number }[] } }[] };
    const children = stored.workspaces?.[0]?.layout?.children ?? [];
    const total = children.reduce((sum, child) => sum + child.weight, 0);
    return children.map((child) => child.weight / total);
  });
}

/** `index`番目のサッシを`dy`だけ動かす（画面に入れてから、画面の中で動かす）。 */
async function dragSash(page: Page, index: number, dy: number) {
  const sash = page.locator('.dv-sash').nth(index);
  await sash.scrollIntoViewIfNeeded();
  const box = (await sash.boundingBox())!;
  const y = box.y + box.height / 2;
  const target = Math.min(Math.max(y + dy, 4), page.viewportSize()!.height - 4);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, target, { steps: 10 });
  await page.mouse.up();
}

/** 書き込み（`LAYOUT_COMMIT_DELAY`の250ms）を越えて、保存された割合が`predicate`を満たすまで待つ。 */
async function waitForStoredFractions(page: Page, predicate: (fractions: number[]) => boolean) {
  await expect.poll(async () => predicate(await storedColumnFractions(page)), { timeout: 10_000 }).toBe(true);
}

const STACK_WEIGHTS = [3, 2, 2];
const STACK_FLOORS = [floorOf('bigram-flow'), floorOf('n-sensitivity'), floorOf('comparison')];
const STACK_BOARD_REM = requiredRem(STACK_FLOORS, STACK_WEIGHTS);
const STACK_PANES = [flow('f'), nSens('n'), comparison('c')];
const stackLayout = () => column(group('f', 3), group('n', 2), group('c', 2));

test('サッシで狭めると隣が広がり、板の高さも保存値も変わらない（人の比のまま保存される）', async ({ page }) => {
  // 保存値は必要高さちょうど（余裕を持たせると、板が伸びる経路を通らなくても通ってしまう）
  await openWorkspace(page, STACK_PANES, stackLayout(), { width: 1440, height: 900 }, { boardHeightRem: STACK_BOARD_REM });
  const before = await measure(page);
  expect(Math.abs(before.area / REM - STACK_BOARD_REM)).toBeLessThan(0.1);
  const seeded = await storedColumnFractions(page);

  // 上から2段目と3段目の境のサッシを上へ。N感度が狭まり、比較表（隣）が広がる
  await dragSash(page, 1, -150);
  await expect.poll(async () => (await measure(page)).groups[1]!.height).toBeLessThan(before.groups[1]!.height - 100);
  // Dockviewが資産へ書いた後（書き込みの間引きを越えた後）の配置が、人の比のまま
  await waitForStoredFractions(page, (f) => f[1]! < seeded[1]! - 0.03 && f[2]! > seeded[2]! + 0.03);
  const written = await storedColumnFractions(page);
  expect(Math.abs(written[0]! - seeded[0]!)).toBeLessThan(0.01);
  // 保存した配置は、下限に比例した比へ配り直されていない（形が変わらなければ他の比に触れない）
  expect(Math.abs(written[1]! / written[2]! - STACK_FLOORS[1]! / STACK_FLOORS[2]!)).toBeGreaterThan(0.1);

  const after = await measure(page);
  expect(after.groups[2]!.height).toBeGreaterThan(before.groups[2]!.height + 100);
  expect(Math.abs(after.area - before.area)).toBeLessThan(1);
  expect(await storedBoardHeight(page)).toBe(STACK_BOARD_REM);
  // 再読み込みしても板の高さと比は同じ
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.dv-groupview').first()).toBeVisible({ timeout: 15_000 });
  expect(Math.abs((await measure(page)).area - before.area)).toBeLessThan(1);
  expect(Math.abs((await storedColumnFractions(page))[1]! - written[1]!)).toBeLessThan(0.001);
});

test('ペインは下限より狭められ、狭めても板は伸びない', async ({ page }) => {
  const floors = [floorOf('bigram-flow'), floorOf('comparison')];
  const boardRem = requiredRem(floors, [1, 1]);
  await openWorkspace(page, [flow('f'), comparison('c')], column(group('f'), group('c')), { width: 1440, height: 900 }, { boardHeightRem: boardRem });
  const before = await measure(page);
  await dragSash(page, 0, -2000);
  await expect.poll(async () => (await measure(page)).groups[0]!.height).toBeLessThan(floorOf('bigram-flow') * REM - 100);
  await waitForStoredFractions(page, (f) => f[0]! < 0.2);
  const after = await measure(page);
  expect(after.groups[0]!.height).toBeGreaterThanOrEqual(90);
  expect(Math.abs(after.area - before.area)).toBeLessThan(1);
  expect(await storedBoardHeight(page)).toBe(boardRem);
});

test('サッシで狭めた後にAnalyzerを足しても、狭めたペインは板を伸ばす理由にならない', async ({ page }) => {
  await openWorkspace(page, STACK_PANES, stackLayout(), { width: 1440, height: 900 }, { boardHeightRem: STACK_BOARD_REM });
  const seeded = await storedColumnFractions(page);
  // N感度を最小近くまで狭める
  await dragSash(page, 1, -2000);
  await waitForStoredFractions(page, (f) => f[1]! < seeded[1]! / 2);
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /比較表/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(4);
  await page.waitForTimeout(800);
  expect(await storedBoardHeight(page)).toBe(STACK_BOARD_REM);
});

test('サッシで狭めた後に別のペインを閉じても、板は伸びず、残りの比は人が決めたまま', async ({ page }) => {
  await openWorkspace(page, STACK_PANES, stackLayout(), { width: 1440, height: 900 }, { boardHeightRem: STACK_BOARD_REM });
  const seeded = await storedColumnFractions(page);
  await dragSash(page, 1, -2000);
  await waitForStoredFractions(page, (f) => f[1]! < seeded[1]! / 2);
  const squeezed = await storedColumnFractions(page);
  // 一番下（比較表）を閉じる
  const pane = page.locator('.workspace-pane').filter({ has: page.locator('[data-react-feature="comparison"]') }).first();
  await pane.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  await page.waitForTimeout(800);
  expect(await storedBoardHeight(page)).toBe(STACK_BOARD_REM);
  // 残った2段の比は、狭めた比のまま（N感度 : Bigram Flow）
  const rest = await storedColumnFractions(page);
  expect(rest[1]! / rest[0]!).toBeCloseTo(squeezed[1]! / squeezed[0]!, 2);
});

test('Analyzerを追加しても、下限を割らなければ板は動かない', async ({ page }) => {
  await openWorkspace(page, [flow('f')], group('f'), { width: 1440, height: 900 });
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /比較表/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(2);
  const m = await measure(page);
  expect(m.docHeight).toBe(m.viewHeight);
});

test('Analyzerを追加すると、足したペインの下限まで保存される。既にある縦の分割は数えない', async ({ page }) => {
  // 縦に3段（等分、保存なし）の右に1つ足す。数えるのは足したペインだけで、3段の下限は数えない（人が決めた比として扱う）
  await openWorkspace(page, STACK_PANES, column(group('f'), group('n'), group('c')), { width: 1440, height: 900 });
  expect(await storedBoardHeight(page)).toBeUndefined();
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /比較表/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(4);
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0).toBeGreaterThan(0);
  expect(await storedBoardHeight(page)).toBe(Math.ceil((floorOf('comparison') + BOARD_PADDING_REM) * 100) / 100);
  expect((await measure(page)).docHeight).toBe(900);
});

/** `tab`のタブを、`target`のペインの枠の下端へドラッグする（枠の下に新しい段ができる）。 */
async function dragTabBelow(page: Page, tabAnalyzer: string, nth: number, targetAnalyzer: string) {
  const tab = page.locator('.dv-tab').filter({ hasText: tabAnalyzer }).nth(nth);
  const target = page.locator('.dv-groupview').filter({ has: page.locator(`[data-react-feature="${targetAnalyzer}"]`) });
  const box = (await target.boundingBox())!;
  await tab.dragTo(target, { targetPosition: { x: box.width / 2, y: box.height - 8 } });
}

test('根が縦の配置でペインを別の段へ移すと、下限を割る段の分だけ板が伸びる', async ({ page }) => {
  // 縦2段（上は比較表が横に2つ、下がBigram Flow）。比較表の1つをBigram Flowの下へ移すと、3段（1/3ずつ）になる形
  await openWorkspace(page, [comparison('c1'), comparison('c2'), flow('f')], column({ kind: 'split', direction: 'row', weight: 1, children: [group('c1'), group('c2')] }, group('f')), { width: 1440, height: 900 });
  expect(await storedBoardHeight(page)).toBeUndefined();
  await dragTabBelow(page, '比較表', 1, 'bigram-flow');
  // 3段の下限の和 + 段の間の余白 + 外周の余白
  const expected = Math.ceil((2 * floorOf('comparison') + floorOf('bigram-flow') + 2 * PANE_GAP_REM + BOARD_PADDING_REM) * 100) / 100;
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(expected - 0.05);
  expect(await storedBoardHeight(page)).toBeLessThanOrEqual(expected + 0.05);
  await expect.poll(async () => (await measure(page)).docHeight).toBeGreaterThan(900);
  const m = await measure(page);
  // 移した後の3段は、どれも本体が下限を割らない
  for (const g of m.groups) {
    const floorBody = FLOOR_BODY_REM[g.analyzer as keyof typeof FLOOR_BODY_REM] ?? 12;
    expect(g.body, `${g.analyzer} の本体`).toBeGreaterThanOrEqual(floorBody * REM - 2);
  }
});

test('増えた列の中に人が比を決めた列があっても、板が暴走せず、その列の下限の和で足りる', async ({ page }) => {
  // 左の列（N感度、比較表と「比較表3:1の列」の横並び）の下に、右のBigram Flowを移す。内側の3:1の列は人が決めた比
  const inner = { kind: 'split', direction: 'column', weight: 1, children: [group('c2', 0.75), group('c3', 0.25)] };
  const left = column(group('n'), { kind: 'split', direction: 'row', weight: 1, children: [group('c1'), inner] });
  await openWorkspace(
    page,
    [nSens('n'), comparison('c1'), comparison('c2'), comparison('c3'), flow('f')],
    { kind: 'split', direction: 'row', weight: 1, children: [left, group('f')] },
    { width: 1440, height: 900 },
  );
  await dragTabBelow(page, 'Bigram Flow', 0, 'n-sensitivity');
  // 内側の列は比（0.25）で割らず、下限の和（比較表2つ + 間）で数える。3段の下限の和 + 余白がちょうど
  const expected = Math.ceil((floorOf('n-sensitivity') + floorOf('bigram-flow') + 2 * floorOf('comparison') + 3 * PANE_GAP_REM + BOARD_PADDING_REM) * 100) / 100;
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0, { timeout: 10_000 }).toBeGreaterThan(900 / REM);
  await page.waitForTimeout(800);
  const stored = (await storedBoardHeight(page))!;
  expect(stored).toBeGreaterThanOrEqual(expected - 0.05);
  expect(stored).toBeLessThanOrEqual(expected + 0.05);
});

test('閉じて横の分割が畳まれ、人が狭めた比の列が親の列に合わさっても、板は伸びない', async ({ page }) => {
  // 比較表c1と「比較表3:1の列」の横並びの下にBigram Flow。c1を閉じると横の分割が畳まれ、根が (c2, c3, f) の列になる
  const inner = { kind: 'split', direction: 'column', weight: 1, children: [group('c2', 0.75), group('c3', 0.25)] };
  await openWorkspace(
    page,
    [comparison('c1'), comparison('c2'), comparison('c3'), flow('f')],
    column({ kind: 'split', direction: 'row', weight: 1, children: [group('c1'), inner] }, group('f')),
    { width: 1440, height: 900 },
    { boardHeightRem: 100 },
  );
  const pane = page.locator('.workspace-pane').filter({ has: page.locator('[data-react-feature="comparison"]') }).first();
  await pane.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
  await page.waitForTimeout(800);
  // 閉じても、どのペインの縦の割合も減らない。人が狭めた比で下限を割っていても伸ばす理由にならない（以前は198.5rem）
  expect(await storedBoardHeight(page)).toBe(100);
});

test('縦積みの幅（760px以下）では板の高さを使わない', async ({ page }) => {
  await openWorkspace(page, [flow('f'), comparison('c')], column(group('f'), group('c')), { width: 700, height: 900 }, { boardHeightRem: 300 }, false);
  await expect(page.locator('.workspace-stack')).toBeVisible();
  await expect(page.locator('.workspace-dock-area')).toHaveCount(0);
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(docHeight).toBeLessThan(300 * REM);
});

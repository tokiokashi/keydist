import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { settleBy } from './settle-helper.ts';

/**
 * 中身入りのサンプルのWorkspace。トップの「サンプルのWorkspaceを作る」は、比較表・N感度・Bigram Flowを並べた
 * Workspaceを新しく作って開く。空のWorkspaceの中の「サンプルの並びで始める」は、新しく作らず今のWorkspaceに同じ並びを入れる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const GLOBAL_KEYS = ['keydist:setup-library', 'keydist:single-target-selection', 'keydist:multi-target-selection'];

interface StoredWorkspace {
  readonly id: string;
  readonly name: string;
  readonly groups: readonly { id: string; target: { single?: { layoutId?: string }; set?: { targets: { layoutId: string }[] } } }[];
  readonly panes: readonly { id: string; analyzerId: string; options?: unknown; binding: { mode: string; group?: string } }[];
  readonly grid: readonly { id: string; x: number; y: number; w: number; h: number }[];
  readonly conditions?: Record<string, unknown>;
}

async function storedWorkspaces(page: Page): Promise<StoredWorkspace[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return (JSON.parse(raw ?? '{"workspaces":[]}') as { workspaces: StoredWorkspace[] }).workspaces;
}

async function globalSnapshot(page: Page): Promise<(string | null)[]> {
  return page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), GLOBAL_KEYS);
}

/** 作ったサンプルが、決めた並び・対象・連動・解析設定・Workspaceの条件になっていることを確かめる。 */
async function expectSampleWorkspace(page: Page, name: string): Promise<void> {
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expectSampleLayout(page, new URL(page.url()).pathname.split('/').pop()!);
}

/** 保存したWorkspaceが、サンプルの並び・対象・連動・解析設定・Workspaceの条件になっていることを確かめる。 */
async function expectSampleLayout(page: Page, id: string): Promise<void> {
  const workspace = (await storedWorkspaces(page)).find((candidate) => candidate.id === id)!;

  // 並び: 上の段は比較表とN感度、下の段はBigram Flow 4つ
  expect(workspace.panes.map((pane) => pane.analyzerId)).toEqual([
    'comparison', 'n-sensitivity', 'bigram-flow', 'bigram-flow', 'bigram-flow', 'bigram-flow',
  ]);
  // 連動: 比較表・N感度・1つ目のBigram Flowが連動1、残りが連動2〜4
  expect(workspace.panes.map((pane) => pane.binding)).toEqual([
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
  ]);
  // 対象
  expect(workspace.groups[0]!.target.set!.targets.map((target) => target.layoutId)).toEqual([
    'qwerty', 'dvorak', 'oonishi', 'naginata-v18', 'shin-jis-prefix', 'shingeta', 'tsuki-2-263',
  ]);
  expect(workspace.groups.map((group) => group.target.single?.layoutId)).toEqual(['qwerty', 'oonishi', 'tsuki-2-263', 'naginata-v18']);
  // 解析設定: Bigram Flowは2打鍵の取り方を Within-hand
  for (const pane of workspace.panes.filter((candidate) => candidate.analyzerId === 'bigram-flow')) {
    expect(pane.options).toEqual({ source: 'within-hand' });
  }
  // Workspaceの条件
  expect(workspace.conditions).toEqual({ defaultShapeId: 'split-ortholinear' });
  // 格子: 上の段は比較表とN感度が横に並んで24列を使い切り、下の段は同じ幅の4つが横に並ぶ
  const [comparison, nSensitivity, ...lower] = workspace.grid;
  expect([comparison!.x, comparison!.y]).toEqual([0, 0]);
  expect([nSensitivity!.x, nSensitivity!.y]).toEqual([comparison!.w, 0]);
  expect(comparison!.w + nSensitivity!.w).toBe(24);
  expect(nSensitivity!.h).toBe(comparison!.h);
  // 高さ（升目）: 上の段9・下の段15。1920x930で1画面に入る大きさ（下のe2eで実測）
  expect([comparison!.h, ...lower.map((item) => item.h)]).toEqual([9, 15, 15, 15, 15]);
  expect(lower.map((item) => [item.x, item.y, item.w])).toEqual([0, 6, 12, 18].map((x) => [x, comparison!.h, 6]));

  // 画面にも出る
  await expect(page.locator('.pane-frame')).toHaveCount(6);
  await expect(page.locator('.pane-frame').first().getByRole('heading', { level: 2, name: '比較表', exact: true })).toBeVisible();
}

test('トップの「サンプルのWorkspaceを作る」で、サンプルのWorkspaceができて開く。全体の条件は変わらない', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const before = await globalSnapshot(page);
  expect(await storedWorkspaces(page)).toHaveLength(0);

  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  expect(await globalSnapshot(page)).toEqual(before);
  // 普通のWorkspaceと同じく、サイドバーの一覧に出て、再読み込みしても残る
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('#app-sidebar').getByRole('link', { name: 'サンプル', exact: true })).toBeVisible();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

test('空のWorkspaceの「サンプルの並びで始める」で、今のWorkspaceにサンプルの並びが入る。一覧は増えず、元に戻すで空に戻る', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const url = page.url();
  const emptyId = new URL(url).pathname.split('/').pop()!;
  const before = await globalSnapshot(page);

  await page.locator('[data-workspace-empty="true"]').getByRole('button', { name: 'サンプルの並びで始める' }).click();
  // 同じ画面のまま、名前も変わらずに並びが入る
  await expect(page.locator('.pane-frame')).toHaveCount(6);
  expect(page.url()).toBe(url);
  await expectSampleLayout(page, emptyId);
  expect(await globalSnapshot(page)).toEqual(before);
  expect((await storedWorkspaces(page)).map((workspace) => workspace.name)).toEqual(['新しいWorkspace']);
  await expect(page.locator('#app-sidebar').getByRole('link', { name: /Workspace/ })).toHaveCount(1);

  // 元に戻す1回で空に戻る。やり直すで並びが戻る
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const emptied = (await storedWorkspaces(page))[0]!;
  expect(emptied.panes).toHaveLength(0);
  expect(emptied.conditions).toBeUndefined();
  expect(await globalSnapshot(page)).toEqual(before);
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

test('トップから2回作ると、名前は既存のWorkspaceと同じく連番になる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル 2');
});

test('サンプルのWorkspaceは普通のWorkspaceと同じに扱える。Bigram Flowの解析設定は Within-hand、ペインを閉じて元に戻せる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  const bigramFlow = page.locator('.pane-frame').nth(2);
  await bigramFlow.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  // 作った直後の画面の履歴は空（画面を移ると履歴は引き継がない）。以降の変更は元に戻せる
  const bar = page.locator('.context-bar');
  await expect(bar.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await bigramFlow.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(5);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(6);
});

/** サンプルを開き、全ペインの描画が済むまで待つ。 */
async function openSampleAt(page: Page, size: { width: number; height: number }, sidebar: 'pinned' | 'unpinned'): Promise<void> {
  await page.setViewportSize(size);
  if (sidebar === 'unpinned') {
    await page.addInitScript(() => localStorage.setItem('keydist:app-state', JSON.stringify({ shell: { sidebarPinned: false } })));
  }
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: 'サンプルのWorkspaceを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');
  await expect(page.locator('[data-flow-edge="true"]').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('[data-n-sensitivity-series]').first()).toBeAttached({ timeout: 15_000 });
  // 図の描画（N感度は領域の実寸に合わせて描き直す）が落ち着くまで待つ。
  // ペインの寸法と、N感度の図の大きさ・viewBox（実寸に合わせた描き直しの結果）が変わらなくなるのを見る
  await settleBy(page, () => page.evaluate(() => [
    ...[...document.querySelectorAll('.workspace-grid-item')].map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
    }),
    ...[...document.querySelectorAll('.n-sensitivity-svg')].map((svg) => `${Math.round(svg.getBoundingClientRect().width)}:${svg.getAttribute('viewBox')}`),
  ].join('|')), 8);
}

/**
 * オーナーの1080のモニタで普通の窓に開いた時の表示領域（約930px）。
 * 全画面表示の1080pxで測ると、普通の窓では下の段が切れる。
 */
const VIEWPORT_1080_MONITOR = { width: 1920, height: 930 };

for (const sidebar of ['pinned', 'unpinned'] as const) {
  test(`1920x930（サイドバー${sidebar === 'pinned' ? '固定' : '非固定'}）で、サンプルのWorkspace全体が1画面に入り、どのペインも中でスクロールしない`, async ({ page }) => {
    await openSampleAt(page, { width: VIEWPORT_1080_MONITOR.width, height: VIEWPORT_1080_MONITOR.height }, sidebar);
    const m = await page.evaluate(() => ({
      page: [document.documentElement.scrollHeight, document.documentElement.clientHeight],
      panes: [...document.querySelectorAll('.workspace-grid-item .pane-body')].map((body) => [body.scrollHeight, body.clientHeight]),
    }));
    // ページが縦にスクロールしない
    expect(m.page[0]).toBeLessThanOrEqual(m.page[1]!);
    // 各ペインの中身が、ペインの中でスクロールせずに収まる（N感度は図・凡例・横軸・畳んだ表の見出しまで）
    expect(m.panes).toHaveLength(6);
    for (const [scrollHeight, clientHeight] of m.panes) expect(scrollHeight).toBeLessThanOrEqual(clientHeight! + 1);
  });
}

/**
 * 1440x900のサイドバー固定では、N感度が本体の中でスクロールする（297/210）。実測では、N感度のペインの見出しが折り返して
 * 32px から 72px になり、本体が 250px から 210px に下がる。図（svgのviewBoxは 0 0 264 272）は本体より高く、svgの下端は本体から62px出る。
 * 9升は1080のモニタの普通の窓（1920x930）に1画面で入ることを優先した大きさで、1440幅は実際の利用環境ではなく想定の条件。
 * そのため比較表とBigram Flow 4つは中でスクロールしないことを見て、N感度は図が左・右・上で本体から切れないことだけを見る。
 */
test('1440x900（サイドバー固定）では、比較表とBigram Flowは中でスクロールしない。N感度の図は横に切れない', async ({ page }) => {
  await openSampleAt(page, { width: 1440, height: 900 }, 'pinned');
  const m = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll('.workspace-grid-item .pane-body')];
    const nSensitivity = document.querySelector('.n-sensitivity-chart')!.closest('.pane-body')!;
    const body = nSensitivity.getBoundingClientRect();
    const svg = nSensitivity.querySelector('svg')!.getBoundingClientRect();
    return {
      panes: bodies.map((el) => [el.scrollHeight, el.clientHeight, el === nSensitivity]),
      svg: { left: svg.left - body.left, right: body.right - svg.right, top: svg.top - body.top },
    };
  });
  expect(m.panes).toHaveLength(6);
  for (const [scrollHeight, clientHeight, isNSensitivity] of m.panes) {
    if (!isNSensitivity) expect(scrollHeight).toBeLessThanOrEqual((clientHeight as number) + 1);
  }
  expect(m.svg.left).toBeGreaterThanOrEqual(-1);
  expect(m.svg.right).toBeGreaterThanOrEqual(-1);
  expect(m.svg.top).toBeGreaterThanOrEqual(-1);
});

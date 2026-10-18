import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { settleBy } from './settle-helper.ts';

/**
 * 中身入りのサンプルのWorkspace。トップの「複数の配列を並べたサンプルを作る」は、比較表・N感度・Bigram Flow・指ごとの距離を並べた
 * Workspaceを新しく作って開く。空のWorkspaceの中の「複数の配列を並べたサンプルで始める」は、新しく作らず今のWorkspaceに同じ並びを入れる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const GLOBAL_KEYS = ['keydist:setup-library', 'keydist:single-target-selection', 'keydist:multi-target-selection'];

interface StoredWorkspace {
  readonly id: string;
  readonly name: string;
  readonly groups: readonly { id: string; target: { single?: { layoutId?: string }; set?: { targets: { layoutId: string }[] } } }[];
  readonly optionSets: readonly { id: string; analyzerId: string; options?: unknown }[];
  readonly panes: readonly {
    id: string;
    analyzerId: string;
    options?: unknown;
    optionsBinding: { mode: string; set?: string };
    binding: { mode: string; group?: string };
  }[];
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

  // 並び: 上の段は比較表とN感度、中の段はBigram Flow 4つ、下の段は指ごとの距離4つ
  expect(workspace.panes.map((pane) => pane.analyzerId)).toEqual([
    'comparison',
    'n-sensitivity',
    'bigram-flow',
    'bigram-flow',
    'bigram-flow',
    'bigram-flow',
    'finger-distance',
    'finger-distance',
    'finger-distance',
    'finger-distance',
  ]);
  // 連動: 比較表・N感度・1つ目のBigram Flow・1つ目の指ごとの距離が連動1、残りが連動2〜4
  expect(workspace.panes.map((pane) => pane.binding)).toEqual([
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
  ]);
  // 対象
  expect(workspace.groups[0]!.target.set!.targets.map((target) => target.layoutId)).toEqual([
    'qwerty',
    'dvorak',
    'oonishi',
    'naginata-v18',
    'shin-jis-prefix',
    'shingeta',
    'tsuki-2-263',
  ]);
  expect(workspace.groups.map((group) => group.target.single?.layoutId)).toEqual(['qwerty', 'oonishi', 'tsuki-2-263', 'naginata-v18']);
  // 解析設定: Bigram Flowの4つは、2打鍵の取り方がWithin-handの共有の設定に従う。指ごとの距離の4つも1つの共有の設定に従う
  expect(workspace.optionSets).toEqual([
    { id: 'bigram-flow-1', analyzerId: 'bigram-flow', options: { source: 'within-hand' } },
    { id: 'finger-distance-1', analyzerId: 'finger-distance' },
  ]);
  for (const pane of workspace.panes.filter((candidate) => ['bigram-flow', 'finger-distance'].includes(candidate.analyzerId))) {
    expect(pane.optionsBinding).toEqual({ mode: 'shared', set: `${pane.analyzerId}-1` });
    expect(pane.options).toBeUndefined();
  }
  // Workspaceの条件
  expect(workspace.conditions).toEqual({ defaultShapeId: 'ortholinear' });
  // 格子: 上の段は比較表とN感度が横に並んで24列を使い切り、中の段・下の段は同じ幅の4つが横に並ぶ
  const [comparison, nSensitivity, ...lower] = workspace.grid;
  expect([comparison!.x, comparison!.y]).toEqual([0, 0]);
  expect([nSensitivity!.x, nSensitivity!.y]).toEqual([comparison!.w, 0]);
  expect(comparison!.w + nSensitivity!.w).toBe(24);
  expect(nSensitivity!.h).toBe(comparison!.h);
  // 高さ（升目）: 上の段9・中の段14・下の段9。どれも各ペインが中でスクロールしない最小の高さ（下のe2eで確かめる）
  expect([comparison!.h, ...lower.map((item) => item.h)]).toEqual([9, 14, 14, 14, 14, 10, 10, 10, 10]);
  expect(lower.map((item) => [item.x, item.y, item.w])).toEqual([
    ...[0, 6, 12, 18].map((x) => [x, comparison!.h, 6]),
    ...[0, 6, 12, 18].map((x) => [x, comparison!.h + 14, 6]),
  ]);

  // 画面にも出る
  await expect(page.locator('.pane-frame')).toHaveCount(10);
  await expect(page.locator('.pane-frame').first().getByRole('heading', { level: 2, name: '比較表', exact: true })).toBeVisible();
}

test('トップの「複数の配列を並べたサンプルを作る」で、サンプルのWorkspaceができて開く。全体の条件は変わらない', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const before = await globalSnapshot(page);
  expect(await storedWorkspaces(page)).toHaveLength(0);

  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  expect(await globalSnapshot(page)).toEqual(before);
  // 普通のWorkspaceと同じく、サイドバーの一覧に出て、再読み込みしても残る
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('#app-sidebar').getByRole('link', { name: 'サンプル', exact: true })).toBeVisible();
  await expect(page.locator('.pane-frame')).toHaveCount(10);
});

test('空のWorkspaceの「複数の配列を並べたサンプルで始める」で、今のWorkspaceにサンプルの並びが入る。一覧は増えず、元に戻すで空に戻る', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page.locator('[data-workspace-empty="true"]')).toBeVisible();
  const url = page.url();
  const emptyId = new URL(url).pathname.split('/').pop()!;
  const before = await globalSnapshot(page);

  await page.locator('[data-workspace-empty="true"]').getByRole('button', { name: '複数の配列を並べたサンプルで始める' }).click();
  // 同じ画面のまま、名前も変わらずに並びが入る
  await expect(page.locator('.pane-frame')).toHaveCount(10);
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
  await expect(page.locator('.pane-frame')).toHaveCount(10);
});

test('トップから2回作ると、名前は既存のWorkspaceと同じく連番になる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル 2');
});

test('サンプルのWorkspaceは普通のWorkspaceと同じに扱える。Bigram Flowの解析設定は Within-hand、ペインを閉じて元に戻せる', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');

  const bigramFlow = page.locator('.pane-frame').nth(2);
  await bigramFlow.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('radio', { name: '共有に従う' })).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  // 作成は履歴を持たないトップからの書き込みなので、作った直後の画面の履歴は空。以降の変更は元に戻せる
  const bar = page.locator('.context-bar');
  await expect(bar.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await bigramFlow.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(9);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(10);
});

/** サンプルを開き、全ペインの描画が済むまで待つ。 */
async function openSampleAt(page: Page, size: { width: number; height: number }, sidebar: 'pinned' | 'unpinned'): Promise<void> {
  await page.setViewportSize(size);
  if (sidebar === 'unpinned') {
    await page.addInitScript(() => localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, shell: { sidebarPinned: false } })));
  }
  await page.goto('/');
  await waitForHydration(page);
  // 保存した状態が読まれず、名前と違う条件のまま回っていないことを確かめる
  if (sidebar === 'unpinned') await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  else await expect(page.locator('html')).not.toHaveAttribute('data-sidebar', 'unpinned');
  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expectSampleWorkspace(page, 'サンプル');
  await expect(page.locator('[data-flow-edge="true"]').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('[data-n-sensitivity-series]').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.workspace-grid-item .pane-frame[data-pane-status="ready"]')).toHaveCount(10, { timeout: 30_000 });
  // 図の描画（N感度は領域の実寸に合わせて描き直す）が落ち着くまで待つ。
  // ペインの寸法と、N感度の図の大きさ・viewBox（実寸に合わせた描き直しの結果）が変わらなくなるのを見る
  await settleBy(
    page,
    () =>
      page.evaluate(() =>
        [
          ...[...document.querySelectorAll('.workspace-grid-item')].map((el) => {
            const r = el.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
          }),
          ...[...document.querySelectorAll('.n-sensitivity-svg')].map(
            (svg) => `${Math.round(svg.getBoundingClientRect().width)}:${svg.getAttribute('viewBox')}`,
          ),
        ].join('|'),
      ),
    8,
  );
}

/**
 * オーナーの1080のモニタで普通の窓に開いた時の表示領域（約930px）。
 * 全画面表示の1080pxで測ると、普通の窓では下の段が切れる。
 */
const VIEWPORT_1080_MONITOR = { width: 1920, height: 930 };

for (const sidebar of ['pinned', 'unpinned'] as const) {
  test(`1920x930（サイドバー${sidebar === 'pinned' ? '固定' : '非固定'}）で、サンプルの上の2段が1画面に入り、どのペインも中でスクロールしない。横にもスクロールしない`, async ({
    page,
  }) => {
    await openSampleAt(page, { width: VIEWPORT_1080_MONITOR.width, height: VIEWPORT_1080_MONITOR.height }, sidebar);
    const m = await page.evaluate(() => ({
      viewport: document.documentElement.clientHeight,
      items: [...document.querySelectorAll('.workspace-grid-item')].map((item) => item.getBoundingClientRect().bottom),
      panes: [...document.querySelectorAll('.workspace-grid-item .pane-body')].map((body) => [body.scrollHeight, body.clientHeight]),
      area: (() => {
        const area = document.querySelector('.workspace-grid-area')!;
        return [area.scrollWidth, area.clientWidth];
      })(),
    }));
    // 比較表・N感度・Bigram Flow 4つは、ページを縦にスクロールせずに全部見える。指ごとの距離の段は、その下
    expect(m.items).toHaveLength(10);
    for (const bottom of m.items.slice(0, 6)) expect(bottom).toBeLessThanOrEqual(m.viewport);
    // 各ペインの中身が、ペインの中でスクロールせずに収まる（N感度は図・凡例・横軸・畳んだ表の見出しまで。
    // 指ごとの距離は見出し・縦棒・指の名前・左手と右手の見出しまで）
    expect(m.panes).toHaveLength(10);
    for (const [scrollHeight, clientHeight] of m.panes) expect(scrollHeight).toBeLessThanOrEqual(clientHeight! + 1);
    // 24列の並びが面に収まり、横にスクロールしない
    expect(m.area[0]).toBeLessThanOrEqual(m.area[1]! + 1);
  });
}

/**
 * 1440x900（サイドバー固定）の面は1200pxで、24列の並び（1640px）は収まらないので、面の中で横にスクロールする。
 * ペインの幅は面の幅に依らないので、各ペインの中身は1920pxの面と同じに収まる（どのペインも中でスクロールしない）。
 * 右端のペインを見るには面を横にスクロールする。
 */
test('1440x900（サイドバー固定）では、並びは面の中で横にスクロールし、どのペインも中でスクロールしない', async ({ page }) => {
  await openSampleAt(page, { width: 1440, height: 900 }, 'pinned');
  const m = await page.evaluate(() => {
    const area = document.querySelector('.workspace-grid-area')!;
    return {
      area: [area.scrollWidth, area.clientWidth],
      panes: [...document.querySelectorAll('.workspace-grid-item .pane-body')].map((el) => [el.scrollHeight, el.clientHeight]),
    };
  });
  expect(m.area[0]).toBeGreaterThan(m.area[1]!);
  expect(m.panes).toHaveLength(10);
  for (const [scrollHeight, clientHeight] of m.panes) expect(scrollHeight).toBeLessThanOrEqual(clientHeight! + 1);
});

const LAYOUT_DETAIL_BUTTON = '配列の詳細と比較のサンプルを作る';
const LAYOUT_DETAIL_ANALYZERS = [
  'heatmap',
  'heatmap-layers',
  'playback',
  'bigram-flow',
  'comparison',
  'finger-distance',
  'finger-distance',
  'n-sensitivity',
  'finger-matrix',
  'finger-matrix',
  'finger-matrix',
  'finger-matrix',
];

test('トップの「配列の詳細と比較のサンプルを作る」で、12個のペインを持つWorkspaceができて開く。決めた位置に並ぶ', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: LAYOUT_DETAIL_BUTTON }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name: '配列の詳細と比較', exact: true })).toBeVisible();
  await expect(page.locator('.pane-frame')).toHaveCount(12);
  const workspace = (await storedWorkspaces(page))[0]!;
  expect(workspace.panes.map((pane) => pane.analyzerId)).toEqual(LAYOUT_DETAIL_ANALYZERS);
  // 全部が同じ連動の組に従う
  expect(new Set(workspace.panes.map((pane) => pane.binding.group))).toEqual(new Set(['link-1']));
  // ペインを詰める設定で、決めた位置（x, y, w, h）に並ぶ
  expect((workspace as { compactPanes?: boolean }).compactPanes).toBe(true);
  expect(workspace.grid.map(({ x, y, w, h }) => [x, y, w, h])).toEqual([
    [0, 0, 8, 10],
    [8, 0, 8, 10],
    [0, 10, 8, 21],
    [8, 10, 8, 21],
    [0, 31, 18, 9],
    [0, 40, 8, 23],
    [8, 40, 8, 12],
    [8, 52, 8, 11],
    [0, 63, 12, 10],
    [0, 73, 12, 10],
    [0, 83, 12, 10],
    [0, 93, 12, 10],
  ]);
});

test('空のWorkspaceの「配列の詳細と比較のサンプルで始める」で、今のWorkspaceに12個のペインが入る', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  const empty = page.locator('[data-workspace-empty="true"]');
  await expect(empty).toBeVisible();
  // 2つのボタンは文言で区別でき、それぞれの文言の部分一致で1つに当たる
  await expect(empty.getByRole('button', { name: /サンプルで始める$/ })).toHaveCount(2);
  await expect(empty.getByRole('button', { name: '配列の詳細と比較' })).toHaveCount(1);
  await expect(empty.getByRole('button', { name: '複数の配列を並べた' })).toHaveCount(1);
  await empty.getByRole('button', { name: '配列の詳細と比較のサンプルで始める' }).click();
  await expect(page.locator('.pane-frame')).toHaveCount(12);
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expect(empty).toBeVisible();
});

for (const size of [
  { width: 1920, height: 930 },
  { width: 1440, height: 900 },
]) {
  test(`配列の詳細と比較のサンプルは、${size.width}x${size.height}で、どのペインも中でスクロールしない`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await waitForHydration(page);
    await page.locator('.hero').getByRole('button', { name: LAYOUT_DETAIL_BUTTON }).click();
    await expect(page.locator('.pane-frame')).toHaveCount(12);
    await expect(page.locator('.workspace-grid-item .pane-frame[data-pane-status="ready"]')).toHaveCount(12, { timeout: 30_000 });
    await settleBy(
      page,
      () =>
        page.evaluate(() =>
          [
            ...[...document.querySelectorAll('.workspace-grid-item')].map((el) => {
              const r = el.getBoundingClientRect();
              return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
            }),
            ...[...document.querySelectorAll('.n-sensitivity-svg')].map(
              (svg) => `${Math.round(svg.getBoundingClientRect().width)}:${svg.getAttribute('viewBox')}`,
            ),
          ].join('|'),
        ),
      8,
    );
    const m = await page.evaluate(() => ({
      area: (() => {
        const area = document.querySelector('.workspace-grid-area')!;
        return [area.scrollWidth, area.clientWidth];
      })(),
      // 本体と、本体の中の要素（表の包みなど）の縦横のスクロール
      panes: [...document.querySelectorAll('.workspace-grid-item .pane-body')].map((body) => {
        const inner = [...body.querySelectorAll('*')].filter((el) => {
          const style = getComputedStyle(el);
          return (
            (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
            (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1)
          );
        }).length;
        return [body.scrollHeight, body.clientHeight, body.scrollWidth, body.clientWidth, inner];
      }),
    }));
    expect(m.panes).toHaveLength(12);
    m.panes.forEach(([scrollHeight, clientHeight, scrollWidth, clientWidth, inner], i) => {
      expect(scrollHeight, `${LAYOUT_DETAIL_ANALYZERS[i]}の縦`).toBeLessThanOrEqual(clientHeight! + 1);
      expect(scrollWidth, `${LAYOUT_DETAIL_ANALYZERS[i]}の横`).toBeLessThanOrEqual(clientWidth! + 1);
      // N感度は畳んだ表の包みが横にスクロールする作りで、他は中でスクロールしない
      if (LAYOUT_DETAIL_ANALYZERS[i] !== 'n-sensitivity') expect(inner, `${LAYOUT_DETAIL_ANALYZERS[i]}の中のスクロール`).toBe(0);
    });
    // 1920pxの面（サイドバー固定）には18列の並びが横にスクロールせず収まり、1440pxの面では面の中で横にスクロールする
    if (size.width === 1920) expect(m.area[0]).toBeLessThanOrEqual(m.area[1]! + 1);
    else expect(m.area[0]).toBeGreaterThan(m.area[1]!);
  });
}

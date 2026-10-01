import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 板の下端のつまみ（#833）。ドラッグ・キーボードで板の高さを変え、中のペインは比を保って伸び縮みする。
 * 下限（ペインの下限の和・1画面）で止まり、保存され、ダブルクリックで1画面（自動）へ戻る。縦積み（スマホ幅）には出ない。
 */

const REM = 16;
/** ペインの下限 = 見出し・余白 + 本体の下限（`workspace-board-height.spec.ts` と同じ）。 */
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

const PANES = [flow('f'), comparison('c')];

async function openWorkspace(
  page: Page,
  panes: readonly unknown[],
  layout: unknown,
  size: { width: number; height: number },
  extra: Record<string, unknown> = {},
  query = '',
) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'board', name: '板の高さ', text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes, layout, ...extra });
  await page.goto(`/workspace/board${query}`);
  await waitForHydration(page);
}

/**
 * 板と各ペインの枠の位置・大きさが、連続する描画フレームで変わらなくなるまで待つ。
 * 固定の待ち時間は、負荷が小さければ無駄で、大きければ足りない。寸法が落ち着いたことそのものを条件にする。
 */
async function waitForSettledLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const signature = () => [...document.querySelectorAll('.workspace-dock-area, .dv-groupview')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${r.top}|${r.height}|${r.width}`;
      }).join(',');
    let last = signature();
    let stable = 0;
    const tick = () => {
      const now = signature();
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 10) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

async function waitForDock(page: Page, paneCount = PANES.length) {
  // 読み込みが重い時のために、表示待ちの枠は広めにとる（テスト全体の枠は playwright の既定のまま）
  await expect(page.locator('.dv-groupview')).toHaveCount(paneCount, { timeout: 20_000 });
  await expect(page.locator('.dv-groupview').first()).toBeVisible();
  await waitForSettledLayout(page);
}

const handle = (page: Page) => page.getByRole('separator', { name: 'ペインを並べる領域の高さ' });

const areaHeight = (page: Page) => page.evaluate(() => document.querySelector('.workspace-dock-area')!.getBoundingClientRect().height);

/** 各ペインの枠の高さ。上から下の順。 */
const groupHeights = (page: Page) => page.evaluate(() => (
  [...document.querySelectorAll('.dv-groupview')]
    .map((el) => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height }))
    .sort((a, b) => a.top - b.top)
    .map((g) => g.height)
));

async function storedBoardHeight(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('keydist:workspaces') ?? '{}') as { workspaces?: { boardHeightRem?: number }[] };
    return stored.workspaces?.[0]?.boardHeightRem;
  });
}

/** つまみを画面に入れて、`dy`だけ縦に動かす（画面の外へ出る動きも含む）。 */
async function dragHandle(page: Page, dy: number) {
  await handle(page).scrollIntoViewIfNeeded();
  const box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
}

const TWO = () => column(group('f', 3), group('c', 2));
const WIDE = { width: 1440, height: 900 };
/** 下限の和（2枚で53.6rem）が1画面に収まる高さ */
const TALL = { width: 1440, height: 1200 };

test('下端のつまみをドラッグすると板が伸び、ペインは比を保って伸びる。保存され、再読み込みでも残る', async ({ page }) => {
  // ページを2回読み込む（最初と再読み込み）上にドラッグも挟むので、他の1回読みのテストと同じ30秒では、
  // 並列の負荷で読み込みが遅い時に待ちの途中で枠が尽きる。待ち自体は条件待ちで、枠だけを2回分にする。
  test.setTimeout(60_000);
  await openWorkspace(page, PANES, TWO(), WIDE);
  await waitForDock(page);
  const before = await areaHeight(page);
  const beforeGroups = await groupHeights(page);
  expect(await storedBoardHeight(page)).toBeUndefined();

  await dragHandle(page, 400);
  await expect.poll(() => areaHeight(page)).toBeGreaterThan(before + 380);
  await expect.poll(async () => (await storedBoardHeight(page)) ?? 0).toBeGreaterThan(0);
  const after = await areaHeight(page);
  expect(Math.abs(after - before - 400)).toBeLessThan(6);
  expect(Math.abs((await storedBoardHeight(page))! - after / REM)).toBeLessThan(0.1);

  // 比を保つ（上の段 : 下の段 が、伸ばす前と同じ）
  await waitForSettledLayout(page);
  const afterGroups = await groupHeights(page);
  expect(afterGroups[0]! / afterGroups[1]!).toBeCloseTo(beforeGroups[0]! / beforeGroups[1]!, 1);
  expect(afterGroups[0]!).toBeGreaterThan(beforeGroups[0]! + 100);

  const stored = (await storedBoardHeight(page))!;
  await page.reload();
  await waitForHydration(page);
  await waitForDock(page);
  expect(await storedBoardHeight(page)).toBe(stored);
  expect(Math.abs((await areaHeight(page)) / REM - stored)).toBeLessThan(0.1);
});

test('縮める時は、ペインの下限の和で止まる。1画面より小さくはならない', async ({ page }) => {
  // 下限の和 + 余白（縦3段）。1440×900の1画面より高い
  const minRem = floorOf('bigram-flow') + floorOf('n-sensitivity') + floorOf('comparison') + 0.5 * 2 + 1.5;
  await openWorkspace(page, [flow('f'), nSens('n'), comparison('c')], column(group('f', 2.6), group('n', 1.7), group('c', 1.5)), WIDE, { boardHeightRem: 110 });
  await waitForDock(page, 3);
  expect(Math.abs((await areaHeight(page)) / REM - 110)).toBeLessThan(0.1);

  await dragHandle(page, -3000);
  await expect.poll(async () => (await areaHeight(page)) / REM).toBeLessThan(minRem + 0.2);
  expect(await storedBoardHeight(page)).toBeGreaterThanOrEqual(minRem - 0.05);
  expect((await areaHeight(page)) / REM).toBeGreaterThanOrEqual(minRem - 0.05);
  await expect(handle(page)).toHaveAttribute('aria-valuemin', String(Math.round(minRem * 100) / 100));
});

test('ペインが少なく下限の和が1画面より小さい時は、縮めると1画面に戻り、保存が消える', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), TALL, { boardHeightRem: 80 });
  await waitForDock(page);
  expect(Math.abs((await areaHeight(page)) / REM - 80)).toBeLessThan(0.1);
  await dragHandle(page, -3000);
  await expect.poll(() => storedBoardHeight(page)).toBeUndefined();
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.scrollHeight))).toBe(1200);
});

test('キーボード: 矢印で2rem、PageUp/PageDownで10rem、Home/Endで下限/上限。aria属性が現状を表す', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), TALL, { boardHeightRem: 80 });
  await waitForDock(page);
  const h = handle(page);
  await expect(h).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(h).toHaveAttribute('aria-label', 'ペインを並べる領域の高さ');
  await expect(h).toHaveAttribute('tabindex', '0');
  await expect(h).toHaveAttribute('aria-valuenow', '80');
  // 上限は1画面の4倍（1440×1200で約270rem）。保存値の上限（1000rem）ではない
  const max = Number(await h.getAttribute('aria-valuemax'));
  expect(max).toBeGreaterThan(200);
  expect(max).toBeLessThan(400);
  const min = Number(await h.getAttribute('aria-valuemin'));
  expect(min).toBeGreaterThan(40);
  expect(min).toBeLessThan(80);

  await h.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => storedBoardHeight(page)).toBe(82);
  await expect(h).toHaveAttribute('aria-valuenow', '82');
  await page.keyboard.press('PageDown');
  await expect.poll(() => storedBoardHeight(page)).toBe(92);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => storedBoardHeight(page)).toBe(90);
  await page.keyboard.press('PageUp');
  await expect.poll(() => storedBoardHeight(page)).toBe(80);
  await page.keyboard.press('End');
  await expect.poll(() => storedBoardHeight(page)).toBe(max);
  await expect(h).toHaveAttribute('aria-valuenow', String(max));
  // Homeは下限（ここでは1画面）。下限が1画面なら保存を消す
  await page.keyboard.press('Home');
  await expect.poll(() => storedBoardHeight(page)).toBeUndefined();
  expect(Number(await h.getAttribute('aria-valuenow'))).toBeCloseTo(min, 1);
});

test('ダブルクリックで板を1画面（自動）へ戻す', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), TALL, { boardHeightRem: 90 });
  await waitForDock(page);
  expect(await storedBoardHeight(page)).toBe(90);
  await handle(page).scrollIntoViewIfNeeded();
  await handle(page).dblclick();
  await expect.poll(() => storedBoardHeight(page)).toBeUndefined();
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.scrollHeight))).toBe(1200);
});

test('?tabs=hide でもつまみが出る。縦積み（スマホ幅）では出ない', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), WIDE, {}, '?tabs=hide');
  await waitForDock(page);
  await expect(handle(page)).toHaveCount(1);
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator('[data-workspace-stack]')).toBeVisible();
  await expect(handle(page)).toHaveCount(0);
});

test('ページの下端までスクロールした状態で上へ動かすと、板はポインタと同じだけ縮む', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), WIDE, { boardHeightRem: 100 });
  await waitForDock(page);
  for (const dy of [100, 40]) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1)).toBe(true);
    await waitForSettledLayout(page);
    const before = await areaHeight(page);
    await dragHandle(page, -dy);
    await expect.poll(async () => Math.round(before - (await areaHeight(page)))).toBeGreaterThan(dy - 3);
    await waitForSettledLayout(page);
    expect(Math.abs(before - (await areaHeight(page)) - dy)).toBeLessThanOrEqual(2);
    // 通常のドラッグの後は、ページの高さの固定が戻っている
    expect(await pageMinHeight(page)).toBe('');
  }
});

const pageMinHeight = (page: Page) => page.evaluate(() => document.documentElement.style.minHeight);

test('pointerupが来ないまま掴みが外れても、ページの高さの固定が戻り、次のドラッグでも残らない', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), WIDE, { boardHeightRem: 100 });
  await waitForDock(page);
  await handle(page).scrollIntoViewIfNeeded();
  const box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 5 });
  expect(await pageMinHeight(page)).not.toBe('');
  const before = await storedBoardHeight(page);
  // 掴みを外して、つまみの外で離す
  await handle(page).evaluate((el) => el.releasePointerCapture(1));
  await page.mouse.move(x, y - 200, { steps: 5 });
  await page.mouse.up();
  expect(await pageMinHeight(page)).toBe('');
  // 中断として扱い、保存は変わらない
  expect(await storedBoardHeight(page)).toBe(before);
  await dragHandle(page, -40);
  await expect.poll(() => storedBoardHeight(page)).not.toBe(before);
  expect(await pageMinHeight(page)).toBe('');
});

test('矢印キーを続けて押した後の元に戻す1回で、押す前の高さに戻る。押している間は保存しない', async ({ page }) => {
  await openWorkspace(page, PANES, TWO(), TALL, { boardHeightRem: 80 });
  await waitForDock(page);
  const h = handle(page);
  await h.focus();
  // 待ちの250msは時計を止めて進める。実時間のままだと、負荷でキーの間が250msを超えた時に、途中で保存されてしまう
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('PageDown');
  // 最後のキーから待ちが過ぎるまで保存しない
  await page.clock.runFor(200);
  expect(await storedBoardHeight(page)).toBe(80);
  await page.clock.runFor(100);
  await page.clock.resume();
  await expect.poll(() => storedBoardHeight(page)).toBe(94);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(() => storedBoardHeight(page)).toBe(80);
});

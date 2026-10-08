import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';
import { advance, settleGrid } from './settle-helper.ts';

/**
 * Workspaceで、入力が変わっていないペインは計算の依頼を出し直さず、「計算中」にもならないことの確認。
 *
 * 依頼はWorkerへ送るメッセージの数で、「計算中」は`data-pane-status="stale"`になった回数で数える。
 * 配列を1つ選び直すと、連動していない固定のペインまで全ペインが依頼を出し直して「計算中」になっていた。
 * ペインを動かす・大きさを変える時も、並びの保存で他のペインが依頼を出し直さないこと。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const TEXT = { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } };

const layoutTarget = (layoutId: string) => ({ kind: 'layout', layoutId });
const follow = (id: string, group: string) => ({ id, analyzerId: 'bigram-flow', binding: { mode: 'follow', group } });
const fixed = (id: string, layoutId: string) => ({
  id,
  analyzerId: 'bigram-flow',
  binding: { mode: 'fixed', target: { kind: 'single', target: layoutTarget(layoutId) } },
});
const groupOf = (id: string, layoutId: string) => ({ id, target: { single: layoutTarget(layoutId) } });

/** 保存先へWorkspaceを直接書き、Workerへの依頼と各ペインの「計算中」の回数を数える仕掛けを入れる。 */
async function openSeeded(page: Page, workspace: unknown): Promise<void> {
  // 保存の間引きが切れるまでの時間を、実時間で待たずに `advance` で進める
  await page.clock.install();
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
    const log = { requests: 0, stale: [] as number[] };
    (window as unknown as { __log: typeof log }).__log = log;
    const Original = window.Worker;
    window.Worker = class extends Original {
      override postMessage(message: unknown, ...rest: unknown[]) {
        log.requests += 1;
        return (super.postMessage as (...args: unknown[]) => void)(message, ...rest);
      }
    } as typeof Worker;
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target as Element;
        if (element.getAttribute('data-pane-status') !== 'stale') continue;
        log.stale.push([...document.querySelectorAll('.pane-frame')].indexOf(element));
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pane-status'] });
  }, { key: WORKSPACES_KEY, value: workspace });
  await page.goto('/workspace/requests');
  await waitForHydration(page);
}

/** 開いた直後の計算（見えていないペインのぶんも含む）が済むまで待つ。依頼の数が600ms動かなければ済んだとみなす。 */
async function waitForInitialCompute(page: Page): Promise<void> {
  let previous = -1;
  await expect.poll(async () => {
    const current = await page.evaluate(() => (window as unknown as { __log: { requests: number } }).__log.requests);
    const settled = current === previous;
    previous = current;
    // 依頼が出ない時間そのものが条件（600ms動かなければ済んだとみなす）なので、実時間で待つ
    if (!settled) await page.waitForTimeout(600);
    return settled;
  }).toBe(true);
}

async function resetLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log = (window as unknown as { __log: { requests: number; stale: number[] } }).__log;
    log.requests = 0;
    log.stale.length = 0;
  });
}

async function readLog(page: Page): Promise<{ requests: number; stale: number[] }> {
  // 保存は間引かれて後から起きる。取りこぼさないよう、間引きの時間を越えるまでタイマーを進めてから読む。
  await advance(page, 800);
  return page.evaluate(() => (window as unknown as { __log: { requests: number; stale: number[] } }).__log);
}

/** `paneIndex`番目のペインの対象を選び直し、そのペインが計算し終わるまで待つ。 */
async function selectTarget(page: Page, paneIndex: number, layoutId: string, timeout = 5000): Promise<void> {
  const pane = page.locator('.pane-frame').nth(paneIndex);
  await pane.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${layoutId}"]`).click();
  await page.keyboard.press('Escape');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout });
}

const WORKSPACE_BASE = { id: 'requests', name: '依頼の確認', text: TEXT };

test('配列を選び直すと、変わったペインだけが依頼を出して計算中になる。戻す時は計算済みなので依頼も計算中も無い', async ({ page }) => {
  await openSeeded(page, {
    ...WORKSPACE_BASE,
    groups: [groupOf('g1', 'qwerty'), groupOf('g2', 'dvorak')],
    // 連動2（別々の組）と固定1
    panes: [follow('a', 'g1'), follow('b', 'g2'), fixed('c', 'colemak')],
    grid: ['a', 'b', 'c'].map((id, i) => ({ id, x: i * 8, y: 0, w: 8, h: 16 })),
  });
  const panes = page.locator('.pane-frame');
  await expect(panes).toHaveCount(3);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(3, { timeout: 15_000 });
  await waitForInitialCompute(page);

  const select = (paneIndex: number, layoutId: string) => selectTarget(page, paneIndex, layoutId);

  await resetLog(page);
  await select(1, 'workman');
  const changed = await readLog(page);
  // 変わった1ペインぶんだけ（Traceと抽出の2件）。ほかのペインは計算中にならない
  expect(changed.requests).toBe(2);
  expect(changed.stale).toEqual([1]);

  await resetLog(page);
  await select(1, 'dvorak');
  const back = await readLog(page);
  // 最初に計算した配列へ戻す時は、Workerへの往復を挟まずに結果が出る
  expect(back.requests).toBe(0);
  expect(back.stale).toEqual([]);
});

test('ペインを動かす・大きさを変えても、依頼は出ず、計算中にもならない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSeeded(page, {
    ...WORKSPACE_BASE,
    groups: [groupOf('g1', 'qwerty')],
    panes: [follow('a', 'g1'), follow('b', 'g1'), fixed('c', 'colemak')],
    grid: [
      { id: 'a', x: 0, y: 0, w: 12, h: 16 },
      { id: 'b', x: 12, y: 0, w: 12, h: 16 },
      { id: 'c', x: 0, y: 16, w: 12, h: 16 },
    ],
  });
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(3, { timeout: 15_000 });
  await waitForInitialCompute(page);

  // 移動: cのつかみ所を右の列の下へ運ぶ
  await resetLog(page);
  await settleGrid(page);
  const grab = (await page.locator('.workspace-grid-item[data-pane-id="c"] .workspace-drag-handle').boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + 600, grab.y + grab.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await storedGridItem(page, 'c')).x).toBeGreaterThan(0);

  // 大きさの変更: aの右下の角をつかんで縮める
  await settleGrid(page);
  const corner = (await page.locator('.workspace-grid-item[data-pane-id="a"] .react-resizable-handle-se').boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 150, corner.y - 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await storedGridItem(page, 'a')).w).toBeLessThan(12);

  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(3);
  const log = await readLog(page);
  expect(log, '移動と大きさの変更').toEqual({ requests: 0, stale: [] });

  // 数え方が効いていることの確認: 依頼が増える操作（まだ計算していない配列への選び直し）では数字が動く。
  // 数え方が壊れていれば上の「0のまま」は空振りで通ってしまう
  await resetLog(page);
  await selectTarget(page, 0, 'workman');
  const changed = await readLog(page);
  // aとbは同じ組に連動しているので、bのぶんも依頼が出る（2ペイン × Traceと抽出）
  expect(changed.requests).toBe(4);
  // 変わったのはaの組（aとb）。cは固定なので計算中にならない。数える位置は画面の読み順
  expect(changed.stale).toEqual([0, 1]);
});

/** 保存した格子のうち、指定のペインの枠。 */
async function storedGridItem(page: Page, id: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return (JSON.parse(raw!).workspaces[0].grid as { id: string; x: number; y: number; w: number; h: number }[]).find((item) => item.id === id)!;
}

const SENTENCE = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. ';

test('計算中に別のペインの大きさを変える（資産の保存）と、計算中だったペインの依頼は打ち切られず出し直されない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // 長いテキスト（英文1万字）で、計算が数秒かかるようにする。計算中の依頼が、並びの保存に
  // 伴って打ち切られて出し直されると、依頼の数が倍になる
  await openSeeded(page, {
    ...WORKSPACE_BASE,
    groups: [groupOf('g1', 'qwerty')],
    panes: [follow('a', 'g1'), fixed('b', 'dvorak')],
    grid: [{ id: 'a', x: 0, y: 0, w: 12, h: 16 }, { id: 'b', x: 12, y: 0, w: 12, h: 16 }],
  });
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(2, { timeout: 15_000 });

  const body = (await openTextChip(page)).getByLabel('テキスト', { exact: true });
  await body.fill(SENTENCE.repeat(120));
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'stale', { timeout: 10_000 });
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(2, { timeout: 30_000 });
  await waitForInitialCompute(page);

  // aを、まだ計算していない配列に選び直す。計算中（stale）のうちに、bの下の辺で大きさを変える
  await resetLog(page);
  const pane = page.locator('.pane-frame').first();
  await pane.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:workman"]').click();
  await page.keyboard.press('Escape');
  await expect(pane).toHaveAttribute('data-pane-status', 'stale');
  const before = await storedGridItem(page, 'b');
  const edge = (await page.locator('.workspace-grid-item[data-pane-id="b"] .react-resizable-handle-s').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2 + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await storedGridItem(page, 'b')).h).toBeGreaterThan(before.h);
  // 保存が起きた時点でaは計算中のまま（保存が計算の終わりの後ろに回っていない）
  await expect(pane).toHaveAttribute('data-pane-status', 'stale');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 30_000 });

  const log = await readLog(page);
  // workmanのTraceと抽出の2件だけ
  expect(log.requests).toBe(2);
});

import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceで、入力が変わっていないペインは計算の依頼を出し直さず、「計算中」にもならないことの確認。
 *
 * 依頼はWorkerへ送るメッセージの数で、「計算中」は`data-pane-status="stale"`になった回数で数える。
 * 配列を1つ選び直すと、連動していない固定のペインまで全ペインが依頼を出し直して「計算中」になっていた。
 * タブを切り替える時も、アクティブなタブの保存のたびに同じことが起きていた。
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
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
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
  // 保存は間引かれて後から起きる。取りこぼさないよう、保存が済むまで十分に待ってから読む。
  await page.waitForTimeout(800);
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
    layout: {
      kind: 'split', direction: 'row', weight: 1,
      children: ['a', 'b', 'c'].map((paneId) => ({ kind: 'group', paneIds: [paneId], weight: 1 })),
    },
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

test('同じ枠のタブを切り替えても、依頼は出ず、計算中にもならない', async ({ page }) => {
  await openSeeded(page, {
    ...WORKSPACE_BASE,
    groups: [groupOf('g1', 'qwerty')],
    panes: [follow('a', 'g1'), follow('b', 'g1'), fixed('c', 'colemak')],
    layout: { kind: 'group', paneIds: ['a', 'b', 'c'], weight: 1 },
  });
  const tabs = page.locator('.dv-default-tab');
  await expect(tabs).toHaveCount(3);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(1, { timeout: 15_000 });
  await waitForInitialCompute(page);

  for (const index of [1, 2, 0]) {
    await resetLog(page);
    await tabs.nth(index).click();
    await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(1);
    const log = await readLog(page);
    expect(log, `タブ${index + 1}へ切り替え`).toEqual({ requests: 0, stale: [] });
  }

  // 数え方が効いていることの確認: 依頼が増える操作（まだ計算していない配列への選び直し）では数字が動く。
  // 数え方が壊れていれば上の「0のまま」は空振りで通ってしまう
  await resetLog(page);
  await selectTarget(page, 0, 'workman');
  const changed = await readLog(page);
  // aとbは同じ組に連動しているので、見えていないbのぶんも依頼が出る（2ペイン × Traceと抽出）
  expect(changed.requests).toBe(4);
  expect(changed.stale).toEqual([0]);
});

const SENTENCE = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly. ';

test('計算中に別のタブを開いて戻っても、計算中だったペインの依頼は打ち切られず出し直されない', async ({ page }) => {
  // 長いテキスト（英文1万字）で、計算が数秒かかるようにする。計算中の依頼が、タブの切り替えに
  // 伴う保存で打ち切られて出し直されると、依頼の数が倍になる
  await openSeeded(page, {
    ...WORKSPACE_BASE,
    groups: [groupOf('g1', 'qwerty')],
    panes: [follow('a', 'g1'), fixed('b', 'dvorak')],
    layout: { kind: 'group', paneIds: ['a', 'b'], weight: 1 },
  });
  const tabs = page.locator('.dv-default-tab');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(1, { timeout: 15_000 });

  const body = (await openTextChip(page)).getByLabel('テキスト', { exact: true });
  await body.fill(SENTENCE.repeat(120));
  await page.keyboard.press('Escape');
  // テキストの変更で始まる計算（見えていないタブのぶんも含む）が済むまで待つ
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'stale', { timeout: 10_000 });
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 30_000 });
  await waitForInitialCompute(page);

  // aを、まだ計算していない配列に選び直す。計算中（stale）のうちに、bのタブを開いてaへ戻る
  await resetLog(page);
  const pane = page.locator('.pane-frame');
  await pane.getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:workman"]').click();
  await page.keyboard.press('Escape');
  await expect(pane).toHaveAttribute('data-pane-status', 'stale');
  await tabs.nth(1).click();
  await tabs.nth(0).click();
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 30_000 });

  const log = await readLog(page);
  // workmanのTraceと抽出の2件だけ
  expect(log.requests).toBe(2);
});

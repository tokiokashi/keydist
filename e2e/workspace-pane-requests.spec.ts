import { expect, test, type Page } from '@playwright/test';
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

  const select = async (paneIndex: number, layoutId: string) => {
    await panes.nth(paneIndex).getByRole('button', { name: /^対象: / }).click();
    await page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${layoutId}"]`).click();
    await page.keyboard.press('Escape');
    await expect(panes.nth(paneIndex)).toHaveAttribute('data-pane-status', 'ready');
  };

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
});

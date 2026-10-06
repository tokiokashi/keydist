import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_DEBOUNCE_MS } from '../src/platform/persistence/debounced-scheduler.ts';
import { openFigureSettings } from './bigram-flow-figure-helper.ts';
import { waitForHydration } from './hydration-helper.ts';
import { advance, freezeClock } from './settle-helper.ts';

/**
 * 解析設定の保存（debounce）の反響が、利用者の次の入力の後に届いても、下書きが
 * 1つ前の値へ戻らないこと。
 *
 * 反響が次の入力より後になる順序を、timerの処理の中で次の入力を行うことで決定的に作る。
 * 保存のtimerの処理（資産の更新と再描画の予約）の直後、再描画のtaskより前に、同じtaskの中で
 * チェックを切り替える。本物の操作の間隔や環境の遅さには頼らない。
 */

const LABEL = '同じキーの連打の回数を表示する';

interface EchoWindow {
  __afterSave?: () => void;
  __seen: boolean[];
  /** 記録の1秒が済んだ印。待つ側は `__seenDone` を見る。 */
  __seenDone?: boolean;
}

/** 保存のtimerの処理の直後に、1度だけ`__afterSave`を呼ぶ。 */
async function hookSaveTimer(page: Page): Promise<void> {
  await page.addInitScript((debounceMs) => {
    const w = window as unknown as EchoWindow;
    const origSet = window.setTimeout.bind(window);
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms !== debounceMs) return origSet(fn, ms, ...args);
      return origSet(() => {
        fn();
        const after = w.__afterSave;
        w.__afterSave = undefined;
        after?.();
      }, ms, ...args);
    };
  }, DEFAULT_DEBOUNCE_MS);
}

/** 次の保存のtimerの直後にチェックを押し、その後の約1秒に表示された状態を記録する。 */
async function armToggleAfterSave(page: Page): Promise<void> {
  await page.evaluate((label) => {
    const w = window as unknown as EchoWindow;
    w.__seen = [];
    w.__seenDone = false;
    w.__afterSave = () => {
      const labelEl = [...document.querySelectorAll('label')].find((l) => l.textContent === label);
      const box = labelEl === undefined ? null : document.getElementById(labelEl.htmlFor);
      if (!(box instanceof HTMLInputElement)) throw new Error('チェックが見つからない');
      box.click();
      const start = performance.now();
      const sample = () => {
        w.__seen.push(box.checked);
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
        else w.__seenDone = true;
      };
      sample();
      requestAnimationFrame(sample);
    };
  }, LABEL);
}

async function expectNoRevert(page: Page, toggle: Locator): Promise<void> {
  await toggle.uncheck();
  await armToggleAfterSave(page);
  // 保存のtimerが走り、その中で押されたチェックが入るまで待つ
  await expect(toggle).toBeChecked();
  // 記録の1秒が済むまで待つ。実時間の長さではなく、記録する側が終わった印を見る
  await expect.poll(() => page.evaluate(() => (window as unknown as EchoWindow).__seenDone === true)).toBe(true);
  const seen = await page.evaluate(() => (window as unknown as EchoWindow).__seen);
  expect(seen.length).toBeGreaterThan(10);
  // 押した直後から、反響を挟んでも、チェックは入ったまま
  expect(seen.every((checked) => checked)).toBe(true);
  await expect(toggle).toBeChecked();
}

test('個別画面: 保存の反響が次の入力の後に届いても、下書きは新しい値のまま', async ({ page }) => {
  await hookSaveTimer(page);
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await waitForHydration(page);
  const settings = await openFigureSettings(page, 'Keyboard Flow');
  await expectNoRevert(page, settings.getByRole('checkbox', { name: LABEL }));
});

test('個別画面: 同じ値を入れ直した後の元に戻すで、表示と保存値が一致する', async ({ page }) => {
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await waitForHydration(page);
  const toggle = (await openFigureSettings(page, 'Keyboard Flow')).getByRole('checkbox', { name: LABEL });
  await freezeClock(page);
  await toggle.uncheck();
  await toggle.check();
  await advance(page, DEFAULT_DEBOUNCE_MS + 200);
  await toggle.uncheck();
  await advance(page, DEFAULT_DEBOUNCE_MS + 200);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(toggle).toBeChecked();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'true');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options') ?? ''))
    .not.toContain('"repeatBadge":false');
});

test('個別画面: 保存されなかった入れ直しの後の元に戻すで、表示と保存値が一致する', async ({ page }) => {
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await waitForHydration(page);
  const toggle = (await openFigureSettings(page, 'Keyboard Flow')).getByRole('checkbox', { name: LABEL });
  await freezeClock(page);
  await toggle.uncheck();
  await advance(page, DEFAULT_DEBOUNCE_MS + 200); // 消した設定が保存される
  await toggle.check();
  await toggle.uncheck(); // 戻して消し直すので、保存先は消した値のまま動かない
  await advance(page, DEFAULT_DEBOUNCE_MS + 200);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(toggle).toBeChecked();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'true');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options') ?? ''))
    .not.toContain('"repeatBadge":false');
});

test('個別画面: 保存のtimerが遅れても、書かれなかった入力が元に戻すを取り違えない', async ({ page }) => {
  // 保存のtimer（400ms）を700msに遅らせる。入力の時刻から「書かれたはず」と推測する方式は、この順序で外れる。
  // 遅らせるwrapperが、時計の差し替え後のsetTimeoutを包むように、先に時計を入れる
  await page.clock.install();
  await page.addInitScript((debounceMs) => {
    const origSet = window.setTimeout.bind(window);
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) =>
      origSet(fn, ms === debounceMs ? 700 : ms, ...args);
  }, DEFAULT_DEBOUNCE_MS);
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await waitForHydration(page);
  const toggle = (await openFigureSettings(page, 'Keyboard Flow')).getByRole('checkbox', { name: LABEL });
  await freezeClock(page);
  await toggle.uncheck();
  await advance(page, 1200); // 消した設定が書かれる
  await toggle.check();
  await advance(page, 450); // 戻した値の保存はまだ書かれない（遅らせた700msに届かない）
  await toggle.uncheck();
  await advance(page, 3000);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(toggle).toBeChecked();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'true');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options') ?? ''))
    .not.toContain('"repeatBadge":false');
});

test('個別画面: 保存を待っている間の元に戻すで、表示と保存値が一致する', async ({ page }) => {
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await waitForHydration(page);
  const toggle = (await openFigureSettings(page, 'Keyboard Flow')).getByRole('checkbox', { name: LABEL });
  await freezeClock(page);
  await toggle.uncheck();
  await advance(page, 800); // 消した設定が保存され、履歴ができる
  await toggle.check();
  await advance(page, 130); // 戻した値の保存はまだ待っている
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(toggle).not.toBeChecked();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'false');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options') ?? ''))
    .toContain('"repeatBadge":false');
});

test('Workspace のペイン: 保存の反響が次の入力の後に届いても、下書きは新しい値のまま', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await hookSaveTimer(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({
        version: 3,
        workspaces: [{
          id: 'echo',
          name: 'echo',
          text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
          panes: [{
            id: 'a',
            analyzerId: 'bigram-flow',
            binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } },
          }],
          grid: [{ id: 'a', x: 0, y: 0, w: 12, h: 20 }],
        }],
      }));
    }
  });
  await page.goto('/workspace/echo');
  await waitForHydration(page);
  const pane = page.locator('.workspace-grid-item[data-pane-id="a"]');
  await expect(pane.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  const panel = pane.getByRole('group', { name: 'Keyboard Flowの表示' });
  if (!(await panel.isVisible())) await pane.getByRole('button', { name: 'Keyboard Flowの表示', exact: true }).click();
  await expect(panel).toBeVisible();
  await expectNoRevert(page, panel.getByRole('checkbox', { name: LABEL }));
});

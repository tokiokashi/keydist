import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_DEBOUNCE_MS } from '../src/platform/persistence/debounced-scheduler.ts';
import { openFigureSettings } from './bigram-flow-figure-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 解析設定の保存（debounce）の反響が、利用者の次の入力の後に届いても、下書きが
 * 1つ前の値へ戻らないこと（#935）。
 *
 * 反響が次の入力より後になる順序を、timerの処理の中で次の入力を行うことで決定的に作る。
 * 保存のtimerの処理（資産の更新と再描画の予約）の直後、再描画のtaskより前に、同じtaskの中で
 * チェックを切り替える。本物の操作の間隔や環境の遅さには頼らない。
 */

const LABEL = '同じキーの連打の回数を表示する';

interface EchoWindow {
  __afterSave?: () => void;
  __seen: boolean[];
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
    w.__afterSave = () => {
      const labelEl = [...document.querySelectorAll('label')].find((l) => l.textContent === label);
      const box = labelEl === undefined ? null : document.getElementById(labelEl.htmlFor);
      if (!(box instanceof HTMLInputElement)) throw new Error('チェックが見つからない');
      box.click();
      const start = performance.now();
      const sample = () => {
        w.__seen.push(box.checked);
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
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
  await page.waitForTimeout(1100);
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

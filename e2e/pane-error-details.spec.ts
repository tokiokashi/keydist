import { expect, test, type Page } from '@playwright/test';

/**
 * 例外が起きた時のペインの表示。利用者向けの1文だけを見せ、例外の原文（不具合報告用）は
 * 折りたたんだ詳細へ入れる。
 */
const BREAK_MESSAGE = 'キー k_99 の座標が壊れている';

/** 指定した Math の関数を、`__break` が立っている間だけ例外にする。 */
async function breakMath(page: Page, name: 'hypot' | 'sin') {
  await page.addInitScript(({ message, fn }) => {
    const target = Math as unknown as Record<string, (...values: number[]) => number>;
    const original = target[fn]!;
    target[fn] = (...values: number[]) => {
      if ((window as unknown as { __break?: boolean }).__break) throw new Error(message);
      return original(...values);
    };
  }, { message: BREAK_MESSAGE, fn: name });
}

/**
 * 計算はWorkerの中で走るので、メインスレッドの`Math`を書き換えても計算は壊れない。
 * Workerのスクリプトの先頭に同じ差し込みを足し、`__break`はWorker側で立てる。
 */
async function breakMathInWorker(page: Page, name: 'hypot') {
  await page.route('**/*engine-worker*', async (route) => {
    const response = await route.fetch();
    const patch = `(() => { const original = Math.${name}; Math.${name} = (...values) => { if (self.__break) throw new Error(${JSON.stringify(BREAK_MESSAGE)}); return original(...values); }; })();\n`;
    await route.fulfill({ response, body: patch + (await response.text()) });
  });
}

async function expectFoldedDetails(alert: ReturnType<Page['locator']>, withStack: boolean) {
  const details = alert.locator('details[data-pane-error-details]');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('pre')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('pre')).toContainText(BREAK_MESSAGE);
  if (withStack) await expect(details.locator('pre')).toContainText(/\n\s+at /);
}

test('計算中の例外: 1文だけ出し、原文は折りたたんだ詳細に入る', async ({ page }) => {
  await breakMathInWorker(page, 'hypot');
  await page.goto('/standalone/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });

  expect(page.workers()).toHaveLength(1);
  await Promise.all(page.workers().map((worker) => worker.evaluate(() => { (self as unknown as { __break: boolean }).__break = true; })));
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');

  const alert = pane.locator('[data-pane-error]');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert.locator('> p')).toHaveText('計算中にエラーが発生しました。条件を変えて試してください');
  await expect(alert.locator('> p')).not.toContainText(/k_99/);
  await expectFoldedDetails(alert, false);
});

test('描画中の例外（error boundary）: 1文だけ出し、原文とstackは折りたたんだ詳細に入る', async ({ page }) => {
  // Math.sin は Bigram Flow の描画でしか使われないので、計算は成功したまま描画だけが落ちる。
  await breakMath(page, 'sin');
  await page.goto('/standalone/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });

  await page.evaluate(() => { (window as unknown as { __break: boolean }).__break = true; });
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');

  const alert = pane.locator('[data-pane-crashed]');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(pane).toHaveAttribute('data-pane-status', 'ready');
  await expect(alert.locator('> p')).toHaveText('この可視化を表示できませんでした。条件を変えて試してください');
  await expect(alert.locator('> p')).not.toContainText(/k_99/);
  await expectFoldedDetails(alert, true);
});

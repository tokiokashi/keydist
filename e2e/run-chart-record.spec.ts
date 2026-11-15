import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { useKanaText } from './kana-text-helper.ts';

/**
 * Run Chartに打鍵の記録の間隔を並べる画面のE2E。間隔の定義・食い違いの判定・表の集計はunit testが持つので、ここでは画面の配線を見る:
 * 打鍵の記録の画面で保存した記録を、Run Chartで選ぶと、記録の出どころと間隔の図が同じペインに出て、表で読める。
 */

/** 次に打つキーの表示を読み、打ち終えるまで打つ。 */
async function typeThrough(page: Page): Promise<void> {
  const run = page.locator('[data-record-run="active"]');
  const next = page.locator('[data-record-next] kbd');
  for (let step = 0; step < 600; step += 1) {
    if (!(await run.isVisible())) return;
    const labels = await next.allTextContents().catch(() => []);
    if (labels.length === 0) continue;
    await page.keyboard.press(labels.map((label) => label.toLowerCase()).join('+'));
    await page.waitForTimeout(20);
  }
  throw new Error('記録が終わらなかった');
}

test('打鍵の記録の画面で保存した記録を、Run Chartで選ぶと間隔の図と出どころが出る', { tag: PAGE_TAG }, async ({ page }) => {
  test.setTimeout(90_000);
  await useKanaText(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:multi-target-selection') === null) {
      localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }] }));
    }
  });

  await page.goto('/record');
  await waitForHydration(page);
  await page.locator('[data-record-start]').click();
  await typeThrough(page);
  await page.locator('[data-record-save]').click();
  await expect(page.locator('[data-record-row]')).toHaveCount(1);

  await page.goto('/analyzer/run-chart');
  await waitForHydration(page);
  const feature = page.locator('[data-react-feature="run-chart"]');
  await expect(feature.locator('[data-run-chart-series]')).toHaveCount(1, { timeout: 15_000 });

  // 記録を選ぶまでは、間隔の図は出ない
  const select = feature.locator('[data-run-chart-record-select]');
  await expect(select).toBeVisible();
  await expect(feature.locator('[data-run-chart-record-figure]')).toHaveCount(0);

  await select.selectOption({ index: 1 });
  await expect(feature.locator('[data-run-chart-record-origin]')).toContainText('かな文');
  await expect(feature.locator('[data-run-chart-record-figure]')).toBeVisible();
  await expect(feature.locator('[data-run-chart-record-mismatch]')).toHaveCount(0);

  // 図を表で読むと、記録の間隔も表になる
  await feature.locator('[data-figure-table-switch]').click();
  await expect(feature.locator('[data-run-chart-record] [data-figure-table]')).toBeVisible();

  // 記録を選ばない状態に戻すと、間隔は消える
  await select.selectOption('');
  await expect(feature.locator('[data-run-chart-record-origin]')).toHaveCount(0);
});

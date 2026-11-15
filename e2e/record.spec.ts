import { readFile } from 'node:fs/promises';
import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { useKanaText } from './kana-text-helper.ts';

/**
 * 打鍵の記録の画面のE2E。記録の組み立て・保存の形式・書き出しの往復はunit testが持つので、ここでは画面の配線を見る:
 * 実際のキー入力で範囲を打ち、記録を保存でき、一覧に出て、書き出して読み込み直せて、削除できる。
 */

const STORAGE_KEY = 'keydist:keystroke-records';

async function stored(page: Page): Promise<{ version: number; records: { taps?: unknown; gaps: number[]; deltas: number[] }[] } | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, STORAGE_KEY);
}

async function open(page: Page): Promise<void> {
  await useKanaText(page);
  await page.goto('/record');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: '打鍵の記録', level: 1 })).toBeVisible();
}

/** 次に打つキーの表示を読み、打ち終えるまで打つ。 */
async function typeThrough(page: Page): Promise<void> {
  const run = page.locator('[data-record-run="active"]');
  const next = page.locator('[data-record-next] kbd');
  for (let step = 0; step < 600; step += 1) {
    if (!(await run.isVisible())) return;
    const labels = await next.allTextContents().catch(() => []);
    if (labels.length === 0) continue;
    // 同時に押すキーは、まとめて押す
    await page.keyboard.press(labels.map((label) => label.toLowerCase()).join('+'));
    await page.waitForTimeout(20);
  }
  throw new Error('記録が終わらなかった');
}

test('範囲を打って記録を保存し、書き出して読み込み直し、削除できる', { tag: PAGE_TAG }, async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await expect(page.locator('[data-record-empty]')).toBeVisible();

  const start = page.locator('[data-record-start]');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.locator('[data-record-run="active"]')).toBeVisible();
  await typeThrough(page);
  await expect(page.locator('[data-record-pending]')).toBeVisible();

  await page.locator('[data-record-save]').click();
  const rows = page.locator('[data-record-row]');
  await expect(rows).toHaveCount(1);
  const saved = await stored(page);
  expect(saved?.version).toBe(1);
  expect(saved?.records).toHaveLength(1);
  expect(saved?.records[0]?.gaps[0]).toBe(0);
  expect(saved?.records[0]?.gaps.length).toBe(saved?.records[0]?.deltas.length);

  // 再読み込みの後も残る
  await page.reload();
  await waitForHydration(page);
  await expect(rows).toHaveCount(1);

  // 書き出して、削除して、読み込み直すと、同じ記録が戻る
  const download = page.waitForEvent('download');
  await page.locator('[data-record-export]').click();
  const file = await (await download).path();
  await page.getByRole('button', { name: /の記録を削除/ }).click();
  await expect(rows).toHaveCount(0);
  await page.locator('[data-record-import-input]').setInputFiles(file);
  await expect(rows).toHaveCount(1);
  expect(await stored(page)).toEqual(saved);
  expect(JSON.parse(await readFile(file, 'utf8')).format).toBe('keydist-keystroke-records');

  await page.getByRole('button', { name: /の記録を削除/ }).click();
  await expect(rows).toHaveCount(0);
});

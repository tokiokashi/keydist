import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { installTimerCapture, type RaceWindow } from './text-timer-capture-helper.ts';

/**
 * 組み込みテキストを書き換えた直後の打鍵が、複製を2つ作らず1つに書かれることの回帰テスト。
 *
 * 本文の書き込みは打鍵から`DEFAULT_DEBOUNCE_MS`だけ間引いてから行う。そのタイマーが書き込む経路はReactのイベントの外なので、
 * 描画が次のタスクまで遅れる。その間に届いた打鍵は描画前の宛先（組み込み）を持っていて、
 * 別の複製を作り、打鍵の1つが消えていた。タイマーは手で撃って、書き込みと次の打鍵の間を
 * 描画を挟まずに詰める（挟む場合も確かめる）。
 */

async function setup(page: Page): Promise<void> {
  await installTimerCapture(page);
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
}

async function storedTexts(page: Page): Promise<{ id: string; text: string }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? [] : (JSON.parse(raw) as { texts: { id: string; text: string }[] }).texts;
  });
}

test('複製ができた直後・描画の前に打った文字は、描画の後に打っても消えない', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
  // タイマーの書き込みで複製ができ、描画の前にbを打つ。
  const firedFirst = await page.evaluate(() => {
    const w = window as unknown as RaceWindow;
    const fired = w.__fire();
    w.__type('b');
    return fired;
  });
  expect(firedFirst).toBeGreaterThanOrEqual(1);
  // 選択が複製へ移った描画を待ってからcを打つ。
  await expect(page.getByLabel('テキストを選ぶ')).toHaveValue(/^user:/);
  await page.evaluate(() => (window as unknown as RaceWindow).__type('c'));
  const firedSecond = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedSecond).toBeGreaterThanOrEqual(1);

  const body = page.getByLabel('テキスト', { exact: true });
  await expect(body).toHaveValue(/abc$/);
  await expect.poll(async () => (await storedTexts(page)).map((t) => t.text.slice(-3))).toEqual(['abc']);
});

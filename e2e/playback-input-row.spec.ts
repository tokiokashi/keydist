import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';

/**
 * 打鍵再生の「入力:」の行。打ち終えた入力の欄が固定の幅を持ち、入力単位ごとの文字の数や字の幅が
 * 違っても、今の入力（下線）の1文字目の横の位置が動かないことを確かめる。
 */

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const seek = (page: Page) => feature(page).locator('[data-playback-seek]');
const current = (page: Page) => feature(page).locator('.playback-input-current');
const row = (page: Page) => feature(page).locator('[data-playback-history]');

// 拗音（1単位が2文字）と、英字・数字・半角記号を混ぜる。欄に入る数を超える長さにする
const TEXT = 'きょうabc!?しゅくだい12+3おちゃxyz,きょうabc!?しゅくだい45-6おちゃxyz.'.repeat(2);

async function openWithText(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/standalone/playback');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const panel = await openTextChip(page);
  await panel.getByLabel('テキスト', { exact: true }).fill(TEXT);
  // 編集は少し遅れて反映されるので、チップの文字数が変わるのを待ってから閉じる
  await expect(page.locator('.context-bar button.text-chip .text-chip-count')).toHaveText(`${[...TEXT].length}字`, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(row(page).locator('.playback-input-planned').first()).toBeAttached({ timeout: 10_000 });
  await goTo(page, 1);
  await expect(row(page)).toContainText('きょ', { timeout: 10_000 });
}

async function total(page: Page): Promise<number> {
  return Number(await seek(page).getAttribute('max'));
}

async function goTo(page: Page, position: number) {
  await seek(page).fill(String(position));
  await expect(feature(page).locator('[data-playback-position]')).toContainText(`${position} /`);
}

/** 行を左から読んだ、打ち終えた入力・今の入力・この後の入力の文字。隠れた左側も含む。 */
async function readRow(page: Page) {
  return row(page).evaluate((element) => {
    const segments = [...element.querySelectorAll('.playback-input-segment')];
    return segments.map((e) => ({
      kind: /playback-input-(completed|current|planned)/.exec(e.className)![1],
      text: e.textContent ?? '',
    }));
  });
}

test('今の入力の1文字目の横の位置が、打ち終えた入力の有無・多さによらず同じ', async ({ page }) => {
  await openWithText(page, 1200);
  const last = await total(page);
  expect(last).toBeGreaterThan(100);

  const xs: number[] = [];
  const counts: number[] = [];
  // 1打鍵目（打ち終えた入力が無い）から、欄が埋まって溢れる先まで、1打鍵ごとに測る
  for (let position = 1; position <= last; position++) {
    await goTo(page, position);
    xs.push((await current(page).boundingBox())!.x);
    counts.push((await readRow(page)).filter((segment) => segment.kind === 'completed').length);
  }
  console.log(`MEASURE x=${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)} completedMax=${Math.max(...counts)}`);
  // 打ち終えた入力が無い・欄に満たない・欄から溢れる、のすべてを通っている
  expect(counts[0]).toBe(0);
  expect(Math.max(...counts)).toBeGreaterThanOrEqual(20);
  expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(0.5);
});

test('打ち終えた入力・今の入力・この後の入力が、テキストの順に並ぶ', async ({ page }) => {
  await openWithText(page, 1200);
  await goTo(page, 30);
  const segments = await readRow(page);
  const kinds = segments.map((segment) => segment.kind);
  const firstCurrent = kinds.indexOf('current');
  expect(kinds.filter((kind) => kind === 'current')).toHaveLength(1);
  expect(kinds.slice(0, firstCurrent).every((kind) => kind === 'completed')).toBe(true);
  expect(kinds.slice(firstCurrent + 1).every((kind) => kind === 'planned')).toBe(true);
  // 並べた文字は、テキストの一続きの部分になる
  expect(TEXT).toContain(segments.map((segment) => segment.text).join(''));
});

test('狭いペインの幅でも、今の入力が見える', async ({ page }) => {
  await openWithText(page, 360);
  const last = await total(page);
  for (const position of [1, 12, 30, last]) {
    await goTo(page, position);
    const box = (await current(page).boundingBox())!;
    const rowBox = (await row(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  }
});

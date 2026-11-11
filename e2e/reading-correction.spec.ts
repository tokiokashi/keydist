import { expect, test, PAGE_TAG, type Page } from './fixtures.ts';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 読みを直す画面（文脈バーの読みのチップ）の主な操作。同じ表記の語のうち1つだけの読みを場所ごとに直し、
 * 打鍵再生に出る読みが変わり、直しが1語の単位（「1語を直し済み」）で数えられること、ページを開き直しても直しが残ることを見る。
 * 当て方と見つけ直しの規則はunit test（`word-reading.test.ts`）が固定している。
 */

// 同じ表記「今日」が2回現れる。辞書の読みはどちらも「きょう」
const TEXT = '今日は雨。今日は雪。';

async function setText(page: Page, text: string): Promise<void> {
  const panel = await openTextChip(page);
  await panel.getByLabel('テキスト', { exact: true }).fill(text);
  await expect(page.locator('.context-bar button.text-chip .text-chip-count')).toHaveText(`${[...text].length}字`, { timeout: 10_000 });
  await page.keyboard.press('Escape');
}

async function openReadingEditor(page: Page) {
  const chip = page.locator('[data-reading-chip]');
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  const dialog = page.getByRole('dialog', { name: '読みの確認と修正' });
  await expect(dialog.locator('[data-reading-list]')).toBeVisible({ timeout: 30_000 });
  return dialog;
}

const playbackRow = (page: Page) => page.locator('[data-react-feature="playback"] [data-playback-history]');

async function openAndText(page: Page): Promise<void> {
  await page.goto('/analyzer/playback?romajiInput=false');
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
  await setText(page, TEXT);
  await expect(playbackRow(page)).toContainText('きょうは', { timeout: 30_000 });
}

test('同じ表記の語のうち1つだけの読みを場所ごとに直すと、その語の読みだけが変わる', { tag: PAGE_TAG }, async ({ page }) => {
  await openAndText(page);
  const dialog = await openReadingEditor(page);
  await dialog.locator('[data-reading-places-toggle="今日"]').click();
  const first = dialog.locator('[data-reading-place="0"]');
  await first.getByRole('textbox').fill('こんにち');
  await first.getByRole('button', { name: '直す' }).click();

  // 直した場所だけが直し済みになり、もう一方は辞書の読みのまま
  await expect(first.locator('[data-reading-place-current]')).toHaveText('こんにち');
  await expect(dialog.locator('[data-reading-place="1"] [data-reading-place-current]')).toHaveText('きょう');
  await expect(page.locator('[data-reading-chip]')).toContainText('1語を直し済み');
  await page.keyboard.press('Escape');
  await expect(playbackRow(page)).toContainText('こんにち', { timeout: 30_000 });
});

test('場所ごとの直しは、ページを開き直しても残る', async ({ page }) => {
  await openAndText(page);
  const dialog = await openReadingEditor(page);
  await dialog.locator('[data-reading-places-toggle="今日"]').click();
  const first = dialog.locator('[data-reading-place="0"]');
  await first.getByRole('textbox').fill('こんにち');
  await first.getByRole('button', { name: '直す' }).click();
  await expect(page.locator('[data-reading-chip]')).toContainText('1語を直し済み');

  await page.reload();
  await waitForHydration(page);
  await expect(playbackRow(page)).toContainText('こんにち', { timeout: 30_000 });
  await expect(page.locator('[data-reading-chip]')).toContainText('1語を直し済み');
});

import { expect, test, type Page } from './fixtures.ts';

/**
 * 英語のテキストを選んだ時に、数える単位の呼び名が「字」になる配線のE2E。
 * 呼び名を作る関数ごとの出し分けはunit test（`unit-words.test.ts`）で固定しているので、
 * ここでは、言語を画面へ渡す経路（`SetAnalyzerPane`と`SingleAnalyzerPane`が`TextLanguageProvider`へ渡す言語）を通って、
 * 比較表の見出し・散布図の軸名・打鍵再生の速さの単位に「字」が出ることだけを見る。
 * 検査するのは見出し・軸名・単位の要素で、入力変換の説明のように英語のテキストでも「かな」を含んでよい文言は見ない。
 */

/**
 * 全体の検査の共通の短い漢字入り本文（`fixtures.ts`）ではなく、かなを含まない短い英文を使う。
 * かなを含まない本文は、テキストの言語が英語と判定される。
 */
test.use({ shortText: false });

const ENGLISH_TEXT = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ id, text }) => {
      localStorage.setItem('keydist:text-library', JSON.stringify({ version: 1, texts: [{ id, name: 'English sample', text }] }));
      localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'user', id } }));
      localStorage.setItem(
        'keydist:multi-target-selection',
        JSON.stringify({
          version: 1,
          targets: [
            { kind: 'layout', layoutId: 'qwerty' },
            { kind: 'layout', layoutId: 'dvorak' },
            { kind: 'layout', layoutId: 'colemak-dh' },
          ],
          colorSlots: {},
        }),
      );
    },
    { id: 'english-sample', text: ENGLISH_TEXT },
  );
});

const feature = (page: Page, name: string) => page.locator(`[data-react-feature="${name}"]`);

test('比較表の見出しは、英語のテキストで「字」になり「かな」が出ない', async ({ page }) => {
  await page.goto('/analyzer/comparison');
  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  const headers = (await table.locator('thead th').allInnerTexts()).map((text) => text.trim());
  expect(headers).toContain('u/字');
  expect(headers).toContain('アクション数/字');
  expect(headers.filter((text) => text.includes('かな'))).toEqual([]);
});

test('散布図の軸名と凡例は、英語のテキストで「字」になり「かな」が出ない', async ({ page }) => {
  await page.goto('/analyzer/scatter');
  const scatter = feature(page, 'scatter');
  await expect(scatter.locator('[data-scatter-point]')).toHaveCount(3, { timeout: 15_000 });
  await expect(scatter.locator('[data-scatter-x-title]')).toHaveText('アクション数/字');
  await expect(scatter.locator('[data-scatter-y-title]')).toHaveText('距離/アクション（u）');
  await expect(scatter.locator('[data-scatter-legend-contour]')).toHaveText('1字あたりの距離（u）');
});

test('打鍵再生の速さの単位は、英語のテキストで「字/秒」になり「かな」が出ない', async ({ page }) => {
  await page.goto('/analyzer/playback');
  const playback = feature(page, 'playback');
  await expect(playback).toBeVisible({ timeout: 10_000 });
  const rates = playback.locator('[data-playback-overall-rates]');
  await expect(rates).toContainText('字/秒');
  await expect(rates).not.toContainText('かな');
  const heading = playback.locator('.playback-rate-heading');
  await expect(heading).toHaveText('字/秒・アクション/秒の平均推移');
});

import { expect, PAGE_TAG, test } from './fixtures.ts';
import { openTextChip } from './context-bar-helper.ts';
import { useKanaText } from './kana-text-helper.ts';

test('同梱のテキストは選んだ時に取得し、出典とライセンスが出て、そのテキストで測れる', { tag: PAGE_TAG }, async ({ page }) => {
  await useKanaText(page);
  // 本文の取得。開発サーバーでは `?raw` の付いたモジュール、公開物では独立した `.txt` のファイル。場所の一覧を読む `?url` は数えない
  const bodyRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/corpus/') || url.endsWith('.txt') || url.includes('.txt?')) {
      if (!url.includes('url') && !url.endsWith('.ts') && !url.endsWith('.json') && !url.includes('json?')) bodyRequests.push(url);
    }
  });
  await page.goto('/analyzer/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  // 選ぶまでは、同梱のテキストの本文を取得しない
  expect(bodyRequests).toEqual([]);

  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ').selectOption('builtin:builtin:ja.wiki-science');
  await expect(page.locator('.context-bar button.text-chip .text-chip-count')).toHaveText(/^[\d,]{5,}字$/, { timeout: 10_000 });
  // 選んだテキストだけを取得する
  expect(bodyRequests.filter((url) => url.includes('wiki-science'))).not.toHaveLength(0);
  expect(bodyRequests.filter((url) => !url.includes('wiki-science'))).toEqual([]);
  await expect(panel.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeVisible();
  await panel.locator('summary').click();
  await expect(panel.getByRole('link', { name: '光合成' })).toBeVisible();
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 60_000 });
});

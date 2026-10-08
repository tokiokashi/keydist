import { expect, test } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * スマホ幅では文脈バーの狭い表示がチップの文字数を見た目から省くので、開いたテキストの欄にも同じ文字数が出る。
 * 数え方（コードポイント数）の検査はunit test（`char-count.test.ts`）に任せ、ここでは配線と表示だけを見る。
 */
test.use({ viewport: { width: 390, height: 844 } });

test('スマホ幅でテキストのチップを開くと、欄の近くに本文の文字数が見えて、チップと同じ数になる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  const chip = page.locator('.context-bar button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  const panel = await openTextChip(page);
  const count = panel.locator('.text-editor-count');
  await expect(count).toBeVisible();

  // 結合文字（か + 結合用濁点）は2コードポイント。書記素で数えると1字になるので、コードポイント数で揃うかを見る。
  await panel.getByLabel('テキスト', { exact: true }).fill('あいうえが');
  await expect(count).toHaveText('6字', { timeout: 10_000 });
  await expect(chip.locator('.text-chip-count')).toHaveText('6字', { timeout: 10_000 });
});

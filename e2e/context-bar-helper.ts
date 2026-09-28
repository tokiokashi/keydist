import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 文脈バーのテキストのチップを開き、選択・編集の欄を返す（開いていればそのまま返す）。
 * テキストの選択・本文・名前・複製・削除は、チップを開いた時だけ出る（docs/architecture.md「文脈バー」）。
 */
export async function openTextChip(page: Page): Promise<Locator> {
  const panel = page.getByRole('dialog', { name: 'テキストの選択と編集' });
  if (!(await panel.isVisible())) {
    await page.locator('.context-bar button.text-chip').click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

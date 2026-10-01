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

/**
 * 条件のモーダルで既定の物理配列を選び、モーダルを閉じる。
 * 既定の物理配列は文脈バーではなく、ペインの条件のモーダル（全体のレベルの行）にある。
 * Workspaceのように条件の要約が複数あっても、全体の値なのでどのペインから開いても同じ。
 */
export async function setDefaultShape(page: Page, shapeId: string): Promise<void> {
  await page.locator('.pane-condition-trigger').first().click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('既定の物理配列', { exact: true }).selectOption(shapeId);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
}

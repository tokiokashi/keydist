import { expect, type Locator, type Page } from '@playwright/test';

/**
 * ペインの見出しの「解析設定」から小窓を開き、その小窓を返す（開いていればそのまま返す）。
 * 解析設定の入力はペインの本体ではなく小窓にある（docs/architecture.md「ペイン」）。
 */
export async function openSettings(page: Page): Promise<Locator> {
  const window = page.locator('[data-settings-window="true"]');
  if (!(await window.isVisible())) {
    await page.getByRole('button', { name: '解析設定', exact: true }).click();
  }
  await expect(window).toBeVisible();
  return window;
}

/** 集合を見るAnalyzerの対象の選択（見出しの「対象」から開く）を開いて返す。 */
export async function openTargetSelection(page: Page): Promise<Locator> {
  const panel = page.getByRole('region', { name: '対象の選択' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: /^対象: / }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

import { expect, type Locator, type Page } from '@playwright/test';

/** 図の見出し行のボタンで、その図の表示の調整を見出しの直下へ開いて返す（開いていればそのまま返す）。 */
export async function openFigureSettings(page: Page, figure: 'Keyboard Flow' | 'Relative vectors'): Promise<Locator> {
  const panel = page.getByRole('group', { name: `${figure}の表示` });
  // 解析設定の小窓は図の上に浮くので、開いていれば先に閉じる（図のそばの操作を覆うため）。
  const settingsWindow = page.locator('[data-settings-window="true"]');
  if (await settingsWindow.isVisible()) {
    await settingsWindow.getByRole('button', { name: '解析設定を閉じる' }).click();
    await expect(settingsWindow).toHaveCount(0);
  }
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: `${figure}の表示`, exact: true }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 図の見出し行のボタンで、その図の表示の調整の小窓を開いて返す（開いていればそのまま返す）。
 * 小窓はbodyへ出るので、ペインや図の中には絞らない。Workspaceでは小窓の名前にペイン名が付くので、名前は前方一致で探す。
 */
export async function openFigureSettings(page: Page, figure: 'Keyboard Flow' | 'Relative vectors'): Promise<Locator> {
  const panel = figureSettingsWindow(page, figure);
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

/** 図の表示の小窓。開いていなければ何も指さない。 */
export function figureSettingsWindow(page: Page, figure: string): Locator {
  return page.getByRole('dialog', { name: `${figure}の表示` });
}

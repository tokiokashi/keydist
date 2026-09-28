import { expect, test } from '@playwright/test';

/**
 * Bigram Flowの図の読み方（#641）。Keyboard FlowとRelative vectorsの小見出しの横にⓘがあり、
 * 開いた人だけが読み方を読める。常には出さない。
 */
test('Keyboard FlowとRelative vectorsの横のⓘで図の読み方を開ける', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  // 開くまでは読み方を出さない。
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(flow).not.toContainText('始点が薄く');

  const keyboardFlow = flow.getByRole('button', { name: 'Keyboard Flowの説明' });
  await keyboardFlow.click();
  await expect(page.getByRole('tooltip')).toContainText('太さが回数');
  await expect(page.getByRole('tooltip')).toContainText('始点が薄く終点が濃い');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  const relative = flow.getByRole('button', { name: 'Relative vectorsの説明' });
  await relative.click();
  await expect(page.getByRole('tooltip')).toContainText('外周は移動方向の分布');
  await expect(page.getByRole('tooltip')).toContainText('白い線は平均の移動');
  // 出したままの説明は外を押すと閉じる。
  await page.locator('h1').click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

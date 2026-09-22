import { expect, test } from '@playwright/test';

test('Bigram Flow filters finger pairs and unlocks vector analysis', async ({ page }) => {
  await page.goto('/flow');

  await expect(page.getByRole('heading', { name: 'Bigram Flow' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'キーボード上のbigramベクトル' })).toBeVisible();
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();

  await page.getByRole('button', { name: '中' }).click();
  await expect(page.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();

  await page.getByRole('button', { name: '人' }).click();
  await expect(page.getByRole('heading', { name: '中 + 人' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'left hand relative movement' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'right hand direction distribution' })).toBeVisible();
  await expect(page.getByRole('button', { name: '小' })).toBeDisabled();

  await page.getByRole('button', { name: 'Within-hand' }).click();
  await expect(page.getByText('反対手を飛ばした手内bigram')).toBeVisible();

  await page.getByRole('button', { name: '中' }).click();
  await expect(page.getByRole('button', { name: '小' })).toBeEnabled();
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();
});

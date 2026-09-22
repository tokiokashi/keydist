import { expect, test } from '@playwright/test';

test('Bigram Flow filters finger pairs and unlocks vector analysis', async ({ page }) => {
  await page.goto('/flow');

  const feature = page.locator('.flow-feature');
  await expect(feature).toHaveAttribute('data-flow-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Bigram Flow' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'キーボード上のbigramベクトル' })).toBeVisible();
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();

  const flowEdges = page.locator('[data-flow-edge="true"]');
  const edgeCount = await flowEdges.count();
  expect(edgeCount).toBeGreaterThan(10);

  const firstFrom = (await flowEdges.first().getAttribute('data-from-keys'))?.split('+')[0];
  expect(firstFrom).toBeTruthy();
  await page.locator(`[data-key-id="${firstFrom}"]`).hover();
  await expect.poll(async () => flowEdges.count()).toBeLessThan(edgeCount);
  await expect(page.locator('.flow-key-badge')).not.toHaveCount(0);
  await page.locator('.flow-stage').hover({ position: { x: 4, y: 4 } });
  await expect.poll(async () => flowEdges.count()).toBe(edgeCount);

  await page.getByRole('button', { name: '中' }).click();
  await expect(page.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();

  await page.getByRole('button', { name: '人' }).click();
  await expect(page.getByRole('heading', { name: '中 + 人' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'left hand movement profile' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'right hand movement profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: '小' })).toBeDisabled();

  await page.getByRole('button', { name: 'Within-hand' }).click();
  await expect(page.getByText('反対手を飛ばした手内bigram')).toBeVisible();

  await page.getByRole('button', { name: '中' }).click();
  await expect(page.getByRole('button', { name: '小' })).toBeEnabled();
  await expect(page.getByText('指を2本選ぶと解放')).toBeVisible();
});

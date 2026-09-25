import { expect, test } from '@playwright/test';
import { gotoAnalyzer } from './analyzer-helper.ts';

test('Bigram Flow is React-owned and follows the current Analyzer detail result', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();
  await expect(flow).toHaveAttribute('data-layout-id', /.+/);
  await expect(flow).toHaveAttribute('data-geometry-id', /.+/);

  const detailLayout = page.locator('#detail-layout');
  const nextLayout = await detailLayout.locator('option').nth(1).getAttribute('value');
  if (nextLayout) {
    await detailLayout.selectOption(nextLayout);
    await expect(flow).toHaveAttribute('data-layout-id', nextLayout);
  }

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  await flow.getByRole('button', { name: '人', exact: true }).click();
  await expect(flow.getByText('1指選択では、その指自身のキー間移動だけを表示する。')).toBeVisible();
});

test('Bigram Flow hover keeps connection DOM mounted', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();
  const edges = flow.locator('[data-flow-edge="true"]');
  const countBefore = await edges.count();
  expect(countBefore).toBeGreaterThan(0);

  const key = flow.locator('.flow-key').first();
  await key.hover();
  await expect.poll(async () => edges.count()).toBe(countBefore);
});


test('Bigram Flow view controls switch line scale and layer order locally', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();

  const lineScale = flow.getByLabel('紐の太さのスケール');
  await expect(lineScale).toHaveValue('linear');
  await lineScale.selectOption('sqrt');
  await expect(flow).toHaveAttribute('data-line-scale', 'sqrt');
  await lineScale.selectOption('log');
  await expect(flow).toHaveAttribute('data-line-scale', 'log');

  const layerOrder = flow.getByLabel('紐の重ね順');
  await expect(layerOrder).toHaveValue('weight');
  await layerOrder.selectOption('same-hand-top');
  await expect(flow).toHaveAttribute('data-layer-order', 'same-hand-top');
  await layerOrder.selectOption('cross-hand-top');
  await expect(flow).toHaveAttribute('data-layer-order', 'cross-hand-top');
});

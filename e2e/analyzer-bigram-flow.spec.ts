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

async function edgeHandOrder(flow: import('@playwright/test').Locator): Promise<string[]> {
  return flow.locator('.flow-vector-layer [data-flow-edge]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-flow-hand') ?? ''),
  );
}

test('layer order controls where cross-hand edges land in DOM paint order', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();

  const initialOrder = await edgeHandOrder(flow);
  const isCross = (hand: string) => hand === 'cross';
  // 前提: same-hand/cross-hand双方のedgeが実在すること。無ければ以下の並び検証は自明になり無意味。
  expect(initialOrder.some(isCross)).toBe(true);
  expect(initialOrder.some((hand) => !isCross(hand))).toBe(true);

  const layerOrder = flow.getByLabel('紐の重ね順');

  await layerOrder.selectOption('cross-hand-top');
  await expect(flow).toHaveAttribute('data-layer-order', 'cross-hand-top');
  await expect.poll(async () => {
    const order = await edgeHandOrder(flow);
    const lastNonCross = order.findLastIndex((hand) => !isCross(hand));
    const firstCross = order.findIndex(isCross);
    // SVGは後勝ちなので「後ろ=前面」。cross-hand-topはcrossが全て非crossより後ろに来る。
    return firstCross > lastNonCross;
  }).toBe(true);

  await layerOrder.selectOption('same-hand-top');
  await expect(flow).toHaveAttribute('data-layer-order', 'same-hand-top');
  await expect.poll(async () => {
    const order = await edgeHandOrder(flow);
    const lastCross = order.findLastIndex(isCross);
    const firstNonCross = order.findIndex((hand) => !isCross(hand));
    return firstNonCross > lastCross;
  }).toBe(true);
});

test('sqrt line scale widens a below-max edge more than linear, but leaves the max edge unchanged', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();

  const edges = flow.locator('.flow-vector-layer [data-flow-edge]');
  const weights = await edges.evaluateAll(
    (els) => els.map((el) => Number(el.getAttribute('data-flow-weight'))),
  );
  const maxWeight = Math.max(...weights);
  const minIndex = weights.reduce(
    (best, w, i) => (w < weights[best] ? i : best),
    weights.findIndex((w) => w < maxWeight),
  );
  expect(weights[minIndex]).toBeLessThan(maxWeight);
  const maxIndex = weights.indexOf(maxWeight);

  const strokeWidthOf = (index: number) => edges.nth(index).getAttribute('stroke-width').then(Number);

  const lineScale = flow.getByLabel('紐の太さのスケール');
  await expect(lineScale).toHaveValue('linear');
  const minLinear = await strokeWidthOf(minIndex);
  const maxLinear = await strokeWidthOf(maxIndex);

  await lineScale.selectOption('sqrt');
  await expect(flow).toHaveAttribute('data-line-scale', 'sqrt');
  await expect.poll(() => strokeWidthOf(minIndex)).toBeGreaterThan(minLinear);
  await expect.poll(() => strokeWidthOf(maxIndex)).toBeCloseTo(maxLinear, 5);
});

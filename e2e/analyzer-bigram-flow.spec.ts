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

test('per-key hover scale widens the local max-weight outgoing edge to the global max width', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();

  const hoverScaleToggle = flow.locator('.flow-checkbox-row input[type="checkbox"]');
  await expect(hoverScaleToggle).toBeChecked();
  await expect(flow).toHaveAttribute('data-hover-scale', 'key');

  const edges = flow.locator('.flow-vector-layer [data-flow-edge]');
  const edgeData = await edges.evaluateAll((els) =>
    els.map((el) => ({
      fromKeys: (el.getAttribute('data-from-keys') ?? '').split('+').filter(Boolean),
      weight: Number(el.getAttribute('data-flow-weight')),
    })));

  const globalMax = Math.max(...edgeData.map((edge) => edge.weight));
  const keyIds = [...new Set(edgeData.flatMap((edge) => edge.fromKeys))];

  let chosenKey: string | undefined;
  let chosenWeight = -1;
  let chosenIndex = -1;
  for (const keyId of keyIds) {
    const outgoing = edgeData
      .map((edge, index) => ({ ...edge, index }))
      .filter((edge) => edge.fromKeys.includes(keyId));
    if (outgoing.length < 2) continue;
    if (new Set(outgoing.map((edge) => edge.weight)).size < 2) continue;
    const localMax = Math.max(...outgoing.map((edge) => edge.weight));
    if (localMax >= globalMax) continue;
    chosenKey = keyId;
    chosenWeight = localMax;
    chosenIndex = outgoing.find((edge) => edge.weight === localMax)!.index;
    break;
  }

  // 前提: ≥2本の出力edge・異なるweight・局所最大 < 全体最大を満たすキーが実在すること。
  expect(chosenKey, 'no key satisfies the precondition for this scenario').toBeDefined();
  expect(chosenWeight).toBeLessThan(globalMax);

  const key = flow.locator(`.flow-key[data-key-id="${chosenKey}"]`);
  const maxEdgeWidth = () => edges.nth(chosenIndex).getAttribute('stroke-width').then(Number);

  await key.hover();
  await expect.poll(maxEdgeWidth).toBeCloseTo(6.55, 5);

  await hoverScaleToggle.uncheck();
  await expect(flow).toHaveAttribute('data-hover-scale', 'global');
  await key.hover();
  await expect.poll(maxEdgeWidth).toBeLessThan(6.55);
});

test('Relative vectors show all vectors when no finger is selected', async ({ page }) => {
  await gotoAnalyzer(page);

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();

  // 前提: 指は未選択のまま（起動直後の既定状態）。
  const fingerButtons = flow.locator('.flow-finger-buttons button[aria-pressed="true"]');
  expect(await fingerButtons.count()).toBe(0);

  await expect(flow.getByText('全指')).toBeVisible();

  const plots = flow.locator('.flow-profile-panel svg');
  await expect(plots).toHaveCount(2);
  for (const index of [0, 1]) {
    const lines = plots.nth(index).locator('.relative-vector');
    await expect.poll(() => lines.count()).toBeGreaterThan(0);
  }
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

import { expect, test } from '@playwright/test';

test('standalone Bigram Flow connects the Gate 1 vertical slice and keeps ViewConfig in the URL', async ({ page }) => {
  await page.goto('/analyzer/flow?mode=ja&layout=qwerty');

  await expect(page.locator('.app-header')).toBeVisible();

  const host = page.locator('[data-analysis-view="bigram-flow"]');
  const flow = page.locator('[data-react-feature="bigram-flow"]');

  await expect(host).toHaveAttribute('data-binding-status', 'ok');
  await expect(host).toHaveAttribute('data-binding-kind', 'layout');
  await expect(flow).toHaveAttribute('data-layout-id', 'qwerty');

  const targetRevision = await host.getAttribute('data-session-target-revision');
  const distanceRevision = await host.getAttribute('data-session-distance-revision');

  await flow.getByRole('button', { name: 'Within-hand' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('source')).toBe('within-hand');
  await expect(flow.getByText('反対手を飛ばした手内bigram')).toBeVisible();

  await flow.getByLabel('距離表示').selectOption('fixed');
  await expect.poll(() => new URL(page.url()).searchParams.get('movementScale')).toBe('fixed');

  await expect(host).toHaveAttribute('data-session-target-revision', targetRevision!);
  await expect(host).toHaveAttribute('data-session-distance-revision', distanceRevision!);
  await expect(flow).toHaveAttribute('data-layout-id', 'qwerty');
});

test('standalone Bigram Flow follows focus when no pin is present', async ({ page }) => {
  await page.goto('/analyzer/flow');

  const host = page.locator('[data-analysis-view="bigram-flow"]');
  await expect(host).toHaveAttribute('data-binding-status', 'ok');
  await expect(host).toHaveAttribute('data-binding-kind', 'focused-layout');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveAttribute(
    'data-layout-id',
    'qwerty',
  );
});

test('a pin outside the Session selection stays unavailable until explicitly added', async ({ page }) => {
  await page.goto('/analyzer/flow?mode=ja&layout=shingeta');

  const host = page.locator('[data-analysis-view="bigram-flow"]');
  await expect(host).toHaveAttribute('data-binding-status', 'unavailable');
  await expect(host).toHaveAttribute('data-binding-reason', 'not-selected');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveCount(0);

  await host.getByRole('button', { name: '選択に追加' }).click();

  await expect(host).toHaveAttribute('data-binding-status', 'ok');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveAttribute(
    'data-layout-id',
    'shingeta',
  );
  expect(new URL(page.url()).searchParams.get('layout')).toBe('shingeta');
});

test('a pin for another mode does not mutate the Session mode', async ({ page }) => {
  await page.goto('/analyzer/flow?mode=en&layout=qwerty');

  const host = page.locator('[data-analysis-view="bigram-flow"]');
  await expect(host).toHaveAttribute('data-binding-status', 'unavailable');
  await expect(host).toHaveAttribute('data-binding-reason', 'other-mode');
  await expect(host.getByRole('button', { name: '選択に追加' })).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { targetButton, toggleTarget } from './pane-helper.ts';
import { afterFrames } from './settle-helper.ts';
import { holdWorker, installWorkerHold, releaseWorker } from './worker-hold-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 状態のバッジを点で出している時の見た目（個別画面の名前の行）。
 * 計算中（直前の結果を表示）は青い輪が回り、失敗は赤の塗りつぶしで動かない。形と動きの両方で分かれる。
 * 計算中の状態は、計算の依頼を保留して作る（計算の速さに頼らない。`worker-hold-helper.ts`）。
 */

const STALE_TITLE = '計算中…（直前の結果を表示）';

async function openReady(page: Page, width: number): Promise<void> {
  await installWorkerHold(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
}

/** 直前の結果を残したまま、計算の依頼を保留して、計算中（直前の結果を表示）にする。 */
async function makeStale(page: Page): Promise<void> {
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(page.locator('.context-bar button.text-chip')).toContainText('英文');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await holdWorker(page);
  const again = await openTextChip(page);
  await again.getByLabel('テキスト', { exact: true }).fill('The quick brown fox jumps over the lazy dog.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'stale', { timeout: 10_000 });
  await expect(page.locator('.pane-frame-name .pane-status-badge')).toHaveAttribute('title', STALE_TITLE);
}

/** 色（`rgb(r, g, b)`）が青みの強い色か。テーマのアクセントは青（bがrより十分大きい）。 */
function isBlue(color: string): boolean {
  const [r, , b] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return b - r > 80;
}

/** 名前の行の点の、描画の値（アニメーションの有無・色・形）。 */
async function dotState(page: Page) {
  return page.locator('.pane-frame-name .pane-status-badge').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      asText: element.hasAttribute('data-text'),
      title: element.getAttribute('title'),
      text: element.querySelector('.pane-status-badge-text')?.textContent ?? null,
      running: element.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName),
      borderStyle: style.borderRightStyle,
      borderTop: style.borderTopColor,
      borderRight: style.borderRightColor,
      background: style.backgroundColor,
      transform: style.transform,
      // 回転の途中で外側の箱は広がるので、レイアウトの幅（offsetWidth）で大きさを見る
      width: (element as HTMLElement).offsetWidth,
    };
  });
}

for (const width of [360, 390]) {
  test(`スマホ幅（${width}px）: 計算中の点は青い輪が回り、失敗の点（赤・動かない）と形と動きで分かれる`, async ({ page }) => {
    await openReady(page, width);
    await makeStale(page);

    const stale = await dotState(page);
    expect(stale.asText).toBe(false);
    expect(stale.width).toBeLessThanOrEqual(10);
    // 状態の文は読み上げ（隠した文字）とtitleに残る
    expect(stale.text).toBe(STALE_TITLE);
    // 回っている（アニメーションが走っている）。輪の切れ目は上だけ透明で、他の三辺は青い
    expect(stale.running).toContain('pane-status-spin');
    expect(stale.borderStyle).toBe('solid');
    expect(stale.borderTop).toBe('rgba(0, 0, 0, 0)');
    expect(isBlue(stale.borderRight)).toBe(true);
    expect(stale.background).toBe('rgba(0, 0, 0, 0)');
    // 回転の途中の値が変わる（止まっていない）
    const before = stale.transform;
    await afterFrames(page, 4);
    expect((await dotState(page)).transform).not.toBe(before);

    // 計算が済めば点は消える
    await releaseWorker(page);
    await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
    await expect(page.locator('.pane-status-badge')).toHaveCount(0);
  });
}

// 失敗の文字（「失敗」）は360pxでだけ点になる（390pxでは文字で出る）。点の形を見るので360pxだけ見る
test('スマホ幅（360px）: 失敗の点は赤の塗りつぶしで、動かない', async ({ page }) => {
  await openReady(page, 360);
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(page.locator('.context-bar button.text-chip')).toContainText('英文');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await toggleTarget(page, 'layout:nicola');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'failed', { timeout: 10_000 });

  const failed = await dotState(page);
  expect(failed.asText).toBe(false);
  expect(failed.title).toBe('失敗');
  expect(failed.running).toEqual([]);
  expect(failed.background).toBe('rgb(214, 51, 63)');
});

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ reducedMotion: 'reduce' });

  test('計算中の点は回らず、切れ目の無い青い輪を静止して出す', async ({ page }) => {
    await openReady(page, 390);
    await makeStale(page);

    const still = await dotState(page);
    expect(still.running).toEqual([]);
    expect(still.transform).toBe('none');
    // 静止しても計算中と分かる形（青い輪）は残り、切れ目は無い
    expect(still.borderStyle).toBe('solid');
    expect(still.borderTop).toBe(still.borderRight);
    expect(isBlue(still.borderTop)).toBe(true);
    expect(still.background).toBe('rgba(0, 0, 0, 0)');
    expect(still.text).toBe(STALE_TITLE);
    await afterFrames(page, 4);
    expect((await dotState(page)).transform).toBe('none');
  });
});

test.describe('ダークテーマ', () => {
  test.use({ colorScheme: 'dark' });

  test('計算中の青い輪は、ダークでも青く見える（回る）', async ({ page }) => {
    await openReady(page, 390);
    await makeStale(page);
    const dark = await dotState(page);
    expect(dark.running).toContain('pane-status-spin');
    expect(dark.borderStyle).toBe('solid');
    expect(isBlue(dark.borderRight)).toBe(true);
  });
});

test.describe('reduced-motionでも点の位置は動かない', () => {
  test.use({ reducedMotion: 'reduce' });

  test('計算中の点の出し入れで、対象ボタンは動かない', async ({ page }) => {
    await openReady(page, 360);
    const before = await targetButton(page).boundingBox();
    expect(before).not.toBeNull();
    await makeStale(page);
    const during = await targetButton(page).boundingBox();
    expect(Math.abs((during?.x ?? -100) - before!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((during?.y ?? -100) - before!.y)).toBeLessThanOrEqual(1);
  });
});

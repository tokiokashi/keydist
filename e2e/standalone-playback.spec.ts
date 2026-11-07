import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';

/**
 * 打鍵再生の個別画面のE2E。時間の決め方・配列図に出す値はunit test（`playback.test.ts`）で固定しているので、
 * ここでは画面の配線（操作・再生位置の表示）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const position = (page: Page) => feature(page).locator('[data-playback-position]');

/** 「3 / 120ステップ」から [3, 120] を読む。 */
async function readPosition(page: Page): Promise<[number, number]> {
  const text = (await position(page).textContent()) ?? '';
  const match = /^(\d+) \/ (\d+)ステップ$/.exec(text.trim());
  expect(match, text).not.toBeNull();
  return [Number(match![1]), Number(match![2])];
}

async function openPlayback(page: Page) {
  await page.goto('/analyzer/playback');
  await expect(page.getByRole('heading', { name: '打鍵再生', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
}

test('1ステップ進む・戻る・シークができ、再生位置が表示される', { tag: PAGE_TAG }, async ({ page }) => {
  await openPlayback(page);
  const [start, total] = await readPosition(page);
  expect(start).toBe(0);
  expect(total).toBeGreaterThan(3);

  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(2);
  // 押したキーは配列図で強調される
  await expect(feature(page).locator('[data-playback-active="true"]').first()).toBeVisible();

  await feature(page).locator('[data-playback-action="back"]').click();
  expect((await readPosition(page))[0]).toBe(1);

  await feature(page).locator('[data-playback-seek]').fill('3');
  expect((await readPosition(page))[0]).toBe(3);
  await feature(page).locator('[data-playback-seek]').fill(String(total));
  expect(await readPosition(page)).toEqual([total, total]);
  // 最後まで進むと、進む操作と再生は押せない
  await expect(feature(page).locator('[data-playback-action="forward"]')).toBeDisabled();
  await expect(feature(page).locator('[data-playback-action="toggle"]')).toBeDisabled();
});

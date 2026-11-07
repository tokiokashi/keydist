import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 個人速度の画面のE2E。測定の計算と保存値の検証はunit testが持つので、ここでは画面の配線を見る:
 * 実際のキー入力で測って保存できる。
 */

const STORAGE_KEY = 'keydist:personal-speed';

async function stored(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, STORAGE_KEY);
}

async function open(page: Page): Promise<void> {
  await page.goto('/personal-speed');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: '個人速度', level: 1 })).toBeVisible();
}

/** 案内の「A」と「B」（ホームキーを続けて打つ項目は「A」だけ）を読み、完了まで交互に打つ。項目が変わったら最初のキーから打ち直す。 */
async function typeThroughRun(page: Page): Promise<void> {
  const run = page.locator('[data-personal-speed-run="active"]');
  const instruction = page.locator('[data-personal-speed-instruction]');
  let lastText = '';
  let index = 0;
  for (let step = 0; step < 400; step += 1) {
    if (!(await run.isVisible())) return;
    const text = (await instruction.textContent({ timeout: 1000 }).catch(() => null)) ?? '';
    if (text === '') continue;
    if (text !== lastText) {
      lastText = text;
      index = 0;
    }
    const keys = [...text.matchAll(/「(.)」/g)].map((match) => match[1] ?? '');
    await page.keyboard.press(keys[index % keys.length] ?? 'a');
    index += 1;
    await page.waitForTimeout(45);
  }
  throw new Error('測定が終わらなかった');
}

test('通常の測定をキー入力で行い、結果が保存される', { tag: PAGE_TAG }, async ({ page }) => {
  // 8本の指それぞれの続け打ちと往復を打つので、通常の測定は打鍵が多い。
  test.setTimeout(90_000);
  await open(page);
  await page.locator('[data-personal-speed-start="normal"]').click();
  await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  await typeThroughRun(page);
  await expect(page.locator('[data-personal-speed-run="active"]')).toHaveCount(0);
  // 知らせは、測ったまとまりの中に出る
  await expect(
    page.locator('#personal-speed-group-normal').getByText('通常の速度、指ごとの同じキーを続けて打つ速さと移動の時間を測って保存しました。'),
  ).toBeVisible();
  await expect(page.locator('[data-personal-speed-empty]')).toHaveCount(0);
  // 測った値は、測ったまとまりの中の行に出る
  await expect(page.locator('#personal-speed-group-normal #personal-speed-actions')).not.toHaveValue('');

  const saved = (await stored(page)) as {
    version: number;
    calibration: {
      actionsPerSecond: number;
      fingerRepeatMs: Record<string, number>;
      fingerMoveMsPerUnit: Record<string, number>;
      fallbackRepeatMs: number;
      fallbackMoveMsPerUnit: number;
    };
  };
  expect(saved.version).toBe(1);
  expect(saved.calibration.actionsPerSecond).toBeGreaterThanOrEqual(0.1);
  expect(saved.calibration.actionsPerSecond).toBeLessThanOrEqual(40);
  expect(Object.keys(saved.calibration.fingerRepeatMs).length).toBeGreaterThan(0);
  expect(Object.keys(saved.calibration.fingerMoveMsPerUnit)).toEqual(Object.keys(saved.calibration.fingerRepeatMs));
  expect(saved.calibration.fallbackRepeatMs).toBeGreaterThanOrEqual(25);
  expect(saved.calibration.fallbackMoveMsPerUnit).toBeGreaterThanOrEqual(0);
  // 同じ指のホームキーを続けて打つ速さは、同手・別指の表の対角に出る
  await expect(page.locator('[id="personal-speed-finger-repeat:LI"]')).not.toHaveValue('');
  await expect(page.locator('[data-personal-speed-start="directional"]')).toBeEnabled();
});

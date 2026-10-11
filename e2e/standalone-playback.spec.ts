import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings, toggleTarget } from './pane-helper.ts';

/**
 * 打鍵再生のE2E。時間の決め方・配列図に出す値はunit test（`playback.test.ts`）で固定しているので、
 * ここでは画面の配線（操作・再生位置の表示・表示設定の反映・解析設定の小窓のEscape）だけを見る。
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
  await page.goto('/standalone/playback');
  await expect(page.getByRole('heading', { name: '打鍵再生', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
}

test('1ステップ進む・戻る・シークができ、再生位置が表示される', async ({ page }) => {
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

test('再生すると位置が進み、一時停止で止まり、停止で先頭へ戻る', async ({ page }) => {
  await openPlayback(page);
  const toggle = feature(page).locator('[data-playback-action="toggle"]');
  await toggle.click();
  await expect(toggle).toContainText('一時停止');
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(0);
  // 再生中は1ステップの移動ができない
  await expect(feature(page).locator('[data-playback-action="forward"]')).toBeDisabled();

  await toggle.click();
  await expect(toggle).toContainText('再生');
  const paused = (await readPosition(page))[0];
  await page.waitForTimeout(1200);
  expect((await readPosition(page))[0]).toBe(paused);

  await feature(page).locator('[data-playback-action="stop"]').click();
  expect((await readPosition(page))[0]).toBe(0);
  await expect(feature(page).locator('[data-playback-action="stop"]')).toBeDisabled();
});

test('表示設定を変えると表示だけが変わり、再生位置は保たれる。解析設定の小窓はEscapeで閉じる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(3);

  const keyboard = feature(page).locator('svg.playback-keyboard');
  const widthBefore = Number(await keyboard.getAttribute('width'));

  const settings = await openSettings(page);
  // 表示設定の4種類の項目
  await expect(settings.getByRole('checkbox', { name: 'Chainの動的表示' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: 'Arpeggioの動的表示' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: '同指移動の動的表示' })).toBeVisible();
  await expect(settings.getByRole('combobox', { name: '押下フィードバック' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: '指位置の準備時間' })).toBeVisible();
  await settings.getByRole('slider', { name: '倍率' }).fill('2');

  // 倍率が変わっても、再生位置は先頭へ戻らない
  await expect.poll(async () => Number(await keyboard.getAttribute('width'))).toBeCloseTo(widthBefore * 2, 3);
  expect((await readPosition(page))[0]).toBe(3);
  await settings.getByRole('checkbox', { name: 'Chainの動的表示' }).check();
  await settings.getByRole('combobox', { name: '押下フィードバック' }).selectOption('bounce');
  expect((await readPosition(page))[0]).toBe(3);

  await settings.press('Escape');
  await expect(page.locator('[data-settings-window="true"]')).toHaveCount(0);
});

test('速度グラフを押すと再生位置が移り、再生位置を示す線が追従する。帯はChain・Arpeggioの表示設定に従う', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  const [, total] = await readPosition(page);
  const chart = feature(page).locator('[data-playback-rate-chart]');
  await expect(chart).toBeVisible();
  await expect(chart.locator('svg')).toHaveAttribute('data-playback-rate-total', String(total));

  // 先頭の線はグラフの左端
  const line = chart.locator('[data-playback-rate-cursor-line]');
  const startX = Number(await line.getAttribute('x1'));

  // グラフの横方向の中央を押すと、総数のおよそ半分へ移る
  const hit = chart.locator('[data-playback-rate-hit]');
  const box = (await hit.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const [moved] = await readPosition(page);
  expect(Math.abs(moved - total / 2)).toBeLessThanOrEqual(1);
  expect(Number(await line.getAttribute('x1'))).toBeGreaterThan(startX);
  await expect(chart.locator('[data-playback-rate-readout]')).toContainText(`${moved}ステップ目、`);

  // 帯は、表示設定で選んだ種類だけ出る
  await expect(chart.locator('[data-playback-rate-band]')).toHaveCount(0);
  const settings = await openSettings(page);
  await settings.getByRole('checkbox', { name: 'Chainの動的表示' }).check();
  await expect(chart.locator('[data-playback-rate-band="chain"]').first()).toBeVisible();
  await expect(chart.locator('[data-playback-rate-band="arpeggio"]')).toHaveCount(0);
  await settings.getByRole('checkbox', { name: 'Arpeggioの動的表示' }).check();
  await expect(chart.locator('[data-playback-rate-band="arpeggio"]').first()).toBeVisible();
  // 表示設定を変えても再生位置は保たれる
  expect((await readPosition(page))[0]).toBe(moved);
});

test('対象を替えて抽出が作り直されると、再生位置は先頭へ戻る', async ({ page }) => {
  await openPlayback(page);
  await feature(page).locator('[data-playback-action="forward"]').click();
  await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(2);
  await toggleTarget(page, 'layout:dvorak');
  await expect.poll(async () => (await readPosition(page))[0]).toBe(0);
});

test('幅390pxでも、倍率を上げてもページは横にはみ出さず、図の領域の中でスクロールできる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/standalone/playback?scale=3');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const figure = feature(page).locator('.playback-figure');
  expect(await figure.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
});

test('Workspaceのペインとして追加でき、ペインごとに独立して再生位置を持つ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: /打鍵再生/ }).click();
  }
  await expect(feature(page)).toHaveCount(2, { timeout: 10_000 });

  const first = feature(page).nth(0);
  const second = feature(page).nth(1);
  await first.locator('[data-playback-action="forward"]').click();
  await first.locator('[data-playback-action="forward"]').click();
  await expect(first.locator('[data-playback-position]')).toContainText(/^2 \//);
  await expect(second.locator('[data-playback-position]')).toContainText(/^0 \//);
});

// ---------------------------------------------------------------------------
// 条件のモーダルの、再生の時間モデルと速度平均の行
// ---------------------------------------------------------------------------

const PERSONAL_SPEED_KEY = 'keydist:personal-speed';

/** 通常の測定で保存される値の例。個人速度の画面の保存形式。 */
const SAVED_PERSONAL_SPEED = {
  version: 1,
  calibration: {
    actionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    fingerSpeedUnitsPerSecond: { LI: 10 },
    fallbackFingerSpeedUnitsPerSecond: 8,
    measuredAt: 1767225600000,
  },
};

async function openConditionModal(page: Page): Promise<Locator> {
  await page.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

async function seedPersonalSpeed(page: Page): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: PERSONAL_SPEED_KEY, value: SAVED_PERSONAL_SPEED });
}

test('条件のモーダルで再生倍率を変えると要約に出て、再生位置は保たれる。保存値が無い間は再生のペインと個人速度の行がそれを知らせる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  for (let i = 0; i < 3; i++) await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(3);

  // 保存値が無い間は、再生のペインが個人速度の画面へのリンクつきで知らせる
  const notice = feature(page).locator('[data-playback-personal-speed="missing"]');
  await expect(notice).toContainText('測定した個人速度がありません');
  await expect(notice.getByRole('link', { name: '個人速度の画面を開く' })).toHaveAttribute('href', /\/personal-speed$/);

  const modal = await openConditionModal(page);
  const personal = modal.locator('[data-item="playbackPersonalSpeed"]');
  await expect(personal.locator('[data-condition-personal-speed="missing"]')).toBeVisible();
  await expect(personal.getByRole('link', { name: '個人速度の画面を開く' })).toBeVisible();
  await expect(personal).not.toContainText('個人速度で計算中');

  const row = modal.locator('[data-item="playbackSpeedMultiplier"]');
  await expect(row).toContainText('既定値');
  await row.getByRole('spinbutton', { name: '再生倍率' }).fill('2');
  await row.getByRole('spinbutton', { name: '再生倍率' }).press('Enter');
  await expect(row).toContainText('全体で変更');
  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pane-condition-trigger')).toContainText('再生倍率: 2倍');
  // 時間の条件を変えても、再生位置は保たれる
  expect((await readPosition(page))[0]).toBe(3);

  const again = await openConditionModal(page);
  await again.getByRole('button', { name: 'すべて既定値に戻す' }).click();
  await again.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');
  expect((await readPosition(page))[0]).toBe(3);
});

test('再生中に時間の条件を変えても、再生は止まらず新しい時間で続く', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  const toggle = feature(page).locator('[data-playback-action="toggle"]');
  await toggle.click();
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(0);

  // 再生倍率を最大の10倍にする。1ステップは800msから80msになる
  const modal = await openConditionModal(page);
  const input = modal.getByRole('spinbutton', { name: '再生倍率' });
  await input.fill('10');
  await input.press('Enter');
  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(toggle).toContainText('一時停止');
  const changedAt = (await readPosition(page))[0];
  // 10倍の速さなら、約0.5秒で数ステップ以上進む（1.25ステップ/秒のままなら1ステップも進まない）
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(changedAt + 3);
});

test('個人速度の保存値がある時は、個人速度で計算していることを要約と行に出し、基準速度は効かない行になる。適用しない設定にすると差分に出る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPersonalSpeed(page);
  await openPlayback(page);
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
  await expect(page.locator('.pane-condition-trigger')).toContainText('個人速度: 適用中');

  const modal = await openConditionModal(page);
  const personal = modal.locator('[data-item="playbackPersonalSpeed"]');
  await expect(personal).toContainText('個人速度で計算中');
  await expect(personal.locator('[data-condition-personal-speed="missing"]')).toHaveCount(0);
  await expect(personal.getByRole('link', { name: '個人速度の画面を開く' })).toBeVisible();
  const steps = modal.locator('[data-item="playbackStepsPerSecond"]');
  await expect(steps.locator('[data-condition-inactive="true"]')).toHaveText('個人速度で計算しているため、基準速度は使われません');
  // 行は編集できるまま、効かない間の変更は要約に数えない
  await steps.getByRole('spinbutton', { name: '基準速度' }).fill('2');
  await steps.getByRole('spinbutton', { name: '基準速度' }).press('Enter');
  await expect(steps).toContainText('全体で変更');
  await expect(page.locator('.pane-condition-trigger')).not.toContainText('基準速度');

  await personal.getByRole('button', { name: '適用しない' }).click();
  await expect(personal).not.toContainText('個人速度で計算中');
  await expect(steps.locator('[data-condition-inactive="true"]')).toHaveCount(0);
  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pane-condition-trigger')).toContainText('個人速度: 適用しない');
  await expect(page.locator('.pane-condition-trigger')).toContainText('基準速度: 2ステップ/秒');
  // 適用しない設定では、保存値が無いことも知らせない
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
});

test('他のタブで個人速度を保存すると、このタブの再生のペインと要約に届く', async ({ page, context }) => {
  await openPlayback(page);
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/about');
  await other.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: PERSONAL_SPEED_KEY,
    value: SAVED_PERSONAL_SPEED,
  });
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
  await expect(page.locator('.pane-condition-trigger')).toContainText('個人速度: 適用中');
  await other.close();
});

test('再生を読まないペインでも、モーダルに同じ行が出て編集できる。要約には数えない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPersonalSpeed(page);
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const modal = await openConditionModal(page);
  // 行と、個人速度で計算している旨の札は、再生のペインと同じに出る
  await expect(modal.locator('[data-item="playbackPersonalSpeed"]')).toContainText('個人速度で計算中');
  await expect(modal.locator('[data-item="playbackStepsPerSecond"] [data-condition-inactive="true"]')).toBeVisible();
  const row = modal.locator('[data-item="playbackSpeedMultiplier"]');
  await row.getByRole('spinbutton', { name: '再生倍率' }).fill('3');
  await row.getByRole('spinbutton', { name: '再生倍率' }).press('Enter');
  await expect(row).toContainText('全体で変更');
  await modal.getByRole('button', { name: '閉じる' }).click();
  // この画面は時間の条件を読まないので、変えた項目に数えない
  await expect(page.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');
});

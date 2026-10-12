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
  // 配列図の表示の項目。既定は非表示で、押下履歴を表示にすると押したキーが図に残る
  for (const name of ['指の位置を表示', '押下予定キーを表示', '押下履歴を表示', '順番ラベルを表示']) {
    await expect(settings.getByRole('checkbox', { name })).not.toBeChecked();
  }
  await expect(settings.getByRole('spinbutton', { name: '押下履歴を残すステップ数' })).toHaveValue('5');
  await expect(feature(page).locator('[data-playback-trail="true"]')).toHaveCount(0);
  await settings.getByRole('checkbox', { name: '押下履歴を表示' }).check();
  await expect(feature(page).locator('[data-playback-trail="true"]').first()).toBeVisible();
  await expect(feature(page).locator('[data-playback-plan="true"]')).toHaveCount(0);
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
// 解析設定の、再生の時間・速度グラフの平均・個人速度
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

const calculation = (page: Page) => feature(page).locator('[data-playback-calculation]');

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

test('条件のモーダルに、再生の時間・速度グラフの平均・個人速度の行は無く、チェーンの区切りとアルペジオの数え方の行は残る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  const modal = await openConditionModal(page);
  await expect(modal.locator('[data-item="chainInterpretation"]')).toBeVisible();
  await expect(modal.locator('[data-item="arpeggioInterpretation"]')).toBeVisible();
  for (const id of [
    'playbackStepsPerSecond',
    'playbackSpeedMultiplier',
    'playbackSameFingerDelay',
    'playbackAllFingerMovementDelay',
    'playbackPersonalSpeed',
    'playbackRateAverage',
    'playbackRateWindow',
    'playbackRateHalfLifeSeconds',
  ]) {
    await expect(modal.locator(`[data-item="${id}"]`)).toHaveCount(0);
  }
  for (const group of ['再生の時間', '速度グラフの平均', '個人速度']) {
    await expect(modal.locator(`section[aria-label="${group}"]`)).toHaveCount(0);
  }
});

test('解析設定で再生倍率を変えると、ペインの中に既定と違う設定が出て、再生位置は保たれる。保存値が無い間は再生のペインと個人速度の行がそれを知らせる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  for (let i = 0; i < 3; i++) await feature(page).locator('[data-playback-action="forward"]').click();
  expect((await readPosition(page))[0]).toBe(3);

  // 保存値が無い間は、再生のペインが個人速度の画面へのリンクつきで知らせる。既定の設定なので、計算の知らせは出ない
  const notice = feature(page).locator('[data-playback-personal-speed="missing"]');
  await expect(notice).toContainText('測定した個人速度がありません');
  await expect(notice.getByRole('link', { name: '個人速度の画面を開く' })).toHaveAttribute('href', /\/personal-speed$/);
  await expect(calculation(page)).toHaveCount(0);

  const settings = await openSettings(page);
  await expect(settings.locator('[data-playback-personal-speed-missing]')).toContainText('測定した個人速度がありません');
  await expect(settings.getByRole('link', { name: '個人速度の画面を開く' })).toHaveAttribute('href', /\/personal-speed$/);

  const multiplier = settings.getByRole('spinbutton', { name: '再生倍率' });
  await multiplier.fill('2');
  await multiplier.press('Enter');
  // 小窓を閉じても、ペインの中で既定と違う設定で計算していることが分かる
  await settings.press('Escape');
  await expect(calculation(page)).toContainText('既定と違う設定で計算しています。再生倍率: 2倍');
  // 時間の設定を変えても、再生位置は保たれる。条件の要約には出ない
  expect((await readPosition(page))[0]).toBe(3);
  await expect(page.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');

  // 既定へ戻すと、知らせは消える
  const again = await openSettings(page);
  await again.getByRole('button', { name: '再生倍率を既定値へ戻す' }).click();
  await again.press('Escape');
  await expect(calculation(page)).toHaveCount(0);
  expect((await readPosition(page))[0]).toBe(3);
});

test('再生中に時間の設定を変えても、再生は止まらず新しい時間で続く', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlayback(page);
  const toggle = feature(page).locator('[data-playback-action="toggle"]');
  await toggle.click();
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(0);

  // 再生倍率を最大の10倍にする。1ステップは800msから80msになる
  const settings = await openSettings(page);
  const input = settings.getByRole('spinbutton', { name: '再生倍率' });
  await input.fill('10');
  await input.press('Enter');
  await settings.press('Escape');
  await expect(toggle).toContainText('一時停止');
  const changedAt = (await readPosition(page))[0];
  // 10倍の速さなら、約0.5秒で数ステップ以上進む（1.25ステップ/秒のままなら1ステップも進まない）
  await expect.poll(async () => (await readPosition(page))[0], { timeout: 10_000 }).toBeGreaterThan(changedAt + 3);
});

test('個人速度の保存値がある時は、ペインの中に個人速度で計算していることを出し、基準速度は使われない理由が付く。適用しない設定にすると、既定と違う設定として出る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPersonalSpeed(page);
  await openPlayback(page);
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
  await expect(calculation(page)).toHaveText('個人速度で計算しています。');

  const settings = await openSettings(page);
  await expect(settings.locator('[data-playback-personal-speed-missing]')).toHaveCount(0);
  await expect(settings.getByRole('link', { name: '個人速度の画面を開く' })).toBeVisible();
  await expect(settings).toContainText('個人速度で計算しているため、基準速度は使われません');
  // 使われない間は、基準速度を変えても知らせに数えない
  const steps = settings.getByRole('spinbutton', { name: '基準速度' });
  await steps.fill('2');
  await steps.press('Enter');
  await expect(calculation(page)).toHaveText('個人速度で計算しています。');

  await settings.getByRole('button', { name: '適用しない' }).click();
  await expect(settings).not.toContainText('個人速度で計算しているため、基準速度は使われません');
  await settings.press('Escape');
  await expect(calculation(page)).toContainText('既定と違う設定で計算しています。基準速度: 2ステップ/秒、個人速度を適用しない');
  await expect(calculation(page)).not.toContainText('個人速度で計算しています。');
  // 適用しない設定では、保存値が無いことも知らせない
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
});

test('他のタブで個人速度を保存すると、このタブの再生のペインに届く', async ({ page, context }) => {
  await openPlayback(page);
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/about');
  await other.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: PERSONAL_SPEED_KEY,
    value: SAVED_PERSONAL_SPEED,
  });
  await expect(feature(page).locator('[data-playback-personal-speed="missing"]')).toHaveCount(0);
  await expect(calculation(page)).toHaveText('個人速度で計算しています。');
  await other.close();
});

test('解析設定の共有リンクに、時間の設定が載る。開くと同じ設定で計算する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/standalone/playback?multiplier=2&rateAverage=ewma&rateHalfLife=2');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(calculation(page)).toContainText('再生倍率: 2倍、平均の方式: EWMA、平均の半減時間: 2秒');
  const settings = await openSettings(page);
  await expect(settings.getByRole('spinbutton', { name: '再生倍率' })).toHaveValue('2');
});

test('個人速度を保存していても、再生を読まないペインの条件のモーダルに再生の行は出ない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPersonalSpeed(page);
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const modal = await openConditionModal(page);
  await expect(modal.locator('[data-item="chainInterpretation"]')).toBeVisible();
  await expect(modal.locator('[data-item="playbackPersonalSpeed"]')).toHaveCount(0);
  await expect(modal.locator('[data-item="playbackSpeedMultiplier"]')).toHaveCount(0);
  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');
});

test('Workspaceで、共有に従う打鍵再生のペインは時間の設定が揃い、「このペインだけ」にしたペインは別の値を持つ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const layoutTarget = (layoutId: string) => ({ mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId } } });
  const panes = [
    { id: 'a', analyzerId: 'playback', optionsBinding: { mode: 'shared', set: 'playback-1' }, binding: layoutTarget('qwerty') },
    { id: 'b', analyzerId: 'playback', optionsBinding: { mode: 'shared', set: 'playback-1' }, binding: layoutTarget('dvorak') },
    { id: 'c', analyzerId: 'playback', optionsBinding: { mode: 'own' }, binding: layoutTarget('qwerty') },
  ];
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, {
    id: 's',
    name: '共有',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    optionSets: [{ id: 'playback-1', analyzerId: 'playback' }],
    panes,
    grid: panes.map((pane, i) => ({ id: pane.id, x: i * 8, y: 0, w: 8, h: 30 })),
  });
  await page.goto('/workspace/s');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(panes.length, { timeout: 30_000 });

  const paneOf = (id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);
  const noteOf = (id: string) => paneOf(id).locator('[data-playback-calculation]');
  await expect(page.locator('[data-playback-calculation]')).toHaveCount(0);

  // 共有に従うaで再生倍率を変えると、同じ共有に従うbも変わり、このペインだけのcは変わらない
  await paneOf('a').getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  const multiplier = settings.getByRole('spinbutton', { name: '再生倍率' });
  await multiplier.fill('2');
  await multiplier.press('Enter');
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(noteOf('a')).toContainText('再生倍率: 2倍');
  await expect(noteOf('b')).toContainText('再生倍率: 2倍');
  await expect(noteOf('c')).toHaveCount(0);

  // cは別の値を持てる
  await paneOf('c').getByRole('button', { name: '解析設定', exact: true }).click();
  const own = page.locator('[data-settings-window="true"]').getByRole('spinbutton', { name: '再生倍率' });
  await own.fill('3');
  await own.press('Enter');
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(noteOf('c')).toContainText('再生倍率: 3倍');
  await expect(noteOf('a')).toContainText('再生倍率: 2倍');
});

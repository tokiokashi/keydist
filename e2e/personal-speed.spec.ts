import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 個人速度の画面のE2E。測定の計算と保存値の検証はunit testが持つので、ここでは画面の配線を見る:
 * サイドバーから開ける、実際のキー入力で測って保存できる、測定中だけキー入力を取る、
 * 保存値を編集・全破棄・元に戻せる、画面内の選択が他の画面の状態を変えない。
 */

const STORAGE_KEY = 'keydist:personal-speed';

/** 通常の測定で保存される値の例。再測定・編集の出発点に使う。 */
const SEEDED = {
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

async function seed(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.addInitScript((data) => {
    // リロードのたびに種まきし直すと、画面での変更が巻き戻る。最初の1回だけ書く。
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, entries);
}

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

/** 案内の「A」と「B」を読み、完了まで交互に打つ。項目が変わったら最初のキーから打ち直す。 */
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
    await page.keyboard.press(keys[index % 2] ?? 'a');
    index += 1;
    await page.waitForTimeout(45);
  }
  throw new Error('測定が終わらなかった');
}

/** 文章を打つ測定で、画面が示す次のキーを順に打ち、完了まで進める。 */
async function typeThroughSentence(page: Page): Promise<void> {
  const run = page.locator('[data-personal-speed-sentence-run="active"]');
  const next = page.locator('[data-personal-speed-next] kbd');
  const progress = page.locator('[data-personal-speed-sentence-progress]');
  for (let step = 0; step < 1000; step += 1) {
    if (!(await run.isVisible())) return;
    const before = (await progress.textContent({ timeout: 1000 }).catch(() => null)) ?? '';
    const keys = (await next.allTextContents()).map((key) => key.toLowerCase());
    if (keys.length === 0) continue;
    for (const key of keys) await page.keyboard.press(key);
    // 画面が次のステップへ進んでから打つ。同じキーが続いても二重に打たない。
    await page.waitForFunction(
      (previous) => {
        const element = document.querySelector('[data-personal-speed-sentence-progress]');
        return element === null || element.textContent !== previous;
      },
      before,
      { timeout: 2000 },
    );
  }
  throw new Error('文章を打つ測定が終わらなかった');
}

/** keydownを送り、既定動作が止められたか・windowのバブリング段階に届いたかを返す。 */
function probe(page: Page, key: string): Promise<{ prevented: boolean; reached: boolean }> {
  return page.evaluate((pressed) => {
    let reached = false;
    const listener = () => { reached = true; };
    window.addEventListener('keydown', listener);
    const event = new KeyboardEvent('keydown', { key: pressed, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    window.removeEventListener('keydown', listener);
    return { prevented: event.defaultPrevented, reached };
  }, key);
}

test('サイドバーのAssetsから開ける。保存が無ければ空の状態で、方向別と全破棄は使えない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: '個人速度', exact: true }).click();
  await expect(page).toHaveURL(/\/personal-speed$/);
  await expect(page.locator('[data-personal-speed-empty]')).toBeVisible();
  await expect(page.locator('[data-personal-speed-start="normal"]')).toBeEnabled();
  await expect(page.locator('[data-personal-speed-start="directional"]')).toBeDisabled();
  await expect(page.locator('[data-personal-speed-start="sentence"]')).toBeDisabled();
  await expect(page.locator('[data-personal-speed-discard]')).toBeDisabled();
});

test('各測定に、何を測るかと、測った値が打鍵再生のどこに使われるかの説明がある', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-personal-speed-purpose]')).toContainText('打鍵再生の時間');
  const measure = page.getByRole('region', { name: '測定' });
  for (const [title, text] of [
    ['通常の速度と指の移動', '同指連続を含まない打鍵の時間と、同指連続で指が動く時間'],
    ['方向別の速度', '直前の打鍵との指の組み合わせと向き'],
    ['文章を打つ速さ', '同指連続を含まない打鍵の時間に足します'],
  ] as const) {
    await expect(measure.getByRole('heading', { name: title, level: 3 })).toBeVisible();
    await expect(measure).toContainText(text);
  }
});

test('通常の測定をキー入力で行い、結果が保存される', async ({ page }) => {
  await open(page);
  await page.locator('[data-personal-speed-start="normal"]').click();
  await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  await typeThroughRun(page);
  await expect(page.locator('[data-personal-speed-run="active"]')).toHaveCount(0);
  await expect(page.getByText('通常の速度と指の移動速度を測って保存しました。')).toBeVisible();
  await expect(page.locator('[data-personal-speed-empty]')).toHaveCount(0);

  const saved = await stored(page) as { version: number; calibration: { actionsPerSecond: number; fingerSpeedUnitsPerSecond: Record<string, number> } };
  expect(saved.version).toBe(1);
  expect(saved.calibration.actionsPerSecond).toBeGreaterThanOrEqual(0.1);
  expect(saved.calibration.actionsPerSecond).toBeLessThanOrEqual(40);
  expect(Object.keys(saved.calibration.fingerSpeedUnitsPerSecond).length).toBeGreaterThan(0);
  await expect(page.locator('[data-personal-speed-start="directional"]')).toBeEnabled();
});

test('キー入力は測定中だけ取り、Escape・Tab・Enter・Spaceと測定前後の文字キーは取らない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);

  expect(await probe(page, 'f')).toEqual({ prevented: false, reached: true });

  await page.locator('[data-personal-speed-start="normal"]').click();
  const run = page.locator('[data-personal-speed-run="active"]');
  await expect(run).toBeVisible();
  for (const key of ['Escape', 'Tab', 'Enter', ' ']) {
    expect(await probe(page, key)).toEqual({ prevented: false, reached: true });
  }
  await expect(run).toBeVisible();

  // 次に打つキーだけを止める。違うキーは進行も既定動作も変えない。
  const text = (await page.locator('[data-personal-speed-instruction]').textContent()) ?? '';
  const [first, second] = [...text.matchAll(/「(.)」/g)].map((match) => match[1] ?? '');
  expect(await probe(page, second ?? '')).toEqual({ prevented: false, reached: true });
  expect(await probe(page, first ?? '')).toEqual({ prevented: true, reached: false });

  await page.locator('[data-personal-speed-cancel]').click();
  await expect(run).toHaveCount(0);
  expect(await probe(page, first ?? '')).toEqual({ prevented: false, reached: true });
  expect(await stored(page)).toEqual(SEEDED);
});

test('測定を完了した後は、文字キーを取らない', async ({ page }) => {
  await open(page);
  await page.locator('[data-personal-speed-start="normal"]').click();
  await typeThroughRun(page);
  expect(await probe(page, 'f')).toEqual({ prevented: false, reached: true });
});

test('保存した値を編集できる。範囲外と必須項目の空は保存されず、任意項目の空は消える', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const actions = page.locator('#personal-speed-actions');
  await expect(actions).toHaveValue('5.00');
  const save = page.locator('[data-personal-speed-save]');
  await expect(save).toBeDisabled();

  await actions.fill('100');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '通常の打鍵速度' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);

  await actions.fill('');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '入力してください' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);

  await actions.fill('7.5');
  await page.locator('[id="personal-speed-finger:LI"]').fill('');
  await save.click();
  await expect(page.getByText('保存しました。', { exact: true })).toBeVisible();
  const saved = await stored(page) as { calibration: Record<string, unknown> };
  expect(saved.calibration.actionsPerSecond).toBe(7.5);
  expect(saved.calibration.fingerSpeedUnitsPerSecond).toEqual({});
});

test('全破棄は確認のあとに保存を消し、元に戻すで戻る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-discard]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page)).toEqual(SEEDED);

  await page.locator('[data-personal-speed-discard]').click();
  await page.getByRole('dialog').getByRole('button', { name: '破棄する' }).click();
  await expect(page.locator('[data-personal-speed-empty]')).toBeVisible();
  await expect.poll(async () => {
    const value = await stored(page) as { calibration?: unknown } | null;
    return value === null || value.calibration === undefined;
  }).toBe(true);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('#personal-speed-actions')).toHaveValue('5.00');
  await expect.poll(() => stored(page)).toEqual(SEEDED);
});

test('項目の測り直しは、その項目だけを入れ替える', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.getByRole('button', { name: '通常の打鍵速度を測り直す' }).click();
  await typeThroughRun(page);
  await expect(page.getByText('通常の打鍵速度を測り直して保存しました。')).toBeVisible();
  const saved = await stored(page) as { calibration: Record<string, unknown> };
  expect(saved.calibration.actionsPerSecond).not.toBe(5);
  expect(saved.calibration.fingerSpeedUnitsPerSecond).toEqual(SEEDED.calibration.fingerSpeedUnitsPerSecond);
  expect(saved.calibration.sameHandDifferentFingerActionsPerSecond).toBe(4);
});

test('文章を打つ測定の途中に別のタブで個人速度が変わると、連打との差を保存せず測り直しを促す', async ({ page, context }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toBeVisible();

  const changed = { ...SEEDED, calibration: { ...SEEDED.calibration, actionsPerSecond: 6 } };
  const other = await context.newPage();
  await other.goto('/about');
  await other.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: changed });
  await other.close();
  await page.bringToFront();

  await typeThroughSentence(page);
  await expect(page.getByRole('alert').filter({ hasText: '測定の途中で個人速度が変わったため、保存していません' })).toBeVisible();
  expect(await stored(page)).toEqual(changed);
});

test('画面内で選んだ配列は、Singleの対象や条件を変えない。初期値はSingleの対象', async ({ page }) => {
  const single = { version: 1, target: { kind: 'layout', layoutId: 'dvorak' } };
  await seed(page, { 'keydist:single-target-selection': single });
  await open(page);
  const layoutSelect = page.locator('.personal-speed-select-grid select').first();
  await expect(layoutSelect).toHaveValue('dvorak');
  await layoutSelect.selectOption('qwerty');

  const after = await page.evaluate(() => ({
    single: localStorage.getItem('keydist:single-target-selection'),
    library: localStorage.getItem('keydist:setup-library'),
  }));
  expect(after.single).toBe(JSON.stringify(single));
  expect(after.library).toBeNull();
});

test('文章を打つ測定で、種類ごとの連打との差を測って保存し、数えた打鍵の数が知らされる', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await expect(page.locator('[data-personal-speed-sentence]').first()).toBeVisible();
  await page.locator('[data-personal-speed-start="sentence"]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toBeVisible();
  await typeThroughSentence(page);
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toHaveCount(0);
  await expect(page.getByText('文章を打つ速さを測って保存しました。')).toBeVisible();
  await expect(page.locator('.personal-speed-message')).toContainText('Arpeggio');
  await expect(page.locator('.personal-speed-message')).toContainText('打）');

  const saved = await stored(page) as { calibration: { keystrokeOverheadMs: Record<string, number>; actionsPerSecond: number } };
  expect(Object.keys(saved.calibration.keystrokeOverheadMs).sort()).toEqual(['arpeggio', 'chain', 'other']);
  for (const value of Object.values(saved.calibration.keystrokeOverheadMs)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1000);
  }
  // 他の項目は残る
  expect(saved.calibration.actionsPerSecond).toBe(5);
  await expect(page.locator('[id="personal-speed-overhead:other"]')).not.toHaveValue('');
});

test('文章を打つ測定は、違うキーを知らせ、中止すると保存値を変えない。測定中だけキー入力を取る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  const next = page.locator('[data-personal-speed-next] kbd');
  await expect(next.first()).toBeVisible();
  const expected = ((await next.first().textContent()) ?? '').toLowerCase();
  const wrong = expected === 'q' ? 'w' : 'q';
  expect(await probe(page, wrong)).toEqual({ prevented: false, reached: true });
  await expect(page.getByRole('status').filter({ hasText: '押す番です' })).toBeVisible();
  expect(await probe(page, expected)).toEqual({ prevented: true, reached: false });

  await page.locator('[data-personal-speed-sentence-cancel]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toHaveCount(0);
  expect(await probe(page, expected)).toEqual({ prevented: false, reached: true });
  expect(await stored(page)).toEqual(SEEDED);
});

test('他の測定を保存すると連打との差が消え、測り直しを促す知らせが出る', async ({ page }) => {
  const withOverhead = { ...SEEDED, calibration: { ...SEEDED.calibration, keystrokeOverheadMs: { other: 60 } } };
  await seed(page, { [STORAGE_KEY]: withOverhead });
  await open(page);
  await expect(page.locator('[id="personal-speed-overhead:other"]')).toHaveValue('60.0');
  await page.getByRole('button', { name: '通常の打鍵速度を測り直す' }).click();
  await typeThroughRun(page);
  await expect(page.getByText('連打との差は、他の値が変わったため消しました')).toBeVisible();
  const saved = await stored(page) as { calibration: Record<string, unknown> };
  expect('keystrokeOverheadMs' in saved.calibration).toBe(false);
  await expect(page.locator('[id="personal-speed-overhead:other"]')).toHaveValue('');
});

test('連打との差を数値で直接編集して保存でき、空欄にすると消える。範囲外は保存されない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const arpeggio = page.locator('[id="personal-speed-overhead:arpeggio"]');
  const save = page.locator('[data-personal-speed-save]');
  await arpeggio.fill('1000.5');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '連打との差 Arpeggio' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);

  await arpeggio.fill('25');
  await save.click();
  await expect(page.getByText('保存しました。', { exact: true })).toBeVisible();
  expect((await stored(page) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ arpeggio: 25 });

  await arpeggio.fill('');
  await save.click();
  await expect.poll(async () => 'keystrokeOverheadMs' in ((await stored(page)) as { calibration: object }).calibration).toBe(false);
});

test('示す文を打つのに親指キー・Space・修飾キーなど1文字のキー以外が要る配列では、文章を打つ測定は測れないと示す', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await expect(page.locator('[data-personal-speed-start="sentence"]')).toBeEnabled();
  await page.locator('.personal-speed-select-grid select').first().selectOption('nicola');
  await expect(page.locator('[data-personal-speed-sentence-unavailable]')).toContainText('文章を打つ測定はできません');
  await expect(page.locator('[data-personal-speed-start="sentence"]')).toBeDisabled();
  // 他の測定は使える
  await expect(page.locator('[data-personal-speed-start="directional"]')).toBeEnabled();
});

test('文章を打つ測定で、示した綴りと違う綴りで打ち始めても進み、続きと残りの打数が打った綴りに合う', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  const progress = page.locator('[data-personal-speed-sentence-progress]');
  await expect(progress).toBeVisible();
  const total = Number(/あと(\d+)打/.exec(await progress.innerText())?.[1]);
  // 「きょうはてんき」を、「ん」をnの1打で打つ。nnの2打ではなく1打で、次のかなのkへ進む。
  for (const key of 'kyouhatenk') {
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
  await expect(page.locator('[data-personal-speed-next] kbd')).toHaveText(['I']);
  // 示していた綴り（nn）より1打少ない分だけ、残りが減る。
  await expect(progress).toHaveText(`あと${total - 11}打`);
  await typeThroughSentence(page);
  await expect(page.getByText('文章を打つ速さを測って保存しました。')).toBeVisible();
});

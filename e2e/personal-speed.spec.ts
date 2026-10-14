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

/** 案内の「A」と「B」（同じキーを続けて打つ項目は「A」だけ）を読み、完了まで交互に打つ。項目が変わったら最初のキーから打ち直す。 */
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

/** 文章を打つ測定で、画面が示す次のキーを順に打ち、完了まで進める。 */
async function typeThroughSentence(page: Page): Promise<void> {
  const run = page.locator('[data-personal-speed-sentence-run="active"]');
  const next = page.locator('[data-personal-speed-next] kbd');
  const progress = page.locator('[data-personal-speed-sentence-progress]');
  for (let step = 0; step < 1500; step += 1) {
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

/** 文章を打つ測定で、今の回を打ち終えて次の回に進むまで、画面が示す次のキーを順に打つ。 */
async function typeThroughRound(page: Page): Promise<void> {
  const position = page.locator('[data-personal-speed-sentence-position]');
  const next = page.locator('[data-personal-speed-next] kbd');
  const progress = page.locator('[data-personal-speed-sentence-progress]');
  const start = await position.textContent();
  for (let step = 0; step < 200; step += 1) {
    if ((await position.textContent()) !== start) return;
    const before = (await progress.textContent({ timeout: 1000 }).catch(() => null)) ?? '';
    const keys = (await next.allTextContents()).map((key) => key.toLowerCase());
    if (keys.length === 0) continue;
    for (const key of keys) await page.keyboard.press(key);
    await page.waitForFunction(
      (previous) => {
        const element = document.querySelector('[data-personal-speed-sentence-progress]');
        return element === null || element.textContent !== previous;
      },
      before,
      { timeout: 2000 },
    );
  }
  throw new Error('1回が終わらなかった');
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
  // 保存値が無い間は、4つの測定のそれぞれが、まだ測っていないことを示す
  await expect(page.locator('[data-personal-speed-empty]')).toHaveCount(4);
  await expect(page.locator('[data-personal-speed-start="normal"]')).toBeEnabled();
  await expect(page.locator('[data-personal-speed-start="directional"]')).toBeDisabled();
  await expect(page.locator('[data-personal-speed-start="sentence"]')).toBeDisabled();
  await expect(page.locator('[data-personal-speed-discard]')).toBeDisabled();
  // 保存値が無い間は、説明と測り方の折りたたみが開いている
  for (const id of ['normal', 'directional', 'simultaneous', 'sentence']) {
    await expect(page.locator(`[data-personal-speed-explanation="${id}"]`)).toHaveJSProperty('open', true);
  }
  // 使えない測定には、ボタンの近くに理由が出る
  await expect(page.locator('#personal-speed-group-directional [data-personal-speed-reason]')).toContainText('先に、通常の速度と指の移動を測って保存してください');
  await expect(page.locator('#personal-speed-group-sentence [data-personal-speed-reason]')).toContainText('先に、通常の速度と指の移動を測って保存してください');
  await expect(page.locator('#personal-speed-group-normal [data-personal-speed-reason]')).toHaveCount(0);
});

test('各測定のまとまりに、何を測るか・どこに使うかの説明と、測り方が折りたたみの中にあり、仕様書へのリンクがその外にある。計算の詳細は書いていない', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-personal-speed-purpose]')).toContainText('打鍵再生の時間');
  const expected = {
    normal: {
      purpose: ['キーを打つ速さ、同じキーを続けて打つ速さ', '1打ごとの時間と、同じ指で別のキーを続けて打つ時に指が動く時間を決めます'],
      howTo: ['指定されたキーを交互に打ってください。', '同じキーを続けて打ってください。'],
    },
    directional: {
      purpose: ['左手と右手の交互打ちと、同じ手の2本の指で打つ時の', '測った向きの1打の時間を、向きを区別しない値の代わりに決めます'],
      howTo: ['→の2打を、つなげて素早く打ってください。'],
    },
    simultaneous: {
      purpose: ['2つのキーを同時に押す時に', '両手・片手・親指との同時押しごとに測ります', '同時押しの1打ごとの時間に足します'],
      howTo: ['指定された2つのキーを、同時に押してください。', '2つのキーの押下が50ミリ秒以内に揃わなかった時は、その打鍵を数えません。'],
    },
    sentence: {
      purpose: ['覚えた文を考えずに打つ時に', '測った速さから求めた時間と、実際に打った間隔との差（打鍵の上乗せ）', 'Arpeggio・Chain・その他・続け打ち・同指連続の種類ごとに測ります', 'Arpeggio・Chain・その他は、同じかなの中を打つ打鍵と、違うかなへ移る打鍵に分けても測ります', '1打ごとの時間に種類ごとの打鍵の上乗せを足します'],
      howTo: [
        '1回目は文を覚える回で数えないので、2回目からは考えずに打ってください。',
        '間違えたら、その打鍵を数えずに続けられます。',
        'ローマ字で打つ配列では、普段の綴りで打てます。',
        '手に馴染んだ配列で測ってください。',
        '別の配列で測ると求まる種類が変わります。',
        'キーボードがコンボを文字に変えて送る場合も測れます。',
      ],
    },
  } as const;
  for (const [id, { purpose, howTo }] of Object.entries(expected)) {
    const description = page.locator(`[data-personal-speed-description="${id}"]`);
    for (const text of purpose) await expect(description).toContainText(text);
    // 計算の詳細は仕様書にある
    await expect(description).not.toContainText('四分位平均');
    await expect(description).not.toContainText('基準の時間');
    const group = page.locator(`#personal-speed-group-${id}`);
    const list = group.locator(`[data-personal-speed-howto="${id}"]`);
    await expect(list.getByRole('heading', { name: '測り方', level: 3 })).toBeVisible();
    for (const text of howTo) await expect(list).toContainText(text);
    // 仕様書へのリンクは、折りたたみの後の1行にある
    const spec = group.locator(`[data-personal-speed-spec="${id}"]`);
    await expect(spec.getByRole('link', { name: '再生時間モデルの仕様書' })).toHaveAttribute('href', /spec\/playback-timing\.md$/);
    // 説明と測り方は1つの折りたたみに入り、仕様書へのリンクと測るボタンはその外にある
    const explanation = group.locator(`[data-personal-speed-explanation="${id}"]`);
    await expect(explanation.locator(`[data-personal-speed-description="${id}"]`)).toHaveCount(1);
    await expect(explanation.locator(`[data-personal-speed-howto="${id}"]`)).toHaveCount(1);
    await expect(explanation.locator('[data-personal-speed-spec]')).toHaveCount(0);
    const order = await group.evaluate((section) => {
      const parts = Array.from(section.children);
      return [
        parts.findIndex((el) => el.hasAttribute('data-personal-speed-explanation')),
        parts.findIndex((el) => el.hasAttribute('data-personal-speed-spec')),
        parts.findIndex((el) => el.hasAttribute('data-personal-speed-effect') || el.matches('.personal-speed-actions')),
      ];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  }
  await expect(page.locator('#personal-speed-group-normal').getByRole('heading', { name: '通常の速度と指の移動', level: 2 })).toBeVisible();
  await expect(page.locator('#personal-speed-group-directional').getByRole('heading', { name: '方向別の速度', level: 2 })).toBeVisible();
  await expect(page.locator('#personal-speed-group-simultaneous').getByRole('heading', { name: '同時押し', level: 2 })).toBeVisible();
  await expect(page.locator('#personal-speed-group-sentence').getByRole('heading', { name: '文章を打つ速さ', level: 2 })).toBeVisible();
  // 保存値を持たない時は、測るボタンの直後に保存値への影響の文を出さない
  await expect(page.locator('[data-personal-speed-effect]')).toHaveCount(0);
});

test('保存値を持つ時だけ、測るボタンの直後に、置き換わる値と消える値を示す文が出る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await expect(page.locator('#personal-speed-group-normal [data-personal-speed-effect]')).toHaveText('測ると、方向別の値を除く保存値が置き換わります。');
  await expect(page.locator('#personal-speed-group-directional [data-personal-speed-effect]')).toHaveText('測ると、測った向きの値が置き換わります。');
  // 打鍵の上乗せを持たない時の文章を打つ速さは、前の打鍵の上乗せが無いので文を出さない
  await expect(page.locator('#personal-speed-group-sentence [data-personal-speed-effect]')).toHaveCount(0);
});

test('打鍵の上乗せを保存している時は、その種類だけを挙げる文が、測るボタンの直後に出る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: { ...SEEDED, calibration: { ...SEEDED.calibration, keystrokeOverheadMs: { chain: 12, repeat: 30 } } } });
  await open(page);
  await expect(page.locator('#personal-speed-group-normal [data-personal-speed-effect]')).toHaveText('測ると、方向別の値を除く保存値が置き換わり、続け打ちの打鍵の上乗せは再生の時間が変わらない値に置き換わって、それ以外の打鍵の上乗せは消えます。');
  await expect(page.locator('#personal-speed-group-directional [data-personal-speed-effect]')).toHaveText('測ると、測った向きの値が置き換わり、打鍵の上乗せのうちChainが消えます（続け打ちは残ります）。');
  await expect(page.locator('#personal-speed-group-sentence [data-personal-speed-effect]')).toHaveText('測り直して保存すると、前の打鍵の上乗せは全て置き換わります。');
  // 測るボタンの直後に文が並ぶ
  const after = await page.locator('#personal-speed-group-directional').evaluate((section) => {
    const button = section.querySelector('[data-personal-speed-start="directional"]');
    return button?.parentElement?.nextElementSibling?.getAttribute('data-personal-speed-effect') ?? null;
  });
  expect(after).toBe('directional');
});

const SIMULTANEOUS_EFFECT = '#personal-speed-group-simultaneous [data-personal-speed-effect]';

function seededWith(extra: Record<string, unknown>) {
  return { [STORAGE_KEY]: { ...SEEDED, calibration: { ...SEEDED.calibration, keystrokeOverheadMs: { chain: 12, repeat: 30 }, ...extra } } };
}

test('同時押しのまとまりの文は、文章に入った分け方を測る時に消えると伝える', async ({ page }) => {
  await seed(page, seededWith({ sentenceSimultaneousKinds: ['both-hands', 'thumb'] }));
  await open(page);
  await expect(page.locator(SIMULTANEOUS_EFFECT)).toHaveText('測ると、測った同時押しの上乗せが置き換わります。打鍵の上乗せのうちChainは、両手の同時押し・親指との同時押しを測ると消えます（続け打ちは残ります）。');
});

test('同時押しのまとまりの文は、記録が空なら消えると伝えない', async ({ page }) => {
  await seed(page, seededWith({ sentenceSimultaneousKinds: [] }));
  await open(page);
  await expect(page.locator(SIMULTANEOUS_EFFECT)).toHaveText('測ると、測った同時押しの上乗せが置き換わります。');
});

test('同時押しのまとまりの文は、記録が無ければどの分け方を測っても消えると伝える', async ({ page }) => {
  await seed(page, seededWith({}));
  await open(page);
  await expect(page.locator(SIMULTANEOUS_EFFECT)).toHaveText('測ると、測った同時押しの上乗せが置き換わり、打鍵の上乗せのうちChainが消えます（続け打ちは残ります）。');
});

test('通常の測定をキー入力で行い、結果が保存される', async ({ page }) => {
  await open(page);
  await page.locator('[data-personal-speed-start="normal"]').click();
  await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  await typeThroughRun(page);
  await expect(page.locator('[data-personal-speed-run="active"]')).toHaveCount(0);
  // 知らせは、測ったまとまりの中に出る
  await expect(page.locator('#personal-speed-group-normal').getByText('通常の速度、同じキーを続けて打つ速さ、指の移動速度を測って保存しました。')).toBeVisible();
  await expect(page.locator('[data-personal-speed-empty]')).toHaveCount(0);
  // 測った値は、測ったまとまりの中の行に出る
  await expect(page.locator('#personal-speed-group-normal #personal-speed-actions')).not.toHaveValue('');

  const saved = await stored(page) as { version: number; calibration: { actionsPerSecond: number; sameKeyActionsPerSecond: number; fingerSpeedUnitsPerSecond: Record<string, number> } };
  expect(saved.version).toBe(1);
  expect(saved.calibration.actionsPerSecond).toBeGreaterThanOrEqual(0.1);
  expect(saved.calibration.actionsPerSecond).toBeLessThanOrEqual(40);
  expect(Object.keys(saved.calibration.fingerSpeedUnitsPerSecond).length).toBeGreaterThan(0);
  expect(saved.calibration.sameKeyActionsPerSecond).toBeGreaterThanOrEqual(0.1);
  expect(saved.calibration.sameKeyActionsPerSecond).toBeLessThanOrEqual(40);
  await expect(page.locator('[id="personal-speed-same-key"]')).not.toHaveValue('');
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

test('保存した値の直接編集は、欄を確定した時にその場で保存され、元に戻すで戻せる。測定は別の操作なしに始められる', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  // 「変更を保存」「変更を戻す」は無い
  await expect(page.getByRole('button', { name: '変更を保存' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '変更を戻す' })).toHaveCount(0);
  const actions = page.locator('#personal-speed-actions');
  await expect(actions).toHaveValue('5.00');

  // Enterで確定
  await actions.fill('7.5');
  await actions.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { actionsPerSecond: number } }).calibration.actionsPerSecond).toBe(7.5);
  await expect(actions).toHaveValue('7.50');
  // 保存の知らせは出さない
  await expect(page.locator('.personal-speed-message:not(:empty)')).toHaveCount(0);

  // 欄から離れて確定
  const finger = page.locator('[id="personal-speed-finger:LI"]');
  await finger.fill('12');
  await finger.blur();
  await expect.poll(async () => ((await stored(page)) as { calibration: { fingerSpeedUnitsPerSecond: Record<string, number> } }).calibration.fingerSpeedUnitsPerSecond.LI).toBe(12);

  // 元に戻すで、保存した順に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(finger).toHaveValue('10.00');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(actions).toHaveValue('5.00');
  await expect.poll(() => stored(page)).toEqual(SEEDED);

  // 編集の直後に、別の操作をせずに測定を始められる
  await actions.fill('6');
  await actions.press('Enter');
  await page.locator('[data-personal-speed-start="normal"]').click();
  await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  await page.locator('[data-personal-speed-cancel]').click();
});

test('任意の項目を空にして確定すると、その場で消え、元に戻すで戻る。必須の項目は空にできない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const finger = page.locator('[id="personal-speed-finger:LI"]');
  await finger.fill('');
  await finger.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { fingerSpeedUnitsPerSecond: unknown } }).calibration.fingerSpeedUnitsPerSecond).toEqual({});
  // 消えた項目の行は、測っていない項目へ移る
  await expect(page.locator('[id="personal-speed-finger:LI"]')).toHaveValue('');
  await expect(page.locator('#personal-speed-group-normal details', { hasText: '測っていない項目' }).first()).toBeVisible();

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[id="personal-speed-finger:LI"]')).toHaveValue('10.00');
  await expect.poll(() => stored(page)).toEqual(SEEDED);

  const actions = page.locator('#personal-speed-actions');
  await actions.fill('');
  await actions.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: '通常の打鍵速度を入力してください' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);
});

test('保存できない値は保存されずに欄の近くに理由が出て、別の欄の正しい値は保存される。理由と入力は残る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const actions = page.locator('#personal-speed-actions');
  await actions.fill('100');
  await actions.press('Enter');
  const reason = page.locator('[data-personal-speed-row="actions"]').getByRole('alert');
  await expect(reason).toContainText('通常の打鍵速度は0.1から40までの数値で入力してください');
  expect(await stored(page)).toEqual(SEEDED);

  // 別の欄の保存は止まらず、保存できない入力と理由は残る
  const finger = page.locator('[id="personal-speed-finger:LI"]');
  await finger.fill('11');
  await finger.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { fingerSpeedUnitsPerSecond: Record<string, number> } }).calibration.fingerSpeedUnitsPerSecond.LI).toBe(11);
  await expect(actions).toHaveValue('100');
  await expect(reason).toBeVisible();
  expect(((await stored(page)) as { calibration: { actionsPerSecond: number } }).calibration.actionsPerSecond).toBe(5);

  // 直すと理由が消え、保存される
  await actions.fill('6');
  await expect(reason).toHaveCount(0);
  await actions.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { actionsPerSecond: number } }).calibration.actionsPerSecond).toBe(6);
});

test('測っていない項目は空欄の行で並ばず、まとめた一覧から値を足せる。測れる項目には測る入口がある', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const normal = page.locator('#personal-speed-group-normal');
  // 指の移動速度は測った1本だけが行になる
  await expect(normal.locator('[data-personal-speed-row^="finger:"]:visible')).toHaveCount(1);
  const missing = normal.locator('details').filter({ has: page.locator('[id="personal-speed-finger:LR"]') });
  await missing.locator('summary').click();
  const ring = missing.locator('[id="personal-speed-finger:LR"]');
  await expect(ring).toHaveValue('');
  // 測る入口（今の配列で測れる項目）
  await expect(missing.getByRole('button', { name: /だけを測る$/ }).first()).toBeVisible();
  // 値を足す
  await ring.fill('9');
  await ring.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { fingerSpeedUnitsPerSecond: Record<string, number> } }).calibration.fingerSpeedUnitsPerSecond.LR).toBe(9);
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
  await expect(page.locator('[data-personal-speed-empty]')).toHaveCount(4);
  await expect(page.getByText('個人速度を破棄しました。')).toBeVisible();
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
  await page.getByRole('button', { name: '通常の打鍵速度だけを測り直す' }).click();
  // 測定中の案内は、その行のまとまりに出る
  await expect(page.locator('#personal-speed-group-normal [data-personal-speed-run="active"]')).toBeVisible();
  await typeThroughRun(page);
  await expect(page.locator('#personal-speed-group-normal').getByText('通常の打鍵速度を測り直して保存しました。')).toBeVisible();
  const saved = await stored(page) as { calibration: Record<string, unknown> };
  expect(saved.calibration.actionsPerSecond).not.toBe(5);
  expect(saved.calibration.fingerSpeedUnitsPerSecond).toEqual(SEEDED.calibration.fingerSpeedUnitsPerSecond);
  expect(saved.calibration.sameHandDifferentFingerActionsPerSecond).toBe(4);
});

test('文章を打つ測定の途中に別のタブで個人速度が変わると、打鍵の上乗せを保存せず測り直しを促す。表は出さない', async ({ page, context }) => {
  test.setTimeout(240_000);
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
  await expect(page.locator('[data-personal-speed-sentence-result]')).toHaveCount(0);
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

test('文章を打つ測定で、差の種類ごとの打鍵の上乗せを測って保存し、数えた打鍵の数が知らされる', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  // 測る前に、文の一覧は並ばない
  await expect(page.locator('[data-personal-speed-sentence]')).toHaveCount(0);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toBeVisible();
  await typeThroughSentence(page);
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toHaveCount(0);
  const sentenceGroup = page.locator('#personal-speed-group-sentence');
  await expect(sentenceGroup.getByText('文章を打つ速さを測って保存しました。')).toBeVisible();
  const message = sentenceGroup.locator('.personal-speed-message');
  // 知らせは値を並べない。値は結果の表が示す
  await expect(message).not.toContainText('ミリ秒');
  await expect(message).not.toContainText('Arpeggio');
  await expect(message).not.toContainText('別の配列で測ると');

  const saved = await stored(page) as { calibration: { keystrokeOverheadMs: Record<string, number>; actionsPerSecond: number } };
  expect(Object.keys(saved.calibration.keystrokeOverheadMs).sort()).toEqual([
    'arpeggio', 'arpeggio-boundary', 'arpeggio-within',
    'chain', 'chain-boundary', 'chain-within',
    'other', 'other-boundary', 'other-within',
    'repeat', 'sfb',
  ]);
  for (const value of Object.values(saved.calibration.keystrokeOverheadMs)) {
    expect(value).toBeGreaterThanOrEqual(-1000);
    expect(value).toBeLessThanOrEqual(1000);
  }
  // 他の項目は残る
  expect(saved.calibration.actionsPerSecond).toBe(5);
  await expect(sentenceGroup.locator('[id="personal-speed-overhead:other"]')).not.toHaveValue('');

  // 知らせの後に、種類×全体・かなの中・かなの境目の表が出る。続け打ちと同指連続は全体の列だけに値がある
  const result = sentenceGroup.locator('[data-personal-speed-sentence-result]');
  await expect(result).toBeVisible();
  await expect(result.locator('.personal-speed-result-table tbody tr')).toHaveCount(5);
  await expect(result.locator('.personal-speed-result-table thead th')).toHaveText(['種類', '全体', 'かなの中', 'かなの境目']);
  await expect(result.locator('.personal-speed-result-table tbody th')).toHaveText(['Arpeggio', 'Chain', 'その他', '続け打ち', '同指連続']);
  await expect(result.locator('[data-personal-speed-result-cell]')).toHaveCount(11);
  for (const cell of ['arpeggio', 'arpeggio-within', 'arpeggio-boundary', 'chain', 'chain-within', 'chain-boundary', 'other', 'other-within', 'other-boundary', 'repeat', 'sfb']) {
    // マスに、打鍵の上乗せ・打鍵の数・保存したかが出る
    await expect(result.locator(`[data-personal-speed-result-cell="${cell}"]`)).toContainText(/\d+打/);
    await expect(result.locator(`[data-personal-speed-result-cell="${cell}"]`)).toContainText('保存した');
  }
  // 基準の時間と打った間隔の四分位平均と注記は、畳んだ欄に入っている
  const details = result.locator('[data-personal-speed-result-details]');
  await expect(details).toHaveJSProperty('open', false);
  await expect(details.locator('[data-personal-speed-result-row]')).toHaveCount(11);
  await details.locator('summary').click();
  await expect(details.locator('[data-personal-speed-result-row="other-within"] th')).toHaveText('その他のかなの中');
  await expect(details).toContainText('一致しないことがあります');

  // 直接編集では、知らせも表も消えない
  await page.locator('#personal-speed-actions').fill('6');
  await page.locator('#personal-speed-actions').press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { actionsPerSecond: number } }).calibration.actionsPerSecond).toBe(6);
  await expect(sentenceGroup.getByText('文章を打つ速さを測って保存しました。')).toBeVisible();
  await expect(result).toBeVisible();
});

test('文章を打つ測定で、下限に届かない種類がある配列では、別の配列で測ると求まる種類が変わることと、測り直すと置き換わることが知らされる', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('.personal-speed-select-grid select').first().selectOption('oonishi');
  await page.locator('[data-personal-speed-start="sentence"]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toBeVisible();
  await typeThroughSentence(page);
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toHaveCount(0);
  await expect(page.getByText('文章を打つ速さを測って保存しました。')).toBeVisible();
  const message = page.locator('#personal-speed-group-sentence .personal-speed-message');
  await expect(message).toContainText('に満たない種類は保存していません');
  await expect(message).toContainText('手に馴染んだ別の配列で測ると、求まる種類が増えることがあります。');
  await expect(message).toContainText('測り直して保存すると、全ての種類が置き換わり、下限に届かなかった種類の値は無くなります。');
  await expect(page.locator('[data-personal-speed-sentence-result]')).toBeVisible();
});

test('文章を打つ測定は、何本目の何回目かを示し、1回目だけを数えない回と示す。2回目以降も次に打つキーが出る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  const position = page.locator('[data-personal-speed-sentence-position]');
  const learning = page.locator('[data-personal-speed-sentence-learning]');
  await expect(position).toHaveText('1本目 / 全16本、1回目 / 全3回');
  await expect(learning).toHaveText('1回目は文を覚える回です。この回は数えません。');
  await typeThroughRound(page);
  await expect(position).toHaveText('1本目 / 全16本、2回目 / 全3回');
  await expect(learning).toHaveCount(0);
  // 2回目も、示す文と次に打つキーが出る。
  await expect(page.locator('[data-personal-speed-sentence-run] [data-personal-speed-sentence]')).toHaveCount(1);
  await expect(page.locator('[data-personal-speed-next] kbd').first()).toBeVisible();
  await typeThroughRound(page);
  await typeThroughRound(page);
  await expect(position).toHaveText('2本目 / 全16本、1回目 / 全3回');
  await expect(learning).toBeVisible();
  await page.locator('[data-personal-speed-sentence-cancel]').click();
  expect(await stored(page)).toEqual(SEEDED);
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

test('他の測定を保存すると、基準が変わる打鍵の上乗せが消え、測り直しを促す知らせが出る', async ({ page }) => {
  const withOverhead = { ...SEEDED, calibration: { ...SEEDED.calibration, keystrokeOverheadMs: { other: 60 } } };
  await seed(page, { [STORAGE_KEY]: withOverhead });
  await open(page);
  await expect(page.locator('[id="personal-speed-overhead:other"]')).toHaveValue('60.0');
  await page.getByRole('button', { name: '通常の打鍵速度だけを測り直す' }).click();
  await typeThroughRun(page);
  // 消えた値のある文章を打つ速さのまとまりに、消えたことが出る。測ったまとまりにも知らせる
  await expect(page.locator('#personal-speed-group-sentence').getByText('打鍵の上乗せ（その他）は、他の値が変わったため消しました。文章を打つ速さをもう一度測ってください。')).toBeVisible();
  await expect(page.locator('#personal-speed-group-normal').getByText('文章を打つ速さの打鍵の上乗せが消えました。')).toBeVisible();
  const saved = await stored(page) as { calibration: Record<string, unknown> };
  expect('keystrokeOverheadMs' in saved.calibration).toBe(false);
  await expect(page.locator('[id="personal-speed-overhead:other"]')).toHaveValue('');
});

test('打鍵の上乗せを数値で直接編集して保存でき、空欄にすると消える。範囲外は保存されない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const group = page.locator('#personal-speed-group-sentence');
  const arpeggio = group.locator('[id="personal-speed-overhead:arpeggio"]');
  await arpeggio.fill('1000.5');
  await arpeggio.press('Enter');
  await expect(group.getByRole('alert').filter({ hasText: '打鍵の上乗せ Arpeggio' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);

  await arpeggio.fill('25');
  await arpeggio.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ arpeggio: 25 });

  // マイナス記号を打って負の値を保存できる。下限を下回る値は保存されない
  await arpeggio.fill('-25.5');
  await arpeggio.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ arpeggio: -25.5 });
  await expect(arpeggio).toHaveValue('-25.5');
  await arpeggio.fill('-1000.5');
  await arpeggio.press('Enter');
  await expect(group.getByRole('alert').filter({ hasText: '打鍵の上乗せ Arpeggio' })).toBeVisible();
  expect(((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ arpeggio: -25.5 });
  await arpeggio.fill('25');
  await arpeggio.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ arpeggio: 25 });

  // 保存した種類のマスは、保存していないマスと見た目が違う
  const measured = group.locator('[data-personal-speed-row="overhead:arpeggio"]');
  await expect(measured).toBeVisible();
  await expect(measured).not.toHaveClass(/personal-speed-cell-unmeasured/);
  await expect(group.locator('[data-personal-speed-row="overhead:chain"]')).toHaveClass(/personal-speed-cell-unmeasured/);
  await measured.locator('input').fill('');
  await measured.locator('input').press('Enter');
  await expect.poll(async () => 'keystrokeOverheadMs' in ((await stored(page)) as { calibration: object }).calibration).toBe(false);
});

test('かなの中・かなの境目の打鍵の上乗せを、分けない値を持たない保存値にも直接編集で足せる', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const group = page.locator('#personal-speed-group-sentence');
  const within = group.locator('[id="personal-speed-overhead:other-within"]');
  const boundary = group.locator('[id="personal-speed-overhead:other-boundary"]');
  await within.fill('30');
  await within.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ 'other-within': 30 });
  await boundary.fill('-90.5');
  await boundary.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ 'other-within': 30, 'other-boundary': -90.5 });
  // 範囲の外は保存されず、他の値はそのまま残る
  await within.fill('2000');
  await within.press('Enter');
  await expect(group.getByRole('alert').filter({ hasText: '打鍵の上乗せ その他のかなの中' })).toBeVisible();
  expect(((await stored(page)) as { calibration: { keystrokeOverheadMs: unknown } }).calibration.keystrokeOverheadMs).toEqual({ 'other-within': 30, 'other-boundary': -90.5 });
  await page.reload();
  await expect(group.locator('[id="personal-speed-overhead:other-within"]')).toHaveValue('30.0');
  await expect(group.locator('[id="personal-speed-overhead:other-boundary"]')).toHaveValue('-90.5');
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
  // 「こんしゅう」を、「ん」をnの1打で打つ。nnの2打ではなく1打で、次のかなのsへ進む。
  for (const key of 'kons') {
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
  await expect(page.locator('[data-personal-speed-next] kbd')).toHaveText(['Y']);
  // 示していた綴り（nn）より1打少ない分だけ、残りが減る。
  await expect(progress).toHaveText(`あと${total - 5}打`);
  // 最後まで打って保存する流れは別のテストが見る。ここは途中で中止する。
  await page.locator('[data-personal-speed-sentence-cancel]').click();
  await expect(page.locator('[data-personal-speed-sentence-run="active"]')).toHaveCount(0);
});

test('同じキーを続けて打つ速さを測り直すと、続け打ちの差が再生の時間を保つ値に置き換わり、知らせが出る', async ({ page }) => {
  const seeded = {
    ...SEEDED,
    calibration: { ...SEEDED.calibration, sameKeyActionsPerSecond: 6, keystrokeOverheadMs: { other: 60, repeat: 10, sfb: 20 } },
  };
  await seed(page, { [STORAGE_KEY]: seeded });
  await open(page);
  await page.getByRole('button', { name: '同じキーを続けて打つ速さだけを測り直す' }).click();
  await typeThroughRun(page);
  await expect(page.locator('#personal-speed-group-normal').getByText('同じキーを続けて打つ速さを測り直して保存しました。')).toBeVisible();
  await expect(page.locator('#personal-speed-group-sentence').getByText('打鍵の上乗せ（続け打ち）は、基準の時間が変わったため、再生の時間が変わらない値に置き換えました。')).toBeVisible();
  await expect(page.locator('#personal-speed-group-normal').getByText('続け打ちの打鍵の上乗せは置き換えました。')).toBeVisible();
  const saved = await stored(page) as { calibration: { sameKeyActionsPerSecond: number; keystrokeOverheadMs: Record<string, number> } };
  expect(saved.calibration.sameKeyActionsPerSecond).not.toBe(6);
  const { repeat, ...others } = saved.calibration.keystrokeOverheadMs;
  expect(others).toEqual({ other: 60, sfb: 20 });
  // 基準の時間と上乗せの和（続け打ちの再生の時間）が、測り直す前と同じ
  expect(repeat + 1000 / saved.calibration.sameKeyActionsPerSecond).toBeCloseTo(10 + 1000 / 6, 6);
  await expect(page.locator('[id="personal-speed-overhead:sfb"]')).toHaveValue('20.0');
});

test('同じキーを続けて打つ速さと、続け打ち・同指連続の差を数値で直接編集でき、空欄にすると消える。範囲外は保存されない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const sameKey = page.locator('[id="personal-speed-same-key"]');
  const repeat = page.locator('[id="personal-speed-overhead:repeat"]');
  const sfb = page.locator('[id="personal-speed-overhead:sfb"]');
  // 測っていない項目は、畳んだ一覧に入っている
  await page.locator('#personal-speed-group-normal details', { hasText: '測っていない項目' }).first().locator('summary').click();
  await expect(sameKey).toHaveValue('');

  await sameKey.fill('41');
  await sameKey.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: '同じキーを続けて打つ速さ' })).toBeVisible();
  expect(await stored(page)).toEqual(SEEDED);

  await sameKey.fill('7.5');
  await sameKey.press('Enter');
  await repeat.fill('12');
  await repeat.press('Enter');
  await sfb.fill('30');
  await sfb.press('Enter');
  await expect.poll(async () => {
    const calibration = ((await stored(page)) as { calibration: { sameKeyActionsPerSecond?: number; keystrokeOverheadMs?: unknown } }).calibration;
    return [calibration.sameKeyActionsPerSecond, calibration.keystrokeOverheadMs];
  }).toEqual([7.5, { repeat: 12, sfb: 30 }]);

  for (const field of [sameKey, repeat, sfb]) {
    await field.fill('');
    await field.press('Enter');
  }
  await expect.poll(async () => {
    const calibration = ((await stored(page)) as { calibration: object }).calibration;
    return 'sameKeyActionsPerSecond' in calibration || 'keystrokeOverheadMs' in calibration;
  }).toBe(false);
});

test('文章を打つ測定を始めると、今打つ文・次に打つキー・中止のボタンが画面の中に入る', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="sentence"]').click();
  const run = page.locator('[data-personal-speed-sentence-run="active"]');
  await expect(run).toBeVisible();
  for (const target of [
    run.locator('[data-personal-speed-sentence]'),
    run.locator('[data-personal-speed-next]'),
    run.locator('[data-personal-speed-sentence-cancel]'),
  ]) {
    await expect(target).toBeInViewport({ ratio: 1 });
  }
  await expect(run).toBeFocused();
});

test('スマートフォンの幅でも横にスクロールせず、測定中の案内が画面の中に入る', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await seed(page, {
    [STORAGE_KEY]: {
      ...SEEDED,
      calibration: {
        ...SEEDED.calibration,
        actionsPerSecondByDirection: { 'L→R': 5 },
        sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3 },
        keystrokeOverheadMs: { other: 60 },
      },
    },
  });
  await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // 全部の折りたたみを開いた状態でも、ページは横にスクロールしない。広い表は包む要素の中で横にスクロールする
  await page.evaluate(() => document.querySelectorAll('.personal-speed details').forEach((element) => { (element as HTMLDetailsElement).open = true; }));
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.locator('[data-personal-speed-start="sentence"]').click();
  const run = page.locator('[data-personal-speed-sentence-run="active"]');
  await expect(run).toBeVisible();
  await expect(run.locator('[data-personal-speed-next]')).toBeInViewport({ ratio: 1 });
  await expect(run.locator('[data-personal-speed-sentence-cancel]')).toBeInViewport({ ratio: 1 });
  expect(await overflow()).toBeLessThanOrEqual(0);
});

/** 同時押しの測定で、案内の2つのキーを同時に押すことを、完了まで繰り返す。Spaceの案内は「Space」で出る。 */
async function typeThroughSimultaneous(page: Page, onTask?: (keys: string[]) => Promise<void>): Promise<void> {
  const run = page.locator('[data-personal-speed-run="active"]');
  const instruction = page.locator('[data-personal-speed-instruction]');
  let lastText = '';
  for (let step = 0; step < 400; step += 1) {
    if (!(await run.isVisible())) return;
    const text = (await instruction.textContent({ timeout: 1000 }).catch(() => null)) ?? '';
    if (text === '') continue;
    const keys = [...text.matchAll(/「([^」]+)」/g)].map((match) => (match[1] === 'Space' ? ' ' : (match[1] ?? '').toLowerCase()));
    if (text !== lastText) {
      lastText = text;
      await onTask?.(keys);
    }
    for (const key of keys) await page.keyboard.down(key);
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForTimeout(45);
  }
  throw new Error('同時押しの測定が終わらなかった');
}

test('同時押しの測定をキー入力で行い、3種類の上乗せが保存される。親指の項目のSpaceはフォーカス中のボタンを押さない', async ({ page }) => {
  // 3項目の測定を、キーを1つずつ送って最後まで打つので、既定の30秒に収まらないことがある
  test.setTimeout(90_000);
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  await page.locator('[data-personal-speed-start="simultaneous"]').click();
  await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  const tasks: string[][] = [];
  await typeThroughSimultaneous(page, async (keys) => {
    tasks.push(keys);
    if (!keys.includes(' ')) {
      // Spaceを測るキーにしない項目では、Spaceを取らない
      expect(await probe(page, ' ')).toEqual({ prevented: false, reached: true });
      return;
    }
    // 中止のボタンにフォーカスがあってもSpaceで押されない
    await page.locator('[data-personal-speed-cancel]').focus();
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
    await expect(page.locator('[data-personal-speed-run="active"]')).toBeVisible();
  });
  expect(tasks.length).toBe(3);
  expect(tasks.filter((keys) => keys.includes(' ')).length).toBe(1);
  await expect(page.locator('#personal-speed-group-simultaneous').getByText('同時押しを測って保存しました。')).toBeVisible();

  const saved = await stored(page) as { calibration: { simultaneousOverheadMs: Record<string, number> } };
  expect(Object.keys(saved.calibration.simultaneousOverheadMs).sort()).toEqual(['both-hands', 'one-hand', 'thumb']);
  for (const value of Object.values(saved.calibration.simultaneousOverheadMs)) {
    expect(value).toBeGreaterThanOrEqual(-1000);
    expect(value).toBeLessThanOrEqual(1000);
  }
  await expect(page.locator('[id="personal-speed-simultaneous:thumb"]')).not.toHaveValue('');
  // 測った後は、Spaceを取らない
  expect(await probe(page, ' ')).toEqual({ prevented: false, reached: true });
});

test('同時押しの上乗せを数値で直接編集でき、範囲外は保存されない', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const group = page.locator('#personal-speed-group-simultaneous');
  const field = group.locator('[id="personal-speed-simultaneous:thumb"]');
  await group.locator('details', { hasText: '測っていない項目' }).locator('summary').click();
  await field.fill('48.5');
  await field.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { simultaneousOverheadMs?: unknown } }).calibration.simultaneousOverheadMs).toEqual({ thumb: 48.5 });
  await field.fill('1500');
  await field.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { simultaneousOverheadMs?: unknown } }).calibration.simultaneousOverheadMs).toEqual({ thumb: 48.5 });
  await field.fill('');
  await field.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { simultaneousOverheadMs?: unknown } }).calibration.simultaneousOverheadMs).toBeUndefined();
});

test('同手・別指の組ごとの速度は左右の手ごとの指×指の表で、片側の三角だけにマスがあり、測っていないマスは見た目が違う', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const left = page.locator('[data-personal-speed-grid="same-hand-pair:L"]');
  const right = page.locator('[data-personal-speed-grid="same-hand-pair:R"]');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(left.locator('thead th')).toHaveText(['指', '左小指', '左薬指', '左中指', '左人差し指']);
  // 4本×4本のうち、順序なしの組は6マス
  await expect(left.locator('[data-personal-speed-row]')).toHaveCount(6);
  await expect(right.locator('[data-personal-speed-row]')).toHaveCount(6);
  // 保存した組と測っていない組は、見た目で区別できる
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LM:LI"]')).not.toHaveClass(/personal-speed-cell-unmeasured/);
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LM:LI"] input')).toHaveValue('3.00');
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LP:LR"]')).toHaveClass(/personal-speed-cell-unmeasured/);
  await expect(left.getByRole('button', { name: '同手・別指 左小指と左薬指だけを測る' })).toBeVisible();
  await expect(left.getByRole('button', { name: '同手・別指 左中指と左人差し指だけを測り直す' })).toBeVisible();

  // 直接編集で値を足せる。範囲外は、そのマスの近くに理由が出る
  const cell = left.locator('[id="personal-speed-same-hand-pair:LP:LR"]');
  await cell.fill('9999');
  await cell.press('Enter');
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LP:LR"]').getByRole('alert')).toBeVisible();
  await cell.fill('2.5');
  await cell.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { sameHandDifferentFingerActionsPerSecondByPair: Record<string, number> } }).calibration.sameHandDifferentFingerActionsPerSecondByPair['LP:LR']).toBe(2.5);

  // マスの測るボタンは、その組だけを測る
  await left.getByRole('button', { name: '同手・別指 左小指と左薬指だけを測り直す' }).click();
  await expect(page.locator('#personal-speed-group-normal [data-personal-speed-run="active"]')).toBeVisible();
  await page.locator('[data-personal-speed-cancel]').click();
});

test('指×指の表は、同じ表の中央値から外れた保存値のマスに色と読み上げが付き、入力中は変わらず、確定すると変わる', async ({ page }) => {
  const pairs = { 'LP:LR': 1, 'LP:LM': 3, 'LP:LI': 3, 'LR:LM': 3, 'LR:LI': 3, 'LM:LI': 3, 'RI:RM': 3, 'RI:RR': 3, 'RI:RP': 3 };
  await seed(page, { [STORAGE_KEY]: { ...SEEDED, calibration: { ...SEEDED.calibration, sameHandDifferentFingerActionsPerSecondByPair: pairs } } });
  await open(page);
  const left = page.locator('[data-personal-speed-grid="same-hand-pair:L"]');
  const right = page.locator('[data-personal-speed-grid="same-hand-pair:R"]');
  const slow = left.locator('[data-personal-speed-row="same-hand-pair:LP:LR"]');
  await expect(slow).toHaveAttribute('data-personal-speed-deviation', 'slow');
  await expect(slow.locator('input')).toHaveAccessibleDescription('同じ表の他のマスより遅い');
  // 中央値のマス・別の手の表・保存値の無いマスには付かない
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LM:LI"]')).not.toHaveAttribute('data-personal-speed-deviation', /.+/);
  await expect(right.locator('[data-personal-speed-deviation]')).toHaveCount(0);
  await expect(page.getByText('色は、同じ表の他のマスと比べた速さです。')).toBeVisible();

  // 入力中の値では色が変わらない。確定すると、保存値で決まり直す
  const input = left.locator('[id="personal-speed-same-hand-pair:LM:LI"]');
  await input.fill('30');
  await expect(left.locator('[data-personal-speed-row="same-hand-pair:LM:LI"]')).not.toHaveAttribute('data-personal-speed-deviation', /.+/);
  await input.press('Enter');
  const fast = left.locator('[data-personal-speed-row="same-hand-pair:LM:LI"]');
  await expect(fast).toHaveAttribute('data-personal-speed-deviation', 'fast');
  await expect(fast.locator('input')).toHaveAccessibleDescription('同じ表の他のマスより速い');
});

test('同手・別指の方向別の速度は、行を前の指、列を次の指にした表で出し、同じ指どうしのマスは空ける', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: { ...SEEDED, calibration: { ...SEEDED.calibration, sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3 } } } });
  await open(page);
  const left = page.locator('[data-personal-speed-grid="directed-pair:L"]');
  await expect(left).toBeVisible();
  // 12マス（4本×4本から同じ指どうしの4マスを除く）
  await expect(left.locator('[data-personal-speed-row]')).toHaveCount(12);
  await expect(left.locator('[data-personal-speed-row="directed-pair:LM>LI"] input')).toHaveValue('3.00');
  await expect(left.locator('[data-personal-speed-row="directed-pair:LI>LM"] input')).toHaveValue('');
  await expect(left.locator('[data-personal-speed-row="directed-pair:LM>LM"]')).toHaveCount(0);
  // 行が前の指、列が次の指であることが、見える位置に書いてある
  await expect(left.locator('caption')).toContainText('行が前の指、列が次の指');
  const cell = left.locator('[id="personal-speed-directed-pair:LI>LM"]');
  await cell.fill('4');
  await cell.press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { sameHandDifferentFingerActionsPerDirectedPair: Record<string, number> } }).calibration.sameHandDifferentFingerActionsPerDirectedPair['LI>LM']).toBe(4);
});

test('説明と測り方の折りたたみは、保存値を持つまとまりでは閉じ、持たないまとまりでは開く。開閉は測っても変わらず、利用者の開閉は保たれる', async ({ page }) => {
  await seed(page, { [STORAGE_KEY]: SEEDED });
  await open(page);
  const explanation = (id: string) => page.locator(`[data-personal-speed-explanation="${id}"]`);
  await expect(explanation('normal')).toHaveJSProperty('open', false);
  await expect(explanation('directional')).toHaveJSProperty('open', true);
  await expect(explanation('simultaneous')).toHaveJSProperty('open', true);
  await expect(explanation('sentence')).toHaveJSProperty('open', true);
  // 仕様書へのリンクと測るボタンは、閉じていても見える
  await expect(page.locator('[data-personal-speed-spec="normal"] a')).toBeVisible();
  await expect(page.locator('[data-personal-speed-start="normal"]')).toBeVisible();
  // 利用者が閉じた状態は、保存値が変わっても保たれる
  await explanation('sentence').locator('summary').click();
  await expect(explanation('sentence')).toHaveJSProperty('open', false);
  await page.locator('#personal-speed-actions').fill('6');
  await page.locator('#personal-speed-actions').press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { actionsPerSecond: number } }).calibration.actionsPerSecond).toBe(6);
  await expect(explanation('sentence')).toHaveJSProperty('open', false);
  await expect(explanation('normal')).toHaveJSProperty('open', false);
  // 値を保存したまとまりでも、その場では閉じない。読み直すと閉じる
  await page.locator('#personal-speed-group-simultaneous details', { hasText: '測っていない項目' }).locator('summary').click();
  await page.locator('[id="personal-speed-simultaneous:thumb"]').fill('40');
  await page.locator('[id="personal-speed-simultaneous:thumb"]').press('Enter');
  await expect.poll(async () => ((await stored(page)) as { calibration: { simultaneousOverheadMs?: unknown } }).calibration.simultaneousOverheadMs).toEqual({ thumb: 40 });
  await expect(explanation('simultaneous')).toHaveJSProperty('open', true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '個人速度', level: 1 })).toBeVisible();
  await expect(explanation('simultaneous')).toHaveJSProperty('open', false);
});

import { expect, test, type Page } from './fixtures.ts';
import { openTextChip } from './context-bar-helper.ts';

/**
 * 打鍵再生の「入力:」の行。打ち終えた入力の欄が固定の幅を持ち、入力単位ごとの文字の数や字の幅が
 * 違っても、今の入力（下線）の1文字目の横の位置が動かないことを確かめる。
 * ローマ字の配列は既定で、打ち終えた入力をかな、今の入力とこの後の入力をローマ字で出す。
 * 行の位置や幅の検査は、かなで出す表示（`?romajiInput=false`）とローマ字で出す表示の両方で回し、
 * 文字の中身はそれぞれの表示で確かめる。
 */

/** かなだけで出す表示にするURLの検索部分 */
const KANA_ONLY = '?romajiInput=false';

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const seek = (page: Page) => feature(page).locator('[data-playback-seek]');
const current = (page: Page) => feature(page).locator('.playback-input-current');
const row = (page: Page) => feature(page).locator('[data-playback-history]');

// 拗音（1単位が2文字）と、英字・数字・半角の , . を混ぜる。欄に入る数を超える長さにする。
// 日本語のテキストは既定で、かな・英数字・、。以外の記号を評価の前に取り除く（配列が持つ , . は残る）ので、
// 取り除かれる記号は入れない。再生の表示は取り除いた後のテキストで並ぶ
const TEXT = 'きょうabcしゅくだい123おちゃxyz,ちゃちゅちょきょうabcしゅくだい456おちゃxyz.'.repeat(3);

async function openWithText(page: Page, width: number, search = '') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/analyzer/playback${search}`);
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const panel = await openTextChip(page);
  await panel.getByLabel('テキスト', { exact: true }).fill(TEXT);
  // 編集は少し遅れて反映されるので、チップの文字数が変わるのを待ってから閉じる
  await expect(page.locator('.context-bar button.text-chip .text-chip-count')).toHaveText(`${[...TEXT].length}字`, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(row(page).locator('.playback-input-planned').first()).toBeAttached({ timeout: 10_000 });
  await goTo(page, 1);
  await expect(row(page)).toContainText(search === '' ? 'kyo' : 'きょ', { timeout: 10_000 });
}

async function total(page: Page): Promise<number> {
  return Number(await seek(page).getAttribute('max'));
}

async function goTo(page: Page, position: number) {
  await seek(page).fill(String(position));
  await expect(feature(page).locator('[data-playback-position]')).toContainText(`${position} /`);
}

/** 行を左から読んだ、打ち終えた入力・今の入力・この後の入力の文字。隠れた左側も含む。 */
async function readRow(page: Page) {
  return row(page).evaluate((element) => {
    const segments = [...element.querySelectorAll('.playback-input-segment')];
    return segments.map((e) => ({
      kind: /playback-input-(completed|current|planned)/.exec(e.className)![1],
      text: e.textContent ?? '',
    }));
  });
}

for (const [name, search] of [
  ['ローマ字で出す表示', ''],
  ['かなで出す表示', KANA_ONLY],
] as const) {
  test(`今の入力の1文字目の横の位置が、打ち終えた入力の有無・多さによらず同じ（${name}）`, async ({ page }) => {
    // 1打鍵ごとに測るので、打鍵の数に比例して時間がかかる
    test.setTimeout(120_000);
    await openWithText(page, 1200, search);
    const last = await total(page);
    expect(last).toBeGreaterThan(100);

    const xs: number[] = [];
    const counts: number[] = [];
    // 1打鍵目（打ち終えた入力が無い）から、欄が埋まって溢れる先まで、1打鍵ごとに測る
    for (let position = 1; position <= last; position++) {
      await goTo(page, position);
      xs.push((await current(page).boundingBox())!.x);
      counts.push((await readRow(page)).filter((segment) => segment.kind === 'completed').length);
    }
    console.log(`MEASURE x=${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)} completedMax=${Math.max(...counts)}`);
    // 打ち終えた入力が無い・欄に満たない・欄から溢れる、のすべてを通っている
    expect(counts[0]).toBe(0);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(0.5);
  });
}

test('かなで出す表示: 打ち終えた入力・今の入力・この後の入力が、テキストの順に並ぶ', async ({ page }) => {
  await openWithText(page, 1200, KANA_ONLY);
  await goTo(page, 30);
  const segments = await readRow(page);
  const kinds = segments.map((segment) => segment.kind);
  const firstCurrent = kinds.indexOf('current');
  expect(kinds.filter((kind) => kind === 'current')).toHaveLength(1);
  expect(kinds.slice(0, firstCurrent).every((kind) => kind === 'completed')).toBe(true);
  expect(kinds.slice(firstCurrent + 1).every((kind) => kind === 'planned')).toBe(true);
  // 並べた文字は、テキストの一続きの部分になる
  expect(TEXT).toContain(segments.map((segment) => segment.text).join(''));
});

test('かなで出す表示: 行が狭くて欄が縮む時も、今の入力が文字の欄の中に見える', async ({ page }) => {
  await openWithText(page, 1200, KANA_ONLY);
  const last = await total(page);
  // ペインの幅はこれ以上縮まないので、行そのものに狭い幅を与えて、欄が縮む状況を作る
  await row(page).evaluate((element) => {
    (element as HTMLElement).style.width = '150px';
  });
  const done = feature(page).locator('.playback-history-done');
  const rest = feature(page).locator('.playback-history-rest');
  for (const position of [1, 12, 30, last]) {
    await goTo(page, position);
    const box = (await current(page).boundingBox())!;
    const restBox = (await rest.boundingBox())!;
    const doneBox = (await done.boundingBox())!;
    // 欄は決めた幅より縮んでいる
    expect(doneBox.width).toBeLessThan(10 * 0.82 * 16 - 1);
    expect(box.width).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(restBox.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(restBox.x + restBox.width + 0.5);
  }
});

test('ローマ字で出す表示: 打ち終えた入力はかな、今の入力とこの後の入力はローマ字で、状態の行に打鍵と予定が出ない', async ({ page }) => {
  await openWithText(page, 1200);
  const status = feature(page).locator('.playback-status-line');
  // 「きょう」の先頭: kを打った後。kを打ち終えた文字として分け、yoはまだ打っていない文字
  await goTo(page, 1);
  await expect(current(page)).toHaveText('kyo');
  await expect(current(page).locator('.playback-input-typed')).toHaveText('k');
  await expect(feature(page).locator('[data-playback-kana]')).toHaveText('きょ');
  await expect(status).not.toContainText('打鍵');
  await expect(status).not.toContainText('予定');
  await expect(feature(page).locator('[data-playback-typed]')).toHaveCount(0);
  // 単位の最後のステップを打ち終えた位置では、現在の単位がかなに戻る
  await goTo(page, 3);
  await expect(current(page)).toHaveText('きょ');
  // 次の単位に進むと、前の単位は打ち終えた入力としてかなで出る
  await goTo(page, 4);
  const segments = await readRow(page);
  expect(
    segments
      .filter((segment) => segment.kind === 'completed')
      .map((segment) => segment.text)
      .join(''),
  ).toBe('きょ');
  // 「う」は1打鍵で打ち終えるので、かなに戻っている
  expect(segments.find((segment) => segment.kind === 'current')!.text).toBe('う');
  const planned = segments.filter((segment) => segment.kind === 'planned');
  expect(planned.length).toBeGreaterThan(0);
  expect(planned.every((segment) => /^[A-Za-z0-9!?+,.-]+$/.test(segment.text))).toBe(true);
});

test('かなで出す表示: 状態の行に打鍵と予定が出て、入力の行はかなで出る', async ({ page }) => {
  await openWithText(page, 1200, KANA_ONLY);
  const status = feature(page).locator('.playback-status-line');
  await goTo(page, 1);
  await expect(status).toContainText('打鍵:');
  await expect(status).toContainText('予定:');
  await expect(current(page)).toHaveText('きょ');
  await expect(current(page).locator('.playback-input-typed')).toHaveCount(0);
});

test('ローマ字で出す表示: 行が狭くても、今の入力は省略記号で切れず、この後の入力だけが切れる', async ({ page }) => {
  await openWithText(page, 1200);
  await goTo(page, 1);
  const wide = (await current(page).boundingBox())!.width;
  await row(page).evaluate((element) => {
    (element as HTMLElement).style.width = '150px';
  });
  for (const position of [1, 12, 30]) {
    await goTo(page, position);
    const text = (await current(page).textContent()) ?? '';
    // 今の入力の幅は、行の幅に縮められない（文字数あたりの幅は一定）
    const box = (await current(page).boundingBox())!;
    expect(box.width / [...text].length).toBeGreaterThan((wide / 3) * 0.9);
  }
  // この後の入力は、残りの幅で省略記号に切れる
  const ahead = feature(page).locator('.playback-history-ahead');
  // 「ちゃちゅちょ」の手前では、この後の入力のローマ字が欄より長くなる
  let overflowed = false;
  for (let position = 1; position <= 40 && !overflowed; position++) {
    await goTo(page, position);
    overflowed = await ahead.evaluate((element) => element.scrollWidth > element.clientWidth);
  }
  expect(overflowed).toBe(true);
});

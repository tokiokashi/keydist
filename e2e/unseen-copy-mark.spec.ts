import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { installTimerCapture, type RaceWindow } from './text-timer-capture-helper.ts';

/**
 * 競合で選ばれないコピー（「…（編集） 2」等）ができた時の知らせ方。
 * 文脈バーのテキストのチップに点が付き、一覧でそのコピーに「新しい」と出て、
 * コピーを開くか一覧を見ると消える。通知（トースト・バナー）は出さない。
 *
 * 選ばれないコピーは、タブAの組み込みの書き換えが届く前にタブBが同じ組み込みへ打つと作られる。
 * 時間で競合を作るとずれるので、Bのdebounceタイマーを捕まえておき、Aの書き込みがBへ届いた後で
 * 撃つ（`text-content-timer-race.spec.ts`と同じ手順）。
 */

const TEXT_LIBRARY_KEY = 'keydist:text-library';

interface StoredText {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly unseen?: boolean;
}

async function readTexts(page: Page): Promise<readonly StoredText[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? [] : (JSON.parse(raw) as { texts: StoredText[] }).texts;
  }, TEXT_LIBRARY_KEY);
}

async function open(context: BrowserContext, width = 1440): Promise<{ pageA: Page; pageB: Page }> {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await installTimerCapture(pageB);
  for (const page of [pageA, pageB]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/bigram-flow');
    await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  }
  return { pageA, pageB };
}

/**
 * Bが組み込みへ打った書き込みを保留し、その間にAが同じ組み込みを書き換える。Bの選択がAの複製へ
 * 移ってから保留を撃つと、Bの書き込みは選ばれないコピーになる。
 */
async function makeUnseenCopy(pageA: Page, pageB: Page): Promise<StoredText> {
  await openTextChip(pageA);
  await openTextChip(pageB);
  await pageB.evaluate(() => (window as unknown as RaceWindow).__type('m'));
  await pageA.getByLabel('テキスト', { exact: true }).fill('tab-A');
  await expect.poll(async () => (await readTexts(pageA)).length).toBe(1);
  const [own] = await readTexts(pageA);
  await expect(pageB.getByLabel('テキストを選ぶ')).toHaveValue(`user:${own!.id}`);

  const fired = await pageB.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(fired).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await readTexts(pageA)).length).toBe(2);
  const copy = (await readTexts(pageA)).find((entry) => entry.id !== own!.id);
  expect(copy, 'Bの書き込みが選ばれないコピーとして残る').toBeDefined();
  return copy!;
}

const mark = (page: Page) => page.locator('.context-bar .text-chip .text-chip-unseen');

test('選ばれないコピーができると、チップに点が付き、一覧で「新しい」と出る', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  const copy = await makeUnseenCopy(pageA, pageB);
  expect((await readTexts(pageA)).filter((entry) => entry.unseen === true)).toHaveLength(1);
  expect(copy.unseen).toBe(true);

  // 別タブで起きた競合も、資産に印があるので両方のタブに出る
  await expect(mark(pageA)).toBeVisible();
  await expect(mark(pageB)).toBeVisible();
  // 通知は出さない
  await expect(pageA.getByRole('alert')).toHaveCount(0);
  await expect(pageA.getByRole('status')).toHaveCount(0);

  const options = pageA.getByLabel('テキストを選ぶ').locator('option');
  await expect(options.filter({ hasText: '新しい' })).toHaveCount(1);
  await expect(options.filter({ hasText: '新しい' })).toHaveText(`${copy.name}・新しい`);
});

test('一覧を見ると印が消える（見ている間は「新しい」が読める）', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  const select = pageA.getByLabel('テキストを選ぶ');

  await select.click();
  await expect(mark(pageA)).toBeVisible();
  await expect(select.locator('option', { hasText: '新しい' })).toHaveCount(1);

  // 一覧から離れると外れる。資産にも反映され、他タブの点も消える
  await pageA.getByLabel('テキスト', { exact: true }).click();
  await expect(mark(pageA)).toHaveCount(0);
  await expect.poll(async () => (await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(false);
  await expect(mark(pageB)).toHaveCount(0);
  await expect(select.locator('option', { hasText: '新しい' })).toHaveCount(0);
});

test('コピーを開くと印が消える', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  const copy = await makeUnseenCopy(pageA, pageB);
  await expect(mark(pageA)).toBeVisible();

  await pageA.getByLabel('テキストを選ぶ').selectOption({ value: `user:${copy.id}` });
  await expect(mark(pageA)).toHaveCount(0);
  await expect.poll(async () => (await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(false);
});

test('印を外した後の元に戻すは、直前の本文の編集を戻す', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  const body = pageA.getByLabel('テキスト', { exact: true });
  await expect(body).toHaveValue('tab-A');
  await body.fill('tab-A 編集後');
  await expect.poll(async () => (await readTexts(pageA)).map((entry) => entry.text)).toContain('tab-A 編集後');

  // 一覧を見て印を外す（履歴には積まない）
  await pageA.getByLabel('テキストを選ぶ').click();
  await body.click();
  await expect(mark(pageA)).toHaveCount(0);
  await expect.poll(async () => (await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(false);

  await pageA.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readTexts(pageA)).map((entry) => entry.text)).not.toContain('tab-A 編集後');
  const texts = await readTexts(pageA);
  expect(texts.map((entry) => entry.text)).toContain('tab-A');
  // 印は戻らない
  expect(texts.some((entry) => entry.unseen === true)).toBe(false);
  await expect(mark(pageA)).toHaveCount(0);
});

test('チップを開いて（フォーカスは一覧のまま）Escで閉じても、印は残る', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  // 本文にフォーカスがある状態で一度閉じてから、開き直す（開くと一覧にフォーカスが移る）
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByRole('dialog', { name: 'テキストの選択と編集' })).toHaveCount(0);
  await openTextChip(pageA);
  await expect(pageA.getByLabel('テキストを選ぶ')).toBeFocused();
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByRole('dialog', { name: 'テキストの選択と編集' })).toHaveCount(0);
  await expect(mark(pageA)).toBeVisible();
  expect((await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(true);
});

test('開き直した直後に↑を押し、Escで閉じても、印は残る', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  await pageA.keyboard.press('Escape');
  await openTextChip(pageA);
  await expect(pageA.getByLabel('テキストを選ぶ')).toBeFocused();
  // 閉じた一覧の素の↑は、一覧を開かずに値を動かすだけ
  await pageA.keyboard.press('ArrowUp');
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByRole('dialog', { name: 'テキストの選択と編集' })).toHaveCount(0);
  await expect(mark(pageA)).toBeVisible();
  expect((await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(true);
});

test('Tabで一覧から離れても、印は残る', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  await pageA.keyboard.press('Escape');
  await openTextChip(pageA);
  await expect(pageA.getByLabel('テキストを選ぶ')).toBeFocused();
  await pageA.keyboard.press('Tab');
  await expect(pageA.getByLabel('テキストを選ぶ')).not.toBeFocused();
  await expect(mark(pageA)).toBeVisible();
  expect((await readTexts(pageA)).some((entry) => entry.unseen === true)).toBe(true);
});

test('チップを閉じても、見ていなければ印は残る', async ({ context }) => {
  const { pageA, pageB } = await open(context);
  await makeUnseenCopy(pageA, pageB);
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByRole('dialog', { name: 'テキストの選択と編集' })).toHaveCount(0);
  await expect(mark(pageA)).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`文脈バーの幅が${width}pxでも点が見える`, async ({ context }) => {
    const { pageA, pageB } = await open(context, width);
    await makeUnseenCopy(pageA, pageB);
    await pageA.keyboard.press('Escape');
    await expect(mark(pageA)).toBeVisible();
    const box = await mark(pageA).boundingBox();
    expect(box).not.toBeNull();
    // 点が画面の内側にある
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (process.env.MARK_SHOTS) {
      await pageA.screenshot({ path: `${process.env.MARK_SHOTS}/${width}.png` });
    }
  });
}

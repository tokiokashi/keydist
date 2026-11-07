import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { installTimerCapture, type RaceWindow } from './text-timer-capture-helper.ts';

/**
 * 組み込みテキストの書き換えと複製の作成をまたぐ、本文の書き込み・他タブとの同期・元に戻すの回帰テスト。
 * 先頭の1本は、書き換えた直後の打鍵が複製を2つ作らず1つに書かれることを見る。
 *
 * 本文の書き込みは打鍵から`DEFAULT_DEBOUNCE_MS`だけ間引いてから行う。そのタイマーが書き込む経路はReactのイベントの外なので、
 * 描画が次のタスクまで遅れる。その間に届いた打鍵は描画前の宛先（組み込み）を持っていて、
 * 別の複製を作り、打鍵の1つが消えていた。タイマーは手で撃って、書き込みと次の打鍵の間を
 * 描画を挟まずに詰める。
 */

async function setup(page: Page): Promise<void> {
  await installTimerCapture(page);
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
}

async function storedTexts(page: Page): Promise<{ id: string; text: string }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? [] : (JSON.parse(raw) as { texts: { id: string; text: string }[] }).texts;
  });
}

async function storedTextCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
  });
}

test('複製ができた直後・描画の前に打った文字は、描画の後に打っても消えない', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
  // タイマーの書き込みで複製ができ、描画の前にbを打つ。
  const firedFirst = await page.evaluate(() => {
    const w = window as unknown as RaceWindow;
    const fired = w.__fire();
    w.__type('b');
    return fired;
  });
  expect(firedFirst).toBeGreaterThanOrEqual(1);
  // 選択が複製へ移った描画を待ってからcを打つ。
  await expect(page.getByLabel('テキストを選ぶ')).toHaveValue(/^user:/);
  await page.evaluate(() => (window as unknown as RaceWindow).__type('c'));
  const firedSecond = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedSecond).toBeGreaterThanOrEqual(1);

  const body = page.getByLabel('テキスト', { exact: true });
  await expect(body).toHaveValue(/abc$/);
  await expect.poll(async () => (await storedTexts(page)).map((t) => t.text.slice(-3))).toEqual(['abc']);
});

test('複製へ移った後に組み込みを選び直して打った本文は、その後に複製へ切り替えても複製を上書きしない', async ({ page }) => {
  await setup(page);
  const select = page.getByLabel('テキストを選ぶ');
  const builtinValue = await select.inputValue();
  await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
  const firedFirst = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedFirst).toBeGreaterThanOrEqual(1);
  const [copy] = await storedTexts(page);
  expect(copy.text.endsWith('a')).toBe(true);

  // 組み込みを選び直して打ち、間引きの待ちの間に複製へ切り替える。
  await select.selectOption(builtinValue);
  await page.evaluate(() => (window as unknown as RaceWindow).__type('z'));
  await select.selectOption(`user:${copy.id}`);
  const firedSecond = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedSecond).toBeGreaterThanOrEqual(1);

  await expect.poll(() => storedTextCount(page)).toBe(2);
  const [first, second] = await storedTexts(page);
  expect(first.id).toBe(copy.id);
  expect(first.text.endsWith('a')).toBe(true);
  expect(second.text.endsWith('z')).toBe(true);
});

test('他タブが作った複製へ選択が移っても、下書きは複製の本文へ揃う（自分の書き込みで移った時だけ下書きを保つ）', async ({ context }) => {
  // Bだけタイマーを捕まえる。Bは組み込みに`m`を打って保留し、その間にAが複製Dを作る。
  const pageB = await context.newPage();
  await setup(pageB);
  const pageA = await context.newPage();
  await pageA.goto('/analyzer/bigram-flow');
  await expect(pageA.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(pageA);
  await pageB.evaluate(() => (window as unknown as RaceWindow).__type('m'));
  await pageA.getByLabel('テキスト', { exact: true }).fill('fromA');
  await expect.poll(() => storedTextCount(pageA)).toBe(1);
  const [copy] = await storedTexts(pageA);
  // Bの選択がDへ移り、下書きがDの本文に揃うのを待つ。
  await expect(pageB.getByLabel('テキストを選ぶ')).toHaveValue(`user:${copy.id}`);
  await expect(pageB.getByLabel('テキスト', { exact: true })).toHaveValue('fromA');

  // Bの保留（組み込み宛ての`m`）を撃ってから`k`を打つ。Aの本文を上書きしない。
  const firedFirst = await pageB.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedFirst).toBeGreaterThanOrEqual(1);
  await pageB.evaluate(() => (window as unknown as RaceWindow).__type('k'));
  const firedSecond = await pageB.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedSecond).toBeGreaterThanOrEqual(1);
  await expect(pageB.getByLabel('テキスト', { exact: true })).toHaveValue('fromAk');
  await expect.poll(async () => (await storedTexts(pageB)).find((t) => t.id === copy.id)?.text).toBe('fromAk');
});

test('複製から組み込みへ、また複製へと選択欄で選び直しても、複製の本文は書き換え前の下書きに置き換わらない', async ({ page }) => {
  await setup(page);
  const select = page.getByLabel('テキストを選ぶ');
  const builtinValue = await select.inputValue();
  await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
  const firedFirst = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedFirst).toBeGreaterThanOrEqual(1);
  const [copy] = await storedTexts(page);
  const copyValue = `user:${copy.id}`;
  await expect(select).toHaveValue(copyValue);

  await select.selectOption(builtinValue);
  await select.selectOption(copyValue);
  const body = page.getByLabel('テキスト', { exact: true });
  await expect(body).toHaveValue(copy.text);

  await page.evaluate(() => (window as unknown as RaceWindow).__type('k'));
  const firedSecond = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
  expect(firedSecond).toBeGreaterThanOrEqual(1);
  await expect(body).toHaveValue(/ak$/);
  await expect.poll(async () => (await storedTexts(page)).map((t) => t.text.slice(-2))).toEqual(['ak']);
});

test('Undoは待ち中の本文の変更を先に書いてから戻す（その前の操作は戻さない）', async ({ page }) => {
  await page.clock.install();
  await page.goto('/analyzer/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  // 先に1手入れて履歴を作る（テキストを英文に切り替える）。
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');
  const textarea = panel.getByLabel('テキスト', { exact: true });
  const englishText = await textarea.inputValue();

  // 時計を止めて打つ。間引きのタイマーは発火しないので、本文の書き込みは待ち中のまま。
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);
  await textarea.fill('すぐに戻す編集');
  expect((await page.evaluate(() => localStorage.getItem('keydist:text-library'))) ?? '').not.toContain('すぐに戻す編集');

  // 戻すと、待ち中の本文（組み込みの書き換え＝自作のコピー）だけが戻り、英文の選択は残る。
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(chip).toContainText('英文');
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(englishText);
  await expect(bar.getByRole('button', { name: 'やり直す' })).toBeEnabled();

  // 時計を進めても、待っていた書き込みが遅れて入ることはない。
  await page.clock.runFor(5_000);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(englishText);
  await expect(chip).toContainText('英文');
});

test('テキストの名前は、チップの外を押して閉じても書かれ、「元に戻す」はその変更を戻す', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  let panel = await openTextChip(page);
  await panel.getByRole('button', { name: '複製', exact: true }).click();
  const name = panel.getByLabel('テキストの名前');
  await expect(name).toBeEnabled();

  // 1回目: 欄に打ってすぐチップの外（ページの見出し）を押す。
  await name.fill('名前その1');
  // チップの外にある操作の無い要素（本体の図の見出し）を押す。ボタンやリンクを含まない見出しで、パネルの外にある。
  const outside = page.getByRole('heading', { name: /^Relative vectors/ });
  await expect(panel.getByRole('heading', { name: /^Relative vectors/ })).toHaveCount(0);
  await expect(outside.locator('a, button, input')).toHaveCount(0);
  await outside.click();
  await expect(panel).toBeHidden();
  await expect(chip).toContainText('名前その1');

  // 2回目: 打ってすぐ「元に戻す」を押す。入力中の名前を確定してから戻すので、1回目の名前に戻る。
  panel = await openTextChip(page);
  await panel.getByLabel('テキストの名前').fill('名前その2');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(chip).toContainText('名前その1');
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(chip).toContainText('名前その2');

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('keydist:text-library'))).toContain('名前その2');
});

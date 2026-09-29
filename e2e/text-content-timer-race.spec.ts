import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { DEFAULT_DEBOUNCE_MS } from '../src/platform/persistence/debounced-scheduler.ts';

/**
 * 組み込みテキストを書き換えた直後の打鍵が、複製を2つ作らず1つに書かれることの回帰テスト（#707）。
 *
 * 本文の書き込みは打鍵から`DEFAULT_DEBOUNCE_MS`だけ間引いてから行う。そのタイマーが書き込む経路はReactのイベントの外なので、
 * 描画が次のタスクまで遅れる。その間に届いた打鍵は描画前の宛先（組み込み）を持っていて、
 * 別の複製を作り、打鍵の1つが消えていた。タイマーは手で撃って、書き込みと次の打鍵の間を
 * 描画を挟まずに詰める（挟む場合も確かめる）。
 */

interface RaceWindow {
  __timers: Map<number, () => void>;
  __fire: () => number;
  __type: (s: string) => void;
}

async function setup(page: Page): Promise<void> {
  await page.addInitScript((debounceMs) => {
    const w = window as unknown as RaceWindow;
    w.__timers = new Map();
    let fake = 1e9;
    const origSet = window.setTimeout.bind(window);
    const origClear = window.clearTimeout.bind(window);
    // 本文のdebounce（`DEFAULT_DEBOUNCE_MS`）だけ横取りして、テストが撃つまで待たせる。
    // 定数が変わっても捕まえ損ねないよう、撃った件数は各テストで検査する。
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === debounceMs) {
        const id = ++fake;
        w.__timers.set(id, fn);
        return id;
      }
      return origSet(fn, ms, ...args);
    };
    (window as unknown as { clearTimeout: unknown }).clearTimeout = (id: number) => {
      if (w.__timers.has(id)) {
        w.__timers.delete(id);
        return;
      }
      origClear(id);
    };
    w.__fire = () => {
      const entries = [...w.__timers.values()];
      w.__timers.clear();
      for (const fn of entries) fn();
      return entries.length;
    };
    // Reactが拾う形で1文字足す（valueのsetterを直接呼び、inputイベントを起こす）。
    w.__type = (s: string) => {
      const ta = document.querySelector('textarea[aria-label="テキスト"]') as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(ta, ta.value + s);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }, DEFAULT_DEBOUNCE_MS);
  await page.goto('/standalone/bigram-flow');
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

for (const yieldBetween of [false, true]) {
  test(`タイマーの書き込み直後の打鍵が複製を増やさない（描画を挟む: ${yieldBetween}）`, async ({ page }) => {
    await setup(page);
    await page.evaluate(() => (window as unknown as RaceWindow).__type('a'));
    const firedFirst = await page.evaluate(async (yieldFirst) => {
      const w = window as unknown as RaceWindow;
      const fired = w.__fire();
      if (yieldFirst) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => requestAnimationFrame(() => resolve(null));
          channel.port2.postMessage(0);
        });
      }
      w.__type('b');
      return fired;
    }, yieldBetween);
    const firedSecond = await page.evaluate(() => (window as unknown as RaceWindow).__fire());
    expect(firedFirst).toBeGreaterThanOrEqual(1);
    expect(firedSecond).toBeGreaterThanOrEqual(1);

    const body = page.getByLabel('テキスト', { exact: true });
    await expect.poll(() => storedTextCount(page)).toBe(1);
    await expect(body).toHaveValue(/ab$/);
    await page.waitForTimeout(300);
    expect(await storedTextCount(page)).toBe(1);
    await expect(body).toHaveValue(/ab$/);
  });
}

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

test('複製ができた直後・描画の前に打った文字は、描画の後に打っても消えない（#711）', async ({ page }) => {
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

test('他タブが同じ複製の本文を書き換えたら、下書きがそれに揃う', async ({ context }) => {
  const pageA = await context.newPage();
  await pageA.goto('/standalone/bigram-flow');
  await expect(pageA.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(pageA);
  const bodyA = pageA.getByLabel('テキスト', { exact: true });
  await bodyA.fill('own-copy');
  await expect.poll(() => storedTextCount(pageA)).toBe(1);
  const [copy] = await storedTexts(pageA);

  const pageB = await context.newPage();
  await pageB.goto('/standalone/bigram-flow');
  await expect(pageB.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(pageB);
  await expect(pageB.getByLabel('テキストを選ぶ')).toHaveValue(`user:${copy.id}`);
  await pageB.getByLabel('テキスト', { exact: true }).fill('from-other-tab');
  await expect.poll(async () => (await storedTexts(pageA))[0]?.text).toBe('from-other-tab');
  await expect(bodyA).toHaveValue('from-other-tab');
});

test('他タブが作った複製へ選択が移っても、下書きは複製の本文へ揃う（自分の書き込みで移った時だけ下書きを保つ）', async ({ context }) => {
  // Bだけタイマーを捕まえる。Bは組み込みに`m`を打って保留し、その間にAが複製Dを作る。
  const pageB = await context.newPage();
  await setup(pageB);
  const pageA = await context.newPage();
  await pageA.goto('/standalone/bigram-flow');
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

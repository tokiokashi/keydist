import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';

/**
 * コレクション資産（1つのstorageキーへ丸ごと書く`setupLibrary`・`textLibrary`）の
 * タブ間書き込み競合の回帰テスト（#544 §8-2 タブ間ルール）。
 *
 * 他タブの書き込みはstorageイベントで非同期に届くので、届く前に自タブが同じ資産へ書くと
 * 古い手持ちを土台にした丸ごと上書きで他タブの追加が消えていた。タイミングに左右される
 * ものは同じ操作を繰り返して1回も消えないことを確かめる。
 */

const ITERATIONS = Number(process.env.ITER ?? 15);
const TEXT_LIBRARY_KEY = 'keydist:text-library';
const TEXT_SELECTION_KEY = 'keydist:standalone-text-selection';

interface StoredText {
  readonly id: string;
  readonly text: string;
}

async function readTexts(page: Page): Promise<readonly StoredText[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? [] : (JSON.parse(raw) as { texts: StoredText[] }).texts;
  }, TEXT_LIBRARY_KEY);
}

/** `check`が真になるまで待つ。`timeout`内に真にならなければ偽を返す（失敗を数えるため、投げない）。 */
async function settles(check: () => Promise<boolean>, timeout = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

async function openBoth(pageA: Page, pageB: Page): Promise<void> {
  await Promise.all([
    pageA.goto('/standalone/bigram-flow', { waitUntil: 'commit' }),
    pageB.goto('/standalone/bigram-flow', { waitUntil: 'commit' }),
  ]);
  await expect(pageA.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
}

test('通知が届く前の他タブの追加を、自タブの書き込みで消さない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  const create = page.getByRole('button', { name: '新規作成' });
  await create.click();
  await expect.poll(async () => (await readTexts(page)).length).toBe(1);

  for (let i = 0; i < ITERATIONS; i++) {
    // 同じページからstorageへ書いてもそのページにはstorageイベントが届かない。
    // 他タブが書いたが通知がまだ届いていない状態を、タイミングに頼らず作る
    const injectedId = await page.evaluate((key) => {
      const library = JSON.parse(localStorage.getItem(key)!) as { texts: { id: string; name: string }[] };
      const id = `other-tab-${library.texts.length}`;
      library.texts.push({ ...library.texts[0]!, id, name: id });
      localStorage.setItem(key, JSON.stringify(library));
      return id;
    }, TEXT_LIBRARY_KEY);
    const before = (await readTexts(page)).length;
    await create.click();
    await expect.poll(async () => (await readTexts(page)).length).toBe(before + 1);
    expect((await readTexts(page)).map((entry) => entry.id)).toContain(injectedId);
  }
});

test('2タブが同じ組み込みテキストを続けて書き換えても、両方の本文が残る', async ({ context }, testInfo) => {
  testInfo.setTimeout(180_000);
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  const failures: string[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    if (i > 0) {
      await pageA.evaluate((keys) => {
        for (const key of keys) localStorage.removeItem(key);
      }, [TEXT_LIBRARY_KEY, TEXT_SELECTION_KEY]);
    }
    await openBoth(pageA, pageB);

    // Bは組み込みのまま打ち始め、Bの反映（debounce後）より先にAのcopy-on-writeが届く。
    // Bの反映時には選択がAの複製へ移っているので、以前はBの入力が捨てられていた
    const textA = `tab-A-${i}`;
    const textB = `tab-B-${i}`;
    // チップを開く時間でAとBの間隔が変わらないよう、両方を先に開いておく。
    await openTextChip(pageA);
    await openTextChip(pageB);
    await pageA.getByLabel('テキスト', { exact: true }).fill(textA);
    await pageB.waitForTimeout(100);
    await pageB.getByLabel('テキスト', { exact: true }).fill(textB);
    const ok = await settles(async () => {
      const texts = (await readTexts(pageA)).map((entry) => entry.text);
      return texts.includes(textA) && texts.includes(textB);
    });
    if (!ok) failures.push(`#${i}: ${JSON.stringify((await readTexts(pageA)).map((entry) => entry.text))}`);
  }
  expect(failures).toEqual([]);
});

test('通知が届く前の他タブの追加を、Undoで消さない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  await page.getByRole('button', { name: '新規作成' }).click();
  await expect.poll(async () => (await readTexts(page)).length).toBe(1);
  const undoButton = page.getByRole('button', { name: '元に戻す' });
  await expect(undoButton).toBeEnabled();

  // 他タブが書いたが通知がまだ届いていない状態を作る（同じページからの書き込みには
  // storageイベントが届かない）。この状態でUndoしても、他タブの追加が残ること
  const injectedId = await page.evaluate((key) => {
    const library = JSON.parse(localStorage.getItem(key)!) as { texts: { id: string; name: string }[] };
    const id = 'other-tab-added';
    library.texts.push({ ...library.texts[0]!, id, name: id });
    localStorage.setItem(key, JSON.stringify(library));
    return id;
  }, TEXT_LIBRARY_KEY);
  await undoButton.click();
  // Undoの結果は非同期に描画へ届くので、少し待ってから残っていることを確かめる
  await page.waitForTimeout(500);
  expect((await readTexts(page)).map((entry) => entry.id)).toContain(injectedId);
});

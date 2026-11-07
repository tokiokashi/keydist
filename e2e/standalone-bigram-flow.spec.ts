import { expect, PAGE_TAG, test, type Locator, type Page } from './fixtures.ts';
import { openTextChip } from './context-bar-helper.ts';
import { expectChosenTarget, openSettings, toggleTarget } from './pane-helper.ts';
import { useKanaText } from './kana-text-helper.ts';

/**
 * Bigram Flow単体ページのE2E。
 * ページの本は、条件のモーダルで値を変えると要約と出どころに出る所まで。
 * データの場面は、再読み込み・共有リンク・別タブの競合を扱う。
 * 既定のテキストを使う場面があるので、個別画面のテキストを短い本文から始める共通の準備は外す。
 */
test.use({ shortText: false });

/** 条件のモーダルを開いて返す。 */
async function openConditionModal(page: Page): Promise<Locator> {
  await page.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

test('条件のモーダル: 全体の値を変えると要約と出どころに出て、文脈バーの元に戻す/やり直すが効く', { tag: PAGE_TAG }, async ({ page }) => {
  await useKanaText(page);
  await page.goto('/analyzer/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const trigger = page.locator('.pane-condition-trigger');

  const modal = await openConditionModal(page);
  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  const row = modal.locator('[data-item="windowSize"]');
  await expect(row).toHaveAttribute('data-changed', 'true');
  await expect(row).toContainText('全体で変更');
  await expect(row.locator('output[aria-label="先読みN"]')).toHaveText('4');

  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(trigger).toContainText('先読みN: 4');

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(trigger).toHaveText('条件すべて既定値');
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(trigger).toContainText('先読みN: 4');
});

/**
 * テキストのdebounce書き込みも解析設定と同じ`useDebouncedCommit`を通すので、
 * 「解析設定はdebounce完了前にリロードしても残る」と同じ`page.clock`パターンで、組み込み→
 * copy-on-writeの場合とユーザーテキストの直接編集の場合の両方を確認する。
 */
test('打ってすぐリロードしても編集が残る（組み込みからのcopy-on-write、debounce完了前）', async ({ page }) => {
  await page.clock.install();
  await page.goto('/analyzer/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('debounce完了前にリロードする編集(組み込み)');

  // クロックを1ミリ秒も進めていないので、debounceのsetTimeoutは絶対に発火していない。
  const rawBeforeReload = await page.evaluate(() => localStorage.getItem('keydist:text-library'));
  expect(rawBeforeReload ?? '').not.toContain('debounce完了前にリロードする編集');

  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('debounce完了前にリロードする編集(組み込み)');
});

test('解析設定はdebounce完了前にリロードしても残る（pagehideでflushする）', async ({ page }) => {
  // `page.clock`でタイマーを止め、debounce（既定400ms）のsetTimeoutが実時間経過で
  // 勝手に発火する競合を無くす（間引きが実時間ベースなので、素の待ち時間比較だと
  // テスト環境の遅さ次第でdebounceが先に終わってしまい、flushの効果を区別できない）。
  // `install()`だけでは時計は普通に進み続けるので、ページの読み込みを終えてから
  // `pauseAt(現在時刻)`で明示的に止める（`fastForward`等を呼ばない限りsetTimeoutは
  // 二度と発火しない。Playwright Clock APIのドキュメント参照）。
  await page.clock.install();
  await page.goto('/analyzer/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  // ブラウザ側で実際に読んだ現在時刻を使っても、往復のRPCの間に実時間が経過し、
  // `pauseAt`が処理される時点では既に「過去」になっていてエラーになることがある
  // （sinon fake timersは指定時刻へ`Cannot fast-forward to the past`を返す）。
  // 十分先の未来（1分後）へジャンプすれば、往復にかかる程度のずれは問題にならない。
  // まだ何のタイマーも仕掛けていない時点（クリック前）でのジャンプなので、
  // 何かが誤って発火することもない。
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);

  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
  await expect(withinHand).toHaveAttribute('aria-pressed', 'false');
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  // クロックを1ミリ秒も進めていないので、debounceのsetTimeoutは絶対に発火していない
  // （＝storageはまだ書かれていない）ことが保証される。
  const rawBeforeReload = await page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options'));
  expect(rawBeforeReload ?? '').not.toContain('within-hand');

  // `use-debounced-commit.ts`が`pagehide`でflushしていなければ、この時点のstorageは
  // まだ変更前の値のままで、リロード後に選択が消える。
  await page.reload();

  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect((await openSettings(page)).getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
});

test('共有リンクで対象（配列）が届き、取り込み後はURLから消える。Undoで受け取る前へ戻る', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/analyzer/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await toggleTarget(page, 'layout:dvorak');
  await expectChosenTarget(page, 'layout:dvorak');
  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーしました' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('target=layout%3Advorak');

  const other = await context.browser()!.newContext();
  try {
    const opened = await other.newPage();
    await opened.goto(url);
    await expect(opened.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
    await expectChosenTarget(opened, 'layout:dvorak');
    await expect(opened).toHaveURL(/\/analyzer\/bigram-flow$/);
    await expect(opened.locator('[data-pane-link-notice="true"]')).toHaveCount(0);
    // 開くだけで選択の自動オープン等が起きず、Undoで受け取る前（未選択＝既定のQWERTY）へ戻る。
    await opened.getByRole('button', { name: '元に戻す' }).click();
    await expectChosenTarget(opened, 'layout:qwerty');
  } finally {
    await other.close();
  }
});

/**
 * クロスタブの競合の再現（e2e版。unit testは`commands.test.ts`の
 * 同名テスト参照）。タブA・タブBが同じユーザーテキスト（u1）を選択中、タブBがu1へ入力した
 * debounce書き込みが適用される前に、タブAがu2へ選択を切り替えた変更が届くと、
 * 適用時点の「今の選択」を読み直す実装だと、
 * Bの入力がu2へ書き込まれてしまう。
 * `setTextContentCommand`は打鍵時点のref（u1）を明示的に運ぶので、その後どちらのタブで
 * 選択が動いてもu1だけが書き換わる。正確な再現時刻（372〜384ms）を毎回作るのではなく、
 * 待ち時間を周回ごとに揺らしながら繰り返すことで、特定のタイミングに依存せず直っている
 * ことを確認する。
 */
test('タブ間の競合修正: 他タブの選択切り替えが割り込んでも、入力中のテキストが別テキストへ漏れない（Nイテレーション）', async ({ context }, testInfo) => {
  // 12回の周回それぞれで約380msの意図的な待ち時間を挟むため、既定の30秒では
  // 並列実行時の負荷次第で規定のタイムアウトに達することがある。周回数に見合う時間を明示的に確保する。
  testInfo.setTimeout(90_000);
  const ITERATIONS = 12;

  await context.addInitScript(() => {
    localStorage.setItem(
      'keydist:text-library',
      JSON.stringify({
        version: 1,
        texts: [
          { id: 'u1', name: 'u1', text: 'one' },
          { id: 'u2', name: 'u2', text: 'two' },
        ],
      }),
    );
    localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'user', id: 'u1' } }));
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto('/analyzer/bigram-flow');
  await pageB.goto('/analyzer/bigram-flow');
  await expect(pageA.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  await openTextChip(pageB);
  const textareaB = pageB.getByLabel('テキスト', { exact: true });
  // 周回の前提（Bはu1を表示している）を、実際に画面へ出ていることで確かめてから始める。
  await expect(textareaB).toHaveValue('one');
  await openTextChip(pageA);
  const pickerA = pageA.getByLabel('テキストを選ぶ', { exact: true });
  await openTextChip(pageB);
  const pickerB = pageB.getByLabel('テキストを選ぶ', { exact: true });

  const textLibraryOf = (page: typeof pageA) =>
    page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? [] : (JSON.parse(raw) as { texts: { id: string; text: string }[] }).texts;
    });

  for (let i = 0; i < ITERATIONS; i++) {
    const value = `typed-in-B-for-u1-${i}`;
    await textareaB.fill(value);
    // レビュー報告の372〜384msに寄せつつ、周回ごとに少し揺らす
    // （特定の一瞬だけに依存した確認にしないため）。
    // 保存のdebounce（400ms）の手前という実時間の位置が検査の中身なので、実時間で待つ。
    await pageA.waitForTimeout(372 + (i % 13));
    await pickerA.selectOption({ label: 'u2' });

    await expect.poll(async () => (await textLibraryOf(pageB)).find((text) => text.id === 'u1')?.text, { timeout: 2000 }).toEqual(value);

    const texts = await textLibraryOf(pageB);
    expect(texts.find((text) => text.id === 'u2')?.text, `iteration ${i}: u2はBの入力(${value})で汚染されていないはず`).toEqual('two');

    // 次の周回のため両タブの選択をu1へ戻す。
    await pickerB.selectOption({ label: 'u1' });
    await pickerA.selectOption({ label: 'u1' });
    await expect(pickerB).toHaveValue('user:u1');
  }

  await pageA.close();
  await pageB.close();
});

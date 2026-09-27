import { expect, test } from '@playwright/test';

/**
 * Bigram Flow単体ページ（#544 Phase 3「最初の縦切り」）のE2E。
 * ペインの枠（見出し・条件・状態表示）とBigram Flowの可視化が実際に描画され、
 * 設定変更・テキスト変更に追従することを確認する。
 */
test('単体ページが開き、Bigram Flowが描画される', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');

  await expect(page.getByRole('heading', { name: 'Bigram Flow', exact: true }).first()).toBeVisible();

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expect(flow).toHaveAttribute('data-layout-id', /.+/);
  await expect(flow).toHaveAttribute('data-geometry-id', /.+/);

  // ペインの枠: 状態バッジがreadyになっている。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready');

  // 条件の表示（出どころ含む）。
  await pane.locator('.pane-condition-summary summary').click();
  await expect(pane.locator('.pane-condition-summary')).toContainText('既定値');
});

test('見た目だけの設定を変えても壊れず、抽出設定を変えると表示が変わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const lineScale = flow.getByLabel('紐の太さのスケール');
  await lineScale.selectOption('sqrt');
  await expect(lineScale).toHaveValue('sqrt');

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');
});

test('テキストを変えると条件・可視化が追従する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('hello world hello world hello world');

  // debounce後、Trace/抽出が新しいテキストで再計算されペインが再びreadyになる。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
});

test('サンプルを選ぶとテキストが置き換わる（言語を選ぶUIは無い）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  const before = await textarea.inputValue();

  const sample = page.getByLabel('サンプル', { exact: true });
  await sample.selectOption({ label: '英文（既定）' });

  await expect(textarea).not.toHaveValue(before);
  await expect(sample).toHaveValue('en:default');

  // ペインが新しいテキストで再びreadyになる（見えている変化が実際にengineへ届いたことの確認）。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
});

test('解析設定はリロードしても残る（資産として保持する）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await expect(withinHand).toHaveAttribute('aria-pressed', 'false');
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  // 資産への反映はdebounceされる（`use-debounced-commit.ts`、既定400ms）ので、
  // storageに実際に書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')))
    .toContain('within-hand');

  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(flowAfterReload.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
});

test('解析設定はdebounce完了前にリロードしても残る（pagehideでflushする）', async ({ page }) => {
  // `page.clock`でタイマーを止め、debounce（既定400ms）のsetTimeoutが実時間経過で
  // 勝手に発火する競合を無くす（間引きが実時間ベースなので、素の待ち時間比較だと
  // テスト環境の遅さ次第でdebounceが先に終わってしまい、flushの効果を区別できない）。
  // `install()`だけでは時計は普通に進み続けるので、ページの読み込みを終えてから
  // `pauseAt(現在時刻)`で明示的に止める（`fastForward`等を呼ばない限りsetTimeoutは
  // 二度と発火しない。Playwright Clock APIのドキュメント参照）。
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
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

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await expect(withinHand).toHaveAttribute('aria-pressed', 'false');
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  // クロックを1ミリ秒も進めていないので、debounceのsetTimeoutは絶対に発火していない
  // （＝storageはまだ書かれていない）ことが保証される。
  const rawBeforeReload = await page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options'));
  expect(rawBeforeReload ?? '').not.toContain('within-hand');

  // `use-debounced-commit.ts`が`pagehide`でflushしていなければ、この時点のstorageは
  // まだ変更前の値のままで、リロード後に選択が消える（レビューで指摘された不具合の再現）。
  await page.reload();

  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(flowAfterReload.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
});

test('保存された解析設定が壊れていたら、既定値へ戻しつつ診断をペインに表示する', async ({ page }) => {
  // 対応するAnalyzer id（'bigram-flow'）に壊れた値を仕込んでから開く
  // （`decodeStoredAnalyzerOptions`が捨てずに`diagnostics`として返し、
  // `PaneFrame`の`settingsDiagnostics`へ届くことを確認する。#544レビュー対応）。
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:standalone-analyzer-options',
      JSON.stringify({ version: 1, 'bigram-flow': { source: 'no-such-source' } }),
    );
  });
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const diagnostics = page.locator('[data-pane-settings-diagnostics="true"]');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics).toContainText('既定値へ戻した');

  // 既定値へ戻っているので、Actualが選ばれている（壊れた値のsourceは使われない）。
  const actual = flow.getByRole('button', { name: 'Actual', exact: true });
  await expect(actual).toHaveAttribute('aria-pressed', 'true');
});

test('タブ間同期: 別タブでのテキスト変更が届き、複数回変えても届き続ける', async ({ context }) => {
  /**
   * タブ間同期の回帰テスト（#544レビュー: `createAssetTabSync`の購読を構築時に自動開始し、
   * `useEffect`のcleanupでだけ停止していたため、ReactのStrictMode（開発時のmount→cleanup→
   * mount二重実行）を経ると2回目以降ずっと外部タブの変更を受け取れなくなっていた。
   * 1回だけの変更では気づけない不具合なので、ここでは3回連続で変更して確認する）。
   */
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto('/standalone/bigram-flow');
  await pageB.goto('/standalone/bigram-flow');
  await expect(pageA.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  const textareaA = pageA.getByLabel('テキスト', { exact: true });
  const textareaB = pageB.getByLabel('テキスト', { exact: true });

  for (const text of ['1回目の変更', '2回目の変更', '3回目の変更']) {
    await textareaB.fill(text);
    await expect(textareaA).toHaveValue(text, { timeout: 10_000 });
  }

  await pageA.close();
  await pageB.close();
});

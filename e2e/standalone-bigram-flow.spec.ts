import { expect, test } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { enabledValues, recordControlStates } from './options-draft-recorder.ts';
import { expectChosenTarget, openSettings, openTargetSelection, targetButton, toggleTarget } from './pane-helper.ts';

/**
 * Bigram Flow単体ページ（#544 Phase 3「最初の縦切り」）のE2E。
 * ペインの枠（見出し・条件・状態表示）とBigram Flowの可視化が実際に描画され、
 * 設定変更・テキスト変更に追従することを確認する。
 */
test('単体ページが開き、Bigram Flowが描画される', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');

  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: 'Bigram Flow', exact: true, level: 1 })).toBeVisible();

  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expect(flow).toHaveAttribute('data-layout-id', /.+/);
  await expect(flow).toHaveAttribute('data-geometry-id', /.+/);

  // ペインの枠: 状態バッジがreadyになっている。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready');

  // 条件の要約: 何も変えていなければ閉じた1行は「すべて既定値」。開くと出どころが出る。
  const conditions = pane.locator('.pane-condition-summary');
  await expect(conditions.locator('summary')).toHaveText('条件すべて既定値');
  await conditions.locator('summary').click();
  await expect(conditions.locator('.pane-condition-row').first()).toContainText('（既定値）');
});

test('条件の要約: 変えた項目を閉じた1行に出し、開くと上に並べて出どころを添える', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });

  await page.getByLabel('既定の物理配列').selectOption('ortholinear');
  const conditions = pane.locator('.pane-condition-summary');
  const summary = conditions.locator('summary');
  await expect(summary).toContainText('1件変更');
  await expect(summary).toContainText('既定の物理配列:');
  await expect(summary).not.toContainText('他');

  await summary.click();
  const first = conditions.locator('.pane-condition-row').first();
  await expect(first).toHaveAttribute('data-changed', 'true');
  await expect(first).toContainText('既定の物理配列');
  await expect(first).toContainText('上書き: 全体');
});

test('操作系はハイドレーション+資産読み込み完了（assetsReady）まで無効化され、直後に選んでも取りこぼさない（レビュー指摘1）', async ({ page }) => {
  // プリレンダーされたページは、Reactがハイドレーションを終える前から見た目上は
  // 操作できてしまう。旧実装はここに約750〜850msの「クリック・選択しても静かに
  // 元へ戻る」窓があった（`assetsReady`が経由する`useKeydistAssets`のstorage読み込みが
  // 終わるまで、controlled componentのvalueが毎回リセットされるため）。ページ本体を
  // `fieldset[disabled={!assetsReady}]`で包んだことで、この窓の間は見出しの「対象」ボタンが
  // 本当にdisabledになる。Playwrightの操作はdisabled要素に対して
  // actionable（有効）になるまで自動的に待つので、ここでは「ネットワークアイドル等の
  // 明示的な待ちを一切挟まずに選んでも、最終的に必ず反映される」ことを確認する
  // （待たずに選んでも消える、が再現しないことの確認）。
  await page.goto('/standalone/bigram-flow');

  // 選ぶ前は無効化されていることがある（ハイドレーション未完了の間）。
  // 常に無効化されているとは限らない（読み込みが速いローカル実行では既に有効なことも
  // ある）ため、状態そのもののアサートはせず、「選択が必ず反映される」ことだけを見る。
  await toggleTarget(page, 'layout:colemak-dh');
  await expect(targetButton(page)).toBeEnabled();
  await expectChosenTarget(page, 'layout:colemak-dh');

  // 選択後は解析まで進み、取りこぼされていないことを可視化の面でも確認する。
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expect(flow).toHaveAttribute('data-layout-id', 'colemak-dh');
});

test('見た目だけの設定を変えても壊れず、抽出設定を変えると表示が変わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const lineScale = (await openSettings(page)).getByLabel('紐の太さ', { exact: true });
  await lineScale.selectOption('sqrt');
  await expect(lineScale).toHaveValue('sqrt');

  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');
});

test('テキストを変えると条件・可視化が追従する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('hello world hello world hello world');

  // debounce後、Trace/抽出が新しいテキストで再計算されペインが再びreadyになる。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
});

test('組み込みテキストを選ぶとテキストが置き換わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  const before = await textarea.inputValue();

  await openTextChip(page);
  const picker = page.getByLabel('テキストを選ぶ', { exact: true });
  await picker.selectOption({ label: '英文（既定）' });

  await expect(textarea).not.toHaveValue(before);

  // ペインが新しいテキストで再びreadyになる（見えている変化が実際にengineへ届いたことの確認）。
  const pane = page.locator('.pane-frame');
  await expect(pane).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
});

/**
 * テキストの資産化（#544 Phase 3）のE2E。組み込みを書き換えると新しいユーザーテキストが
 * 作られる（copy-on-write）ことと、その前提の上で選択・複製・削除・タブ間同期が
 * 正しく回ることを確認する。
 */
test('組み込みを編集すると新しいユーザーテキストが作られ、選択がそちらへ切り替わる（copy-on-write）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('編集したテキスト');

  // debounce後、textLibraryに1件のユーザーテキストが増える。
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(1);

  // 選択もそのユーザーテキストへ切り替わっている（builtinではなくuser）。
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:standalone-text-selection');
      return raw === null ? undefined : (JSON.parse(raw) as { ref: { kind: string } }).ref.kind;
    }))
    .toEqual('user');

  await openTextChip(page);
  const picker = page.getByLabel('テキストを選ぶ', { exact: true });
  await expect(picker.locator('optgroup[label="自作"] option')).toHaveCount(1);
});

test('copy-on-write後にさらに打っても、コピーは増えない（同じユーザーテキストをその場で編集する）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('1回目の編集');
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(1);

  // 続けてもう一度編集する（debounceで積まれた複数回の呼び出しを模す）。
  await textarea.fill('2回目の編集');
  await textarea.fill('3回目の編集');
  await expect(textarea).toHaveValue('3回目の編集');

  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      const texts = raw === null ? [] : (JSON.parse(raw) as { texts: { text: string }[] }).texts;
      return texts.length === 1 ? texts[0]!.text : `unexpected:${texts.length}`;
    }))
    .toEqual('3回目の編集');
});

test('同じ組み込みを選び直して同じ本文を打っても保存される（重複排除で捨てない）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  const picker = page.getByLabel('テキストを選ぶ', { exact: true });
  const libraryLength = () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
  });

  const builtinValue = await picker.inputValue();
  const edited = `${await textarea.inputValue()}X`;
  await textarea.fill(edited);
  await expect.poll(libraryLength).toEqual(1);

  // 組み込みへ戻して、前回と同じ本文をもう一度打つ
  await picker.selectOption(builtinValue);
  await expect(textarea).not.toHaveValue(edited);
  await textarea.fill(edited);
  await expect.poll(libraryLength).toEqual(2);

  await page.reload();
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(edited);
});

test('選択が存在しない自作テキストを指していても、打った内容は組み込みの複製として保存される', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('keydist:text-library', JSON.stringify({ version: 1, texts: [] }));
    localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'user', id: 'ghost' } }));
  });
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('lost edit');
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? [] : (JSON.parse(raw) as { texts: { text: string }[] }).texts.map((text) => text.text);
    }))
    .toEqual(['lost edit']);

  await page.reload();
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('lost edit');
});

test('編集したテキストはリロードしても保持される', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('リロードしても残るテキスト');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:text-library')))
    .toContain('リロードしても残るテキスト');

  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('リロードしても残るテキスト');
});

/**
 * テキストのdebounce書き込みも解析設定と同じ`useDebouncedCommit`を通す（レビュー指摘#2）ので、
 * 「解析設定はdebounce完了前にリロードしても残る」と同じ`page.clock`パターンで、組み込み→
 * copy-on-writeの場合とユーザーテキストの直接編集の場合の両方を確認する。
 */
test('打ってすぐリロードしても編集が残る（組み込みからのcopy-on-write、debounce完了前）', async ({ page }) => {
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
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

test('打ってすぐリロードしても編集が残る（既存のユーザーテキストの直接編集、debounce完了前）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  // 先にユーザーテキストを1件作っておく（複製）。
  await openTextChip(page);
  await page.getByRole('button', { name: '複製', exact: true }).click();
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(1);

  await page.clock.install();
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('debounce完了前にリロードする編集(ユーザーテキスト)');

  const rawBeforeReload = await page.evaluate(() => localStorage.getItem('keydist:text-library'));
  expect(rawBeforeReload ?? '').not.toContain('debounce完了前にリロードする編集');

  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('debounce完了前にリロードする編集(ユーザーテキスト)');
  // コピーは増えていない（1件のまま）。
  const stored = await page.evaluate(() => localStorage.getItem('keydist:text-library'));
  const parsed = JSON.parse(stored ?? '{"texts":[]}') as { texts: unknown[] };
  expect(parsed.texts.length).toEqual(1);
});

test('複製すると新しいユーザーテキストができ、選択がそちらに切り替わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const picker = page.getByLabel('テキストを選ぶ', { exact: true });
  await page.getByRole('button', { name: '複製', exact: true }).click();

  await expect(picker.locator('optgroup[label="自作"] option')).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:standalone-text-selection');
      return raw === null ? undefined : (JSON.parse(raw) as { ref: { kind: string } }).ref.kind;
    }))
    .toEqual('user');

  // 複製元（既定の組み込み）と同じ本文で始まる。
  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await expect(textarea).toHaveValue(/わがはい/);
});

test('選択中のテキストを削除すると既定の組み込みへフォールバックする', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await openTextChip(page);
  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('削除される予定のテキスト');
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(1);

  // 削除は文脈バーの「元に戻す」で戻せるので、確認を挟まない。
  await openTextChip(page);
  const deleteButton = page.getByRole('button', { name: '削除', exact: true });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  // 既定の組み込み（吾輩は猫である）へフォールバックする。
  await expect(textarea).toHaveValue(/わがはい/);
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(0);
});

test('解析設定はリロードしても残る（資産として保持する）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
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
  await expect((await openSettings(page)).getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
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

  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
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
  await expect((await openSettings(page)).getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
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
  const actual = (await openSettings(page)).getByRole('button', { name: 'Actual', exact: true });
  await expect(actual).toHaveAttribute('aria-pressed', 'true');
});

test('URLパラメータで開くと解析設定が反映され、資産に残り、URLから消える', async ({ page }) => {
  // #544 Phase 3「URLでの受け取り」: 解析設定だけをURLクエリで受け取り、取り込んだら
  // ローカル（資産）が正になる（=URLからは消える）ことを確認する。
  await page.goto('/standalone/bigram-flow?source=within-hand&fingers=index');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  // 反映: sourceがWithin-hand、指選択がindexになっている。
  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');
  const indexFinger = (await openSettings(page)).getByRole('button', { name: '人', exact: true });
  await expect(indexFinger).toHaveAttribute('aria-pressed', 'true');

  // URLから消える（取り込み後はローカルが正）。
  await expect(page).toHaveURL(/\/standalone\/bigram-flow$/);

  // 資産（storage）に残る。
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')))
    .toContain('within-hand');

  // リロードしても保たれる。
  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect((await openSettings(page)).getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
});

test('URLパラメータの壊れた値は既定値へ戻し、診断をペインに表示する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow?source=diagonal');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const diagnostics = page.locator('[data-pane-settings-diagnostics="true"]');
  await expect(diagnostics).toBeVisible();

  // 既定値のまま（壊れたURLパラメータは使われない）。
  const actual = (await openSettings(page)).getByRole('button', { name: 'Actual', exact: true });
  await expect(actual).toHaveAttribute('aria-pressed', 'true');

  // 壊れていても消費済みとしてURLからは消える。
  await expect(page).toHaveURL(/\/standalone\/bigram-flow$/);
});

test('URLパラメータは既存の解析設定へ部分マージされる（指定していない項目は保たれる）', async ({ page }) => {
  // 先にlineScaleを'sqrt'へ変更して資産へ保存する。
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  const lineScale = (await openSettings(page)).getByLabel('紐の太さ', { exact: true });
  await lineScale.selectOption('sqrt');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')))
    .toContain('sqrt');

  // sourceだけを指定したURLで開く。lineScaleの指定は無いので、保存済みの'sqrt'が保たれるはず。
  await page.goto('/standalone/bigram-flow?source=within-hand');
  const flowAfter = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfter).toBeVisible({ timeout: 10_000 });
  await expect((await openSettings(page)).getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await expect((await openSettings(page)).getByLabel('紐の太さ', { exact: true })).toHaveValue('sqrt');
});

test('文脈バーの「共有」で既定値と違う項目だけを含むURLがクリップボードに入る', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const withinHand = (await openSettings(page)).getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('source=within-hand');
  // 既定値のまま（変えていない）lineScale等はURLに含まれない。
  expect(clipboardText).not.toContain('lineScale=');
});

test('新規プロファイルでは配列（既定QWERTY）が対象になり、Setupは1件も作られない（#578指摘1）', async ({ page }) => {
  // 旧実装は手持ちが空なら初期Setupを1件自動で作っていたが、#578指摘1の決定で
  // その仕掛けを撤去した。配列は組み込みカタログに最初から入っているので、
  // 手持ちが空でも対象は選べる。
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  await expectChosenTarget(page, 'layout:qwerty');

  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();

  // リロードしても対象は変わらず、Setupも作られたままにならない。
  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expectChosenTarget(page, 'layout:qwerty');
  const storedAfterReload = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(storedAfterReload).toBeNull();
});

test('保存済みのSetupが2件あっても、開いた時に手を付けずそのまま残る', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
        ],
        overrides: {},
      }),
    );
  });
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  // 対象を明示的にSetupへ切り替える（既定はqwerty配列のまま）。ページ本体は
  // `fieldset[disabled]`でハイドレーション完了まで操作を無効化している
  // （レビュー指摘1）ので、Playwrightのactionability待ちにそのまま任せてよい。
  await toggleTarget(page, 'setup:fixed-b');
  await expectChosenTarget(page, 'setup:fixed-b');

  // storage側は2件のまま（idも変わらない。作成・削除どちらも起きていない）。
  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  const parsed = JSON.parse(stored ?? '{}') as { setups: { id: string }[] };
  expect(parsed.setups.map((setup) => setup.id)).toEqual(['fixed-a', 'fixed-b']);

  // 対象の選択がstorageへ書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:analyzer-target-selections')))
    .toContain('fixed-b');

  // リロードしても2件・id・選択とも保たれる。
  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expectChosenTarget(page, 'setup:fixed-b');
  const storedAfterReload = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  const parsedAfterReload = JSON.parse(storedAfterReload ?? '{}') as { setups: { id: string }[] };
  expect(parsedAfterReload.setups.map((setup) => setup.id)).toEqual(['fixed-a', 'fixed-b']);
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

  await openTextChip(pageA);
  const textareaA = pageA.getByLabel('テキスト', { exact: true });
  await openTextChip(pageB);
  const textareaB = pageB.getByLabel('テキスト', { exact: true });

  for (const text of ['1回目の変更', '2回目の変更', '3回目の変更']) {
    await textareaB.fill(text);
    await expect(textareaA).toHaveValue(text, { timeout: 10_000 });
  }

  await pageA.close();
  await pageB.close();
});

/**
 * #544レビューで見つかったクロスタブの競合の再現（e2e版。unit testは`commands.test.ts`の
 * 同名テスト参照）。タブA・タブBが同じユーザーテキスト（u1）を選択中、タブBがu1へ入力した
 * debounce書き込みが適用される前に、タブAがu2へ選択を切り替えた変更が届くと、
 * 修正前は`setCurrentTextContentCommand`が適用時点の「今の選択」を読み直していたため
 * Bの入力がu2へ書き込まれてしまっていた（レビュー報告: 21回中3回再現）。
 * `setTextContentCommand`は打鍵時点のref（u1）を明示的に運ぶので、その後どちらのタブで
 * 選択が動いてもu1だけが書き換わる。正確な再現時刻（372〜384ms）を毎回作るのではなく、
 * 待ち時間を周回ごとに揺らしながら繰り返すことで、特定のタイミングに依存せず直っている
 * ことを確認する。
 */
test('タブ間の競合修正: 他タブの選択切り替えが割り込んでも、入力中のテキストが別テキストへ漏れない（Nイテレーション）', async ({ context }, testInfo) => {
  // 12回の周回それぞれで約380msの意図的な待ち時間を挟むため、既定の30秒では
  // 並列実行時の負荷次第で規定のタイムアウトに達することがある（レビュー指摘: 実測で
  // タイムアウトによる失敗を確認）。周回数に見合う時間を明示的に確保する。
  testInfo.setTimeout(90_000);
  const ITERATIONS = 12;

  await context.addInitScript(() => {
    localStorage.setItem('keydist:text-library', JSON.stringify({
      version: 1,
      texts: [
        { id: 'u1', name: 'u1', text: 'one' },
        { id: 'u2', name: 'u2', text: 'two' },
      ],
    }));
    localStorage.setItem(
      'keydist:standalone-text-selection',
      JSON.stringify({ version: 1, ref: { kind: 'user', id: 'u1' } }),
    );
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto('/standalone/bigram-flow');
  await pageB.goto('/standalone/bigram-flow');
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

  const textLibraryOf = (page: typeof pageA) => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:text-library');
    return raw === null ? [] : (JSON.parse(raw) as { texts: { id: string; text: string }[] }).texts;
  });

  for (let i = 0; i < ITERATIONS; i++) {
    const value = `typed-in-B-for-u1-${i}`;
    await textareaB.fill(value);
    // レビュー報告の372〜384msに寄せつつ、周回ごとに少し揺らす
    // （特定の一瞬だけに依存した確認にしないため）。
    await pageA.waitForTimeout(372 + (i % 13));
    await pickerA.selectOption({ label: 'u2' });

    await expect
      .poll(async () => (await textLibraryOf(pageB)).find((text) => text.id === 'u1')?.text, { timeout: 2000 })
      .toEqual(value);

    const texts = await textLibraryOf(pageB);
    expect(texts.find((text) => text.id === 'u2')?.text, `iteration ${i}: u2はBの入力(${value})で汚染されていないはず`)
      .toEqual('two');

    // 次の周回のため両タブの選択をu1へ戻す。
    await pickerB.selectOption({ label: 'u1' });
    await pickerA.selectOption({ label: 'u1' });
    await expect(pickerB).toHaveValue('user:u1');
  }

  await pageA.close();
  await pageB.close();
});

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・開発用の語）が出ない（レビュー指摘H1〜H4）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('Bigram Flow | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|standalone|単体ページ|個別画面/);
  const body = page.locator('body');
  await expect(body).not.toContainText(/#\d{3}|Phase|standalone|単体ページ|個別画面|\.ts\b|Vector lab|connections|N sensitivity|Setup comparison|baseline|言語判定: /);
});

test('読み込みで操作可能になった瞬間から、テキストのチップは保存済みのテキストを表示している', async ({ page }) => {
  // 以前は読み込み完了で操作可能になった後、本文の表示が1フレーム遅れて保存済みの値へ
  // 差し替わっていた。本文はチップを開いた時にだけ出るので、閉じた状態のチップについて
  // 「操作可能か・表示している名前」の移り変わりを記録し、操作可能な間に古い値が無いことを見る。
  await page.addInitScript(() => {
    localStorage.setItem('keydist:text-library', JSON.stringify({
      version: 1,
      texts: [{ id: 'u1', name: 'u1', text: 'one' }],
    }));
    localStorage.setItem(
      'keydist:standalone-text-selection',
      JSON.stringify({ version: 1, ref: { kind: 'user', id: 'u1' } }),
    );
    const states: string[] = [];
    (window as unknown as { __chipStates: string[] }).__chipStates = states;
    const record = () => {
      const chip = document.querySelector<HTMLButtonElement>('.context-bar button.text-chip');
      if (chip === null) return;
      const name = chip.querySelector('.context-chip-value')?.textContent ?? '';
      const state = `${chip.matches(':disabled') ? 'disabled' : 'enabled'}:${name}`;
      if (states[states.length - 1] !== state) states.push(state);
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const everyFrame = () => {
      record();
      requestAnimationFrame(everyFrame);
    };
    requestAnimationFrame(everyFrame);
  });
  await page.goto('/standalone/bigram-flow');
  const chip = page.locator('.context-bar button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });
  await expect(chip).toContainText('u1');

  const states = await page.evaluate(() => (window as unknown as { __chipStates: string[] }).__chipStates);
  expect(states.filter((state) => state.startsWith('enabled:'))).toEqual(['enabled:u1']);

  // 開いた本文も保存済みの値になっている。
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('one');
});

test('保存済みの解析設定は、操作可能になった瞬間から表示されている（既定値のまま操作できる瞬間が無い。#603）', async ({ page }) => {
  await recordControlStates(
    page,
    {
      storageKey: 'keydist:standalone-analyzer-options',
      storageValue: JSON.stringify({ version: 1, 'bigram-flow': { lineScale: 'sqrt' } }),
    },
    // 解析設定は小窓にあり、小窓を開くボタンは読み込みが済むまで押せない。小窓の最初のselectが紐の太さ。
    { selector: '[data-settings-window="true"] select', read: 'value' },
  );
  await page.goto('/standalone/bigram-flow');
  const lineScale = (await openSettings(page)).getByLabel('紐の太さ', { exact: true });
  await expect(lineScale).toBeEnabled({ timeout: 10_000 });
  await expect(lineScale).toHaveValue('sqrt');
  expect(await enabledValues(page)).toEqual(['sqrt']);
});

test('見出しは「名前 ⓘ / 対象 / 解析設定 / ⋯」で、ⓘで短い説明が出る', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  // 本体は見出し・説明段落・観測値の注記を持たない（ペインの見出しとトップが持つ）。
  const body = page.locator('.pane-body');
  await expect(body.getByRole('heading', { name: 'Bigram Flow' })).toHaveCount(0);
  await expect(body).not.toContainText('配列の優劣を判定するスコアではない');

  const info = page.getByRole('button', { name: 'Bigram Flowの説明' });
  await info.click();
  await expect(page.getByRole('tooltip')).toContainText('2打鍵');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('対象は同じ部品をラジオで1つ選び、押すと閉じて見出しに出る。矢印キーで送る間は閉じない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(targetButton(page)).toHaveAccessibleName('対象: QWERTY');

  const selection = await openTargetSelection(page);
  await expect(selection.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(selection.locator('legend')).toHaveText(['組み込み・英字の配列', '組み込み・かな配列']);
  await selection.getByRole('radio', { name: 'Colemak-DH' }).click();
  await expect(selection).toHaveCount(0);
  await expect(targetButton(page)).toHaveAccessibleName('対象: Colemak-DH');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveAttribute('data-layout-id', 'colemak-dh');

  // キーボードでは、矢印で送った先がその場で反映され、開いたまま次を見比べられる。
  await openTargetSelection(page);
  await selection.getByRole('radio', { name: 'Colemak-DH' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(selection).toBeVisible();
  await expect(selection.getByRole('radio', { name: 'Workman' })).toBeChecked();
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveAttribute('data-layout-id', 'workman');
  await page.keyboard.press('Escape');
  await expect(selection).toHaveCount(0);
  await expect(targetButton(page)).toBeFocused();
});

test('解析設定の小窓は非モーダルで、開いたまま図を操作でき、見出しをドラッグで動かせる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  const settings = await openSettings(page);
  await expect(settings).toHaveAttribute('aria-modal', 'false');

  // 開いたまま、背後の対象を変えられる（背後を塞がない）。
  await toggleTarget(page, 'layout:colemak-dh');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toHaveAttribute('data-layout-id', 'colemak-dh');
  await expect(settings).toBeVisible();

  const before = await settings.boundingBox();
  const handle = settings.locator('.settings-window-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 170, box.y + box.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  const after = await settings.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 100);
  expect(after!.y).toBeGreaterThan(before!.y + 30);

  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(settings).toHaveCount(0);
});

test('項目ごとの「既定値へ戻す」は既定と違う項目にだけ出て、その項目だけを戻す', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  const settings = await openSettings(page);

  // 既定のままなら戻すボタンは無い。
  await expect(settings.locator('[data-option-reset="true"]')).toHaveCount(0);

  await settings.getByLabel('紐の太さ', { exact: true }).selectOption('log');
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await expect(settings.locator('[data-option-reset="true"]')).toHaveCount(2);

  await settings.getByRole('button', { name: '紐の太さを既定値へ戻す' }).click();
  await expect(settings.getByLabel('紐の太さ', { exact: true })).toHaveValue('linear');
  // 他の項目はそのまま。
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.locator('[data-option-reset="true"]')).toHaveCount(1);
  // 旧「標準に戻す」（複数項目をまとめて戻す）は無い。
  await expect(page.getByRole('button', { name: '標準に戻す' })).toHaveCount(0);
});

test('⋯の「解析設定を初期値に戻す」は解析設定だけを既定値へ戻し、対象はそのまま', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await toggleTarget(page, 'layout:colemak-dh');

  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await settings.getByLabel('紐の太さ', { exact: true }).selectOption('sqrt');

  await page.getByRole('button', { name: /の操作$/ }).click();
  const item = page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ });
  await expect(item).toContainText('対象と条件は変わらない');
  await item.click();

  await expect(settings.getByRole('button', { name: 'Actual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByLabel('紐の太さ', { exact: true })).toHaveValue('linear');
  await expectChosenTarget(page, 'layout:colemak-dh');
});

test('観測値の注記はトップにだけ置く', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero')).toContainText('数値は観測値であり、配列の優劣を判定するスコアではない。');
});

test('解析設定の小窓を開くとフォーカスが中へ入り、Escapeで閉じて解析設定ボタンへ戻る', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  const button = page.getByRole('button', { name: '解析設定', exact: true });
  await button.click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(button).toBeFocused();
});

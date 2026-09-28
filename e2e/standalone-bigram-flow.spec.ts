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

test('組み込みテキストを選ぶとテキストが置き換わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  const before = await textarea.inputValue();

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

  const picker = page.getByLabel('テキストを選ぶ', { exact: true });
  await expect(picker.locator('optgroup[label="自作"] option')).toHaveCount(1);
});

test('copy-on-write後にさらに打っても、コピーは増えない（同じユーザーテキストをその場で編集する）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

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

test('編集したテキストはリロードしても保持される', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('リロードしても残るテキスト');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:text-library')))
    .toContain('リロードしても残るテキスト');

  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue('リロードしても残るテキスト');
});

test('複製すると新しいユーザーテキストができ、選択がそちらに切り替わる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

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
  const textarea = page.getByLabel('テキスト', { exact: true });
  await expect(textarea).toHaveValue(/わがはい/);
});

test('選択中のテキストを削除すると既定の組み込みへフォールバックする', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByLabel('テキスト', { exact: true });
  await textarea.fill('削除される予定のテキスト');
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('keydist:text-library');
      return raw === null ? 0 : (JSON.parse(raw) as { texts: unknown[] }).texts.length;
    }))
    .toEqual(1);

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

test('URLパラメータで開くと解析設定が反映され、資産に残り、URLから消える', async ({ page }) => {
  // #544 Phase 3「URLでの受け取り」: 解析設定だけをURLクエリで受け取り、取り込んだら
  // ローカル（資産）が正になる（=URLからは消える）ことを確認する。
  await page.goto('/standalone/bigram-flow?source=within-hand&fingers=index');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  // 反映: sourceがWithin-hand、指選択がindexになっている。
  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');
  const indexFinger = flow.locator('.flow-finger-buttons button', { hasText: '人' });
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
  await expect(flowAfterReload.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
});

test('URLパラメータの壊れた値は既定値へ戻し、診断をペインに表示する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow?source=diagonal');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const diagnostics = page.locator('[data-pane-settings-diagnostics="true"]');
  await expect(diagnostics).toBeVisible();

  // 既定値のまま（壊れたURLパラメータは使われない）。
  const actual = flow.getByRole('button', { name: 'Actual', exact: true });
  await expect(actual).toHaveAttribute('aria-pressed', 'true');

  // 壊れていても消費済みとしてURLからは消える。
  await expect(page).toHaveURL(/\/standalone\/bigram-flow$/);
});

test('URLパラメータは既存の解析設定へ部分マージされる（指定していない項目は保たれる）', async ({ page }) => {
  // 先にlineScaleを'sqrt'へ変更して資産へ保存する。
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  const lineScale = flow.getByLabel('紐の太さのスケール');
  await lineScale.selectOption('sqrt');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options')))
    .toContain('sqrt');

  // sourceだけを指定したURLで開く。lineScaleの指定は無いので、保存済みの'sqrt'が保たれるはず。
  await page.goto('/standalone/bigram-flow?source=within-hand');
  const flowAfter = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfter).toBeVisible({ timeout: 10_000 });
  await expect(flowAfter.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await expect(flowAfter.getByLabel('紐の太さのスケール')).toHaveValue('sqrt');
});

test('「今の設定のURLをコピー」で既定値と違う項目だけを含むURLがクリップボードに入る', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const withinHand = flow.getByRole('button', { name: 'Within-hand' });
  await withinHand.click();
  await expect(withinHand).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '今の設定のURLをコピー' }).click();
  await expect(page.getByRole('button', { name: 'コピーした' })).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('source=within-hand');
  // 既定値のまま（変えていない）lineScale等はURLに含まれない。
  expect(clipboardText).not.toContain('lineScale=');
});

test('保存済みのSetupが2件あっても、開いた時に1件へ巻き戻らない（初期Setup作成の競合の回帰）', async ({ page }) => {
  // #544レビュー: 初期Setup作成の効果がstorage読み込み前の空状態を見て新しいSetupを
  // 作ってしまい、保存済みのSetup（複数件）がデフォルト1件で置き換わる事故の再現。
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered', colorIndex: 1 },
        ],
        overrides: {},
      }),
    );
  });
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const setupSelect = page.getByLabel('対象Setup');
  const optionValues = async () => setupSelect.locator('option').evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );
  await expect.poll(optionValues).toEqual(['fixed-a', 'fixed-b']);

  // storage側も2件のまま（idも変わらない）。
  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  const parsed = JSON.parse(stored ?? '{}') as { setups: { id: string }[] };
  expect(parsed.setups.map((setup) => setup.id)).toEqual(['fixed-a', 'fixed-b']);

  // リロードしても2件・id共に保たれる。
  await page.reload();
  const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect.poll(optionValues).toEqual(['fixed-a', 'fixed-b']);
});

test('保存済みのSetupが1件だけの時、リロードのたびにidが変わったりしない', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-only', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 }],
        overrides: {},
      }),
    );
  });
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });

  const setupSelect = page.getByLabel('対象Setup');
  await expect.poll(async () => setupSelect.inputValue()).toEqual('fixed-only');

  for (let i = 0; i < 3; i++) {
    await page.reload();
    const flowAfterReload = page.locator('[data-react-feature="bigram-flow"]');
    await expect(flowAfterReload).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => page.getByLabel('対象Setup').inputValue()).toEqual('fixed-only');
  }
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

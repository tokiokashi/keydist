import { expect, test } from '@playwright/test';

/**
 * N感度単体ページ（#544 Phase 3「N感度」、#578指摘1「対象を配列かSetupにする」）のE2E。
 * `e2e/standalone-comparison.spec.ts`と同じ形。
 *
 * 対象は配列かSetupの**集合**（比較表と同じ）で、集合の保存先も同じ汎用資産
 * （`keydist:analyzer-set-selections`。`engine/analyzer-set-selection.ts`参照。
 * Analyzer idごとに`{targets, baseline}`を`selections`の下にネストして持つ）。
 */

const ANALYZER_SET_SELECTIONS_KEY = 'keydist:analyzer-set-selections';
const STANDALONE_ANALYZER_OPTIONS_KEY = 'keydist:standalone-analyzer-options';

function seedTwoSetups() {
  return () => {
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
  };
}

/**
 * 対象を追加する。ページ本体は`fieldset[disabled]`でハイドレーション完了
 * （`assetsReady`）まで操作を無効化しているので（レビュー指摘1）、Playwrightの
 * actionability待ち（disabled要素には操作しない）にそのまま任せてよい。
 */
async function addTarget(page: import('@playwright/test').Page, optionValue: string) {
  await page.getByLabel('追加する対象').selectOption(optionValue);
  await page.getByRole('button', { name: '追加', exact: true }).click();
}

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに2本の折れ線が出る', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await expect(page.getByRole('heading', { name: 'N感度', exact: true })).toBeVisible();

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

test('Setupを2件選ぶと2本の折れ線が表示される', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  // ページ見出し(h1)とAnalyzer自身の見出し(h2)が同じ文字列を持つため`.first()`で絞る
  // （`standalone-bigram-flow.spec.ts`と同じ形。#544 プリロード修正で描画が速くなり、
  // 以前は間に合わずh1しか無かった場面でh2まで揃うようになって顕在化した）。
  await expect(page.getByRole('heading', { name: 'N感度', exact: true }).first()).toBeVisible();

  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  // 凡例・条件併記もSetupの数だけ出る（優劣を示す色付け・強調は無い、系列ごとの
  // 条件表示だけがある。`AGENTS.md`「優劣の判定をしない」の確認）。
  await expect(page.locator('[data-n-sensitivity-row="ok"]')).toHaveCount(2);

  // 表（相対表示中も実測値[u]を確認できる）にも2行、N=0〜10の11列が出る。
  const table = page.locator('.n-sensitivity-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(12); // "Setup"列 + N=0..10の11列
});

test('縦軸（相対/実測値）の切り替えはリロードしても残る', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await addTarget(page, 'setup:fixed-a');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });

  const relative = page.getByRole('radio', { name: '相対（N=0を100%）' });
  const absolute = page.getByRole('radio', { name: '実測値 [u]' });
  await expect(relative).toBeChecked();

  await absolute.check();
  await expect(absolute).toBeChecked();

  // 資産への反映はdebounceされる（`use-debounced-commit.ts`）ので、storageに実際に
  // 書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STANDALONE_ANALYZER_OPTIONS_KEY))
    .toContain('absolute');

  await page.reload();
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('radio', { name: '実測値 [u]' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '相対（N=0を100%）' })).not.toBeChecked();
});

test('選択・並び順はリロードしても残り、資産の読み込み前に上書きされない', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  const order = page.locator('.set-selection-order li');
  await expect(order).toHaveCount(2);
  await expect(order.first()).toContainText('QWERTY');
  await order.nth(1).getByRole('button', { name: /上へ/ }).click();
  await expect(order.first()).toContainText('Colemak');

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), ANALYZER_SET_SELECTIONS_KEY))
    .toContain('fixed-a');

  // 資産の読み込み前に空の初期値へ巻き戻る競合が無いことの回帰確認: リロード直後に
  // 2件→1件に減ったり、選択が消えたりしない。
  await page.reload();
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  const orderAfterReload = page.locator('.set-selection-order li');
  await expect(orderAfterReload).toHaveCount(2);
  await expect(orderAfterReload.first()).toContainText('Colemak');

  const storedAfterReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    ANALYZER_SET_SELECTIONS_KEY,
  );
  const parsed = JSON.parse(storedAfterReload ?? '{}') as {
    selections: Record<string, { targets: { kind: string; setupId?: string }[]; baseline?: { kind: string; setupId?: string } }>;
  };
  expect(parsed.selections['n-sensitivity']?.targets.map((t) => t.setupId)).toEqual(['fixed-b', 'fixed-a']);

  // setup-libraryはユーザーが足していない限り2件のまま（誤って1件へ巻き戻っていない）。
  const setupLibraryRaw = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  const setupLibrary = JSON.parse(setupLibraryRaw ?? '{}') as { setups: unknown[] };
  expect(setupLibrary.setups).toHaveLength(2);
});

test('集合に存在しないSetup idが混ざっていても消えず「削除された」と表示される（部分失敗）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 }],
        overrides: {},
      }),
    );
    localStorage.setItem(
      'keydist:analyzer-set-selections',
      JSON.stringify({
        version: 2,
        selections: {
          'n-sensitivity': {
            targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'deleted-setup' }],
          },
        },
      }),
    );
  });
  await page.goto('/standalone/n-sensitivity');

  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(1, { timeout: 10_000 });

  const failedRow = page.locator('[data-n-sensitivity-row="failed"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText('削除された');

  await expect(page.locator('.set-selection-order li')).toHaveCount(2);
});

test('既定と違う条件（windowSize以外）が併記される。windowSizeは掃引軸なので出さない', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 }],
        // sfbHomeCost=falseは既定(true)と違うので併記される。windowSizeは既定と違っても
        // 掃引軸として除外され、行の条件併記には出ない。
        overrides: { global: { sfbHomeCost: false, windowSize: 7 } },
      }),
    );
    localStorage.setItem(
      'keydist:analyzer-set-selections',
      JSON.stringify({ version: 2, selections: { 'n-sensitivity': { targets: [{ kind: 'setup', setupId: 'fixed-a' }] } } }),
    );
  });
  await page.goto('/standalone/n-sensitivity');

  const conditionDiff = page.locator('.n-sensitivity-condition-diff');
  await expect(conditionDiff).toBeVisible({ timeout: 10_000 });
  await expect(conditionDiff).toContainText('同指連続のホーム復帰距離');
  await expect(conditionDiff).not.toContainText('先読みN');
});

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・英語の仮ラベル）が出ない（レビュー指摘H1〜H4）', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('N感度 | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|standalone|単体ページ/);
  const body = page.locator('body');
  await expect(body).not.toContainText(/#\d{3}|Phase|standalone|単体ページ|\.ts\b|Vector lab|connections|vectors|Movement profile|Cross-hand|N sensitivity|Setup comparison|baseline|言語判定: /);
});

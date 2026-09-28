import { expect, test } from '@playwright/test';

/**
 * 比較表単体ページ（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）と、
 * その単体ページ」、#578指摘1「対象を配列かSetupにする」）のE2E。
 * `standalone-bigram-flow.spec.ts`と同じ形。
 *
 * 対象は**配列かSetupの集合**（単一対象ではない）なので、選択・並び順・基準が
 * リロードをまたいで保持されること、集合の一部が壊れて（削除されて）いても
 * 行ごと消えずに表示されることを確認する。配列は組み込みカタログに最初から入っている
 * ため、Setupを1つも作らずに集合を組める（#578指摘1の決定: 初期Setup自動生成の廃止）。
 *
 * 集合の保存先は`keydist:analyzer-set-selections`（集合対象Analyzer全般が使う汎用資産。
 * Analyzer idごとに`selections.<id>`へネストする。版2で`setupIds`/`baselineSetupId`から
 * `targets`/`baseline`（`AnalysisTarget`の配列・値）へ形を変えた）。
 */

const ANALYZER_SET_SELECTIONS_KEY = 'keydist:analyzer-set-selections';

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
}

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに比較できる', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await expect(page.getByRole('heading', { name: '比較表', exact: true })).toBeVisible();

  // 手持ちのSetupは0件（初期Setupの自動生成をやめた。#578指摘1）。
  await expect(page.getByLabel('追加する対象').locator('optgroup[label="Setup"]')).toHaveCount(0);

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  // Setupは1件も作られていない。
  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

test('Setupを2件選ぶと2行表示され、並び替え・基準選択が効く', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  await expect(page.getByRole('heading', { name: '比較表', exact: true })).toBeVisible();

  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  // 並び替え: 2番目（colemak-dh）を上へ動かすと先頭に来る。
  const order = page.locator('.set-selection-order li');
  await expect(order).toHaveCount(2);
  await expect(order.first()).toContainText('QWERTY');
  await order.nth(1).getByRole('button', { name: /上へ/ }).click();
  await expect(order.first()).toContainText('Colemak');

  // 基準を選ぶと、その行に基準マークが付く。
  await page.getByLabel('基準', { exact: true }).selectOption('setup:fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('QWERTY');
});

test('選択・並び順・基準はリロードしても残る（資産の読み込み前に消えない）', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  const order = page.locator('.set-selection-order li');
  await order.nth(1).getByRole('button', { name: /上へ/ }).click();
  await expect(order.first()).toContainText('Colemak');

  await page.getByLabel('基準', { exact: true }).selectOption('setup:fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // debounceされた資産への反映が実際にstorageへ書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), ANALYZER_SET_SELECTIONS_KEY))
    .toContain('fixed-a');
  const storedBeforeReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    ANALYZER_SET_SELECTIONS_KEY,
  );
  expect(storedBeforeReload).toContain('fixed-b');

  await page.reload();
  const tableAfterReload = page.locator('.comparison-table');
  await expect(tableAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(tableAfterReload.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  const orderAfterReload = page.locator('.set-selection-order li');
  await expect(orderAfterReload).toHaveCount(2);
  await expect(orderAfterReload.first()).toContainText('Colemak');
  await expect(page.getByLabel('基準', { exact: true })).toHaveValue('setup:fixed-a');
  await expect(tableAfterReload.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // storage側の中身も保たれている（並び順・基準とも）。
  const storedAfterReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    ANALYZER_SET_SELECTIONS_KEY,
  );
  const parsed = JSON.parse(storedAfterReload ?? '{}') as {
    selections: Record<string, { targets: { kind: string; setupId?: string }[]; baseline?: { kind: string; setupId?: string } }>;
  };
  expect(parsed.selections.comparison?.targets.map((t) => t.setupId)).toEqual(['fixed-b', 'fixed-a']);
  expect(parsed.selections.comparison?.baseline?.setupId).toEqual('fixed-a');
});

test('集合に存在しないSetup idが混ざっていても行は消えず「削除された」と表示される（部分失敗）', async ({ page }) => {
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
          comparison: {
            targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'deleted-setup' }],
          },
        },
      }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });

  // 解決できたメンバー（fixed-a）は通常通りok行として出る。
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });

  // 解決できなかったメンバー（deleted-setup）は行ごと消えず、失敗として表示される
  // （全体をfailedにしない。#544指示書「メンバーごとの失敗を値で持つ」）。
  const failedRow = table.locator('tbody tr[data-comparison-row="failed"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText('削除された');

  // 選択の並び（2件のまま）自体は保たれている。
  await expect(page.locator('.set-selection-order li')).toHaveCount(2);
});

test('既定と違う条件が行に併記される（#544 Phase 3レビュー: 集合対象ページ共通の条件併記）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 }],
        overrides: { global: { sfbHomeCost: false } },
      }),
    );
    localStorage.setItem(
      'keydist:analyzer-set-selections',
      JSON.stringify({ version: 2, selections: { comparison: { targets: [{ kind: 'setup', setupId: 'fixed-a' }] } } }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('.comparison-condition-cell')).toContainText('同指連続のホーム復帰距離');
});

test('既定の形状を変えると、配列対象は追従しSetup対象（明示的な形状を持つ）は追従しない', async ({ page }) => {
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
          comparison: {
            targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: 'fixed-a' }],
          },
        },
      }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  // 配列対象・Setup対象とも最初は同じ形状（row-staggered、既定）なので条件欄は差分無し。
  await expect(page.locator('.set-selection-order li').first()).toContainText('QWERTY');

  await page.getByLabel('既定の形状').selectOption('ortholinear');

  // 配列対象（行1: layout:qwerty）の条件欄に形状の変更が反映される。
  // Setup対象（行2: setup:fixed-a、shapeIdを明示的に持つ）は変わらない。
  const rows = table.locator('tbody tr[data-comparison-row="ok"]');
  await expect(rows.nth(0).locator('.comparison-condition-cell')).toContainText('オーソリニア', { timeout: 10_000 });
  await expect(rows.nth(1).locator('.comparison-condition-cell')).not.toContainText('オーソリニア');
});

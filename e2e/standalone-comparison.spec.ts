import { expect, test } from '@playwright/test';

/**
 * 比較表単体ページ（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）と、
 * その単体ページ」）のE2E。`standalone-bigram-flow.spec.ts`と同じ形。
 *
 * 対象はSetupの**集合**（単一Setupではない）なので、選択・並び順・基準が
 * リロードをまたいで保持されること、集合の一部が壊れて（削除されて）いても
 * 行ごと消えずに表示されることを確認する。
 */

const COMPARISON_SELECTION_KEY = 'keydist:comparison-selection';

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

test('Setupを2件選ぶと2行表示され、並び替え・基準選択が効く', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  await expect(page.getByRole('heading', { name: '比較表', exact: true })).toBeVisible();

  const checkboxA = page.locator('.comparison-selection-checkbox', { hasText: 'qwerty / row-staggered' }).getByRole('checkbox');
  const checkboxB = page.locator('.comparison-selection-checkbox', { hasText: 'colemak-dh / row-staggered' }).getByRole('checkbox');
  await checkboxA.check();
  await checkboxB.check();

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  // 並び替え: 2番目（colemak-dh）を上へ動かすと先頭に来る。
  const order = page.locator('.comparison-selection-order li');
  await expect(order).toHaveCount(2);
  await expect(order.first()).toContainText('qwerty');
  await order.nth(1).getByRole('button', { name: /上へ/ }).click();
  await expect(order.first()).toContainText('colemak-dh');

  // 基準を選ぶと、その行に基準マークが付く。
  await page.getByLabel('基準Setup').selectOption('fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('qwerty');
});

test('選択・並び順・基準はリロードしても残る（資産の読み込み前に消えない）', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  const checkboxA = page.locator('.comparison-selection-checkbox', { hasText: 'qwerty / row-staggered' }).getByRole('checkbox');
  const checkboxB = page.locator('.comparison-selection-checkbox', { hasText: 'colemak-dh / row-staggered' }).getByRole('checkbox');
  await checkboxA.check();
  await checkboxB.check();
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  const order = page.locator('.comparison-selection-order li');
  await order.nth(1).getByRole('button', { name: /上へ/ }).click();
  await expect(order.first()).toContainText('colemak-dh');

  await page.getByLabel('基準Setup').selectOption('fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // debounceされた資産への反映が実際にstorageへ書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), COMPARISON_SELECTION_KEY))
    .toContain('fixed-a');
  const storedBeforeReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    COMPARISON_SELECTION_KEY,
  );
  expect(storedBeforeReload).toContain('fixed-b');

  // ready前に空の初期値へ巻き戻す競合が無いことの回帰（BigramFlowStandalonePage.tsxの
  // 「保存済みのSetupが2件あっても1件へ巻き戻らない」テストと同じ観点を、
  // comparisonSelection資産にも当てる）。
  await page.reload();
  const tableAfterReload = page.locator('.comparison-table');
  await expect(tableAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(tableAfterReload.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  const orderAfterReload = page.locator('.comparison-selection-order li');
  await expect(orderAfterReload).toHaveCount(2);
  await expect(orderAfterReload.first()).toContainText('colemak-dh');
  await expect(page.getByLabel('基準Setup')).toHaveValue('fixed-a');
  await expect(tableAfterReload.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // storage側の中身も保たれている（並び順・基準とも）。
  const storedAfterReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    COMPARISON_SELECTION_KEY,
  );
  const parsed = JSON.parse(storedAfterReload ?? '{}') as { setupIds: string[]; baselineSetupId?: string };
  expect(parsed.setupIds).toEqual(['fixed-b', 'fixed-a']);
  expect(parsed.baselineSetupId).toEqual('fixed-a');
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
      'keydist:comparison-selection',
      JSON.stringify({ version: 1, setupIds: ['fixed-a', 'deleted-setup'] }),
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
  await expect(page.locator('.comparison-selection-order li')).toHaveCount(2);
});

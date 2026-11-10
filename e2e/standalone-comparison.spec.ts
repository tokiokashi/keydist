import { expect, test, PAGE_TAG, type Page } from './fixtures.ts';
import { expectTargetNames, openSettings, openTargetSelection, toggleTarget } from './pane-helper.ts';
import { useShortText } from './short-text-helper.ts';
import { openTextChip } from './context-bar-helper.ts';

/**
 * 比較表単体ページのE2E。
 * `standalone-bigram-flow.spec.ts`と同じ形。
 *
 * 対象は**配列かSetupの集合**（単一対象ではない）なので、選択・並び順・基準が
 * リロードをまたいで保持されること、集合の一部が壊れて（削除されて）いても
 * 行ごと消えずに表示されることを確認する。配列は組み込みカタログに最初から入っている
 * ため、Setupを1つも作らずに集合を組める（初期Setupは自動生成しない）。
 *
 * 集合の保存先は`keydist:multi-target-selection`（MultiのAnalyzerが共有する1つの集合。
 * `{ version, targets, colorSlots, baseline? }`）。
 */

const MULTI_TARGET_SELECTION_KEY = 'keydist:multi-target-selection';

function seedTwoSetups() {
  return () => {
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
  };
}

/** 対象を加える（対象の選択でチェックを付ける。付けた瞬間に反映される）。 */
async function addTarget(page: import('@playwright/test').Page, key: string) {
  await toggleTarget(page, key);
}

// 数値でなく図の形を見る検査なので、短い本文で回す
test.beforeEach(async ({ page }) => {
  await useShortText(page);
});

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに比較できる', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/analyzer/comparison');
  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: '比較表', exact: true, level: 1 })).toBeVisible();

  // 手持ちのSetupは0件（初期Setupの自動生成をやめた）。
  await expect((await openTargetSelection(page)).locator('[data-target-group="setup"]')).toHaveCount(0);

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  // Setupは1件も作られていない。
  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

test('選択・基準はリロードしても残る（資産の読み込み前に消えない）', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/analyzer/comparison');

  const table = page.locator('.comparison-table');
  await addTarget(page, 'setup:fixed-b');
  await addTarget(page, 'setup:fixed-a');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);

  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('setup:fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // debounceされた資産への反映が実際にstorageへ書き込まれるまで待ってからリロードする。
  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY)).toContain('fixed-a');
  const storedBeforeReload = await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY);
  expect(storedBeforeReload).toContain('fixed-b');

  await page.reload();
  const tableAfterReload = page.locator('.comparison-table');
  await expect(tableAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(tableAfterReload.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);
  await openTargetSelection(page);
  await expect(page.getByLabel('基準', { exact: true })).toHaveValue('setup:fixed-a');
  await expect(tableAfterReload.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // storage側の中身も保たれている（付けた順・基準とも。付けた順は色を配る順）。
  const storedAfterReload = await page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY);
  const parsed = JSON.parse(storedAfterReload ?? '{}') as {
    targets: { kind: string; setupId?: string }[];
    baseline?: { kind: string; setupId?: string };
  };
  expect(parsed.targets.map((t) => t.setupId)).toEqual(['fixed-b', 'fixed-a']);
  expect(parsed.baseline?.setupId).toEqual('fixed-a');
});

/** 共有リンクを開く別の利用者（保存値の無い新しいコンテキスト。`setups`があれば手持ちのSetupとして置く）。 */
async function openShared(context: import('@playwright/test').BrowserContext, url: string, setups: readonly object[] = []) {
  const other = await context.browser()!.newContext();
  const opened = await other.newPage();
  if (setups.length > 0) {
    await opened.addInitScript((list) => {
      localStorage.setItem('keydist:setup-library', JSON.stringify({ version: 1, setups: list, overrides: {} }));
    }, setups);
  }
  await opened.goto(url);
  return { opened, close: () => other.close() };
}

test('共有リンクは集合を並び順・基準ごと運び、自作のSetupは名前で引き、無ければ名前を添えて示す', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'src-1', layoutId: 'colemak-dh', shapeId: 'row-staggered', label: '仕事用' }],
        overrides: {},
      }),
    );
  });
  await page.goto('/analyzer/comparison');
  // 加えた順は Dvorak → 仕事用 → QWERTY（表示の並びは一覧の順で、ここの順とは別）。
  await addTarget(page, 'layout:dvorak');
  await addTarget(page, 'setup:src-1');
  await addTarget(page, 'layout:qwerty');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('setup:src-1');
  await expect(page.locator('.comparison-table tr[data-baseline="true"]')).toContainText('仕事用');
  // 自作のテキストは載らない旨が出るので、組み込みのテキストを選んでから確かめる。
  await selectBuiltinText(page);
  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーしました' })).toBeVisible();
  // 載らない対象が無い時は、送る側へ示す文を出さない。
  await expect(page.locator('[data-share-notice="true"]')).toHaveCount(0);
  const url = await page.evaluate(() => navigator.clipboard.readText());
  // 組み込みの配列はid、Setupは名前だけ（端末ごとのidは載せない）。
  expect(url).toContain('targets=layout%3Advorak');
  expect(url).not.toContain('src-1');

  // 同じ名前のSetupを別のidで持つ人は、そのSetupで開く。並び順と基準も同じ。
  const same = await openShared(context, url, [{ id: 'dst-9', layoutId: 'colemak-dh', shapeId: 'row-staggered', label: '仕事用' }]);
  try {
    await expect(same.opened.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
    await expect(same.opened.locator('.comparison-table tr[data-baseline="true"]')).toContainText('仕事用');
    await expect(same.opened.locator('[data-pane-link-notice="true"]')).toHaveCount(0);
    await expect(same.opened).toHaveURL(/\/analyzer\/comparison$/);
    const stored = await same.opened.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY);
    expect(JSON.parse(stored!).targets).toEqual([
      { kind: 'layout', layoutId: 'dvorak' },
      { kind: 'setup', setupId: 'dst-9' },
      { kind: 'layout', layoutId: 'qwerty' },
    ]);
  } finally {
    await same.close();
  }

  // Setupを持たない人は、見つからない名前を示され、残りの配列で開く。基準は集合に無いので「なし」。
  const missing = await openShared(context, url);
  try {
    await expect(missing.opened.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
    await expect(missing.opened.locator('[data-pane-link-notice="true"]')).toContainText('Setup「仕事用」');
    await expect(missing.opened.locator('[data-pane-link-notice="true"]')).toContainText('見つかりませんでした');
    await expect(missing.opened.locator('.comparison-table tr[data-baseline="true"]')).toHaveCount(0);
  } finally {
    await missing.close();
  }
});

test('共有リンクで届いた解析設定と対象は、「元に戻す」1回でリンクを開く前へ戻る', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }] }));
    localStorage.setItem(
      'keydist:standalone-analyzer-options',
      JSON.stringify({ version: 1, comparison: { visibleColumns: ['actions', 'totalUnits'] } }),
    );
  });
  await page.goto('/analyzer/comparison?targets=layout%3Advorak&targets=layout%3Aqwerty&columns=totalUnits');
  const rows = page.locator('.comparison-table tbody tr[data-comparison-row="ok"]');
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/analyzer\/comparison$/);
  // 表示する列は、選んでいる列だけが「〜を外す」ボタン付きの札で並ぶ
  const firstColumn = async () => (await openSettings(page)).getByRole('button', { name: 'アクション数を外す', exact: true });
  await expect(await firstColumn()).toHaveCount(0);
  await page.keyboard.press('Escape');

  const undo = page.getByRole('button', { name: '元に戻す' });
  await undo.click();
  await expect(rows).toHaveCount(1);
  await expect(await firstColumn()).toHaveCount(1);
  await page.keyboard.press('Escape');
  // 取り込みは履歴1項目なので、これ以上戻すものは無い。
  await expect(undo).toBeDisabled();
});

/** テキストを組み込みの「吾輩は猫である」の冒頭（既定）に切り替え、チップを閉じる。 */
async function selectBuiltinText(page: Page): Promise<void> {
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ').selectOption('builtin:builtin:ja.legacy');
  await page.keyboard.press('Escape');
}

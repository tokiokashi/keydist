import { expect, test } from '@playwright/test';
import { enabledValues, recordControlStates } from './options-draft-recorder.ts';
import { openSettings, openTargetSelection } from './pane-helper.ts';

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
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
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
  await openTargetSelection(page);
  await page.getByLabel('追加する対象').selectOption(optionValue);
  await page.getByRole('button', { name: '追加', exact: true }).click();
}

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに2本の折れ線が出る', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: 'N感度', exact: true, level: 1 })).toBeVisible();

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

test('色は加えた順に配り、1つ外しても他の線の色は変わらず、空いた色を次に加えた対象が使う', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  const strokeOf = (key: string) => page.locator(`[data-n-sensitivity-series="${key}"] path`).getAttribute('stroke');

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await addTarget(page, 'layout:dvorak');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 10_000 });
  const [first, second, third] = [await strokeOf('layout:qwerty'), await strokeOf('layout:colemak-dh'), await strokeOf('layout:dvorak')];
  expect(new Set([first, second, third]).size).toBe(3);

  await page.getByRole('button', { name: '1番目を外す' }).click();
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  expect(await strokeOf('layout:colemak-dh')).toBe(second);
  expect(await strokeOf('layout:dvorak')).toBe(third);

  await addTarget(page, 'layout:workman');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 10_000 });
  expect(await strokeOf('layout:workman')).toBe(first);
});

test('Setupを2件選ぶと2本の折れ線が表示される', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await expect(page.getByRole('heading', { name: 'N感度', exact: true, level: 1 })).toBeVisible();

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

  const relative = (await openSettings(page)).getByRole('radio', { name: '相対（N=0を100%）' });
  const absolute = (await openSettings(page)).getByRole('radio', { name: '実測値 [u]' });
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
  await expect((await openSettings(page)).getByRole('radio', { name: '実測値 [u]' })).toBeChecked();
  await expect((await openSettings(page)).getByRole('radio', { name: '相対（N=0を100%）' })).not.toBeChecked();
});

test('選択・並び順はリロードしても残り、資産の読み込み前に上書きされない', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  await openTargetSelection(page);
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
  await openTargetSelection(page);
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
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
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

  await openTargetSelection(page);
  await expect(page.locator('.set-selection-order li')).toHaveCount(2);
});

test('既定と違う条件（windowSize以外）が併記される。windowSizeは掃引軸なので出さない', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
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

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・開発用の語）が出ない（レビュー指摘H1〜H4）', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('N感度 | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|standalone|単体ページ|個別画面/);
  const body = page.locator('body');
  await expect(body).not.toContainText(/#\d{3}|Phase|standalone|単体ページ|個別画面|\.ts\b|Vector lab|connections|N sensitivity|Setup comparison|baseline|言語判定: /);
});

test('保存済みの縦軸は、操作可能になった瞬間から表示されている（既定値のまま操作できる瞬間が無い。#603）', async ({ page }) => {
  await recordControlStates(
    page,
    {
      storageKey: STANDALONE_ANALYZER_OPTIONS_KEY,
      storageValue: JSON.stringify({ version: 1, 'n-sensitivity': { scale: 'absolute' } }),
    },
    // 縦軸は解析設定の小窓にあり、小窓を開くボタンは読み込みが済むまで押せない。
    { selector: '[data-settings-window="true"] input[type="radio"][value="absolute"]', read: 'checked' },
  );
  await page.goto('/standalone/n-sensitivity');
  const absolute = (await openSettings(page)).getByRole('radio', { name: '実測値 [u]' });
  await expect(absolute).toBeEnabled({ timeout: 10_000 });
  await expect(absolute).toBeChecked();
  expect(await enabledValues(page)).toEqual(['true']);
});

test('対象が空の時はペインが案内を出し、全メンバーが失敗した時は凡例の失敗行だけが残る', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-pane-empty="true"]')).toContainText('対象を1つ以上選ぶ');

  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:analyzer-set-selections',
      JSON.stringify({
        version: 2,
        selections: { 'n-sensitivity': { targets: [{ kind: 'setup', setupId: 'deleted-setup' }] } },
      }),
    );
  });
  await page.reload();
  await expect(page.locator('[data-n-sensitivity-row="failed"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('[data-pane-empty="true"]')).toHaveCount(0);
  await expect(page.locator('.pane-body')).not.toContainText('対象を1つ以上選ぶ');
  await expect(page.locator('.n-sensitivity-svg')).toHaveCount(0);
});

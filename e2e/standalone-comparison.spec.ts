import { expect, test } from '@playwright/test';
import { enabledValues, recordControlStates } from './options-draft-recorder.ts';
import { dismissAutoOpenedSelection, expectTargetNames, openSettings, openTargetSelection, targetNames, toggleTarget } from './pane-helper.ts';

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

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに比較できる', async ({ page }) => {
  await page.goto('/standalone/comparison');
  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: '比較表', exact: true, level: 1 })).toBeVisible();

  // 手持ちのSetupは0件（初期Setupの自動生成をやめた。#578指摘1）。
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

test('Setupを2件選ぶと2行表示され、並びは付けた順によらず一覧の順で、基準選択が効く', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  await expect(page.getByRole('heading', { name: '比較表', exact: true, level: 1 })).toBeVisible();

  // 後ろのSetupから付けても、並びは一覧の順（Setup 1 → Setup 2）。
  await addTarget(page, 'setup:fixed-b');
  await addTarget(page, 'setup:fixed-a');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);
  await expect(table.locator('tbody tr').first()).toContainText('QWERTY');

  // 配列はSetupより前。外して付け直しても並びは変わらない。
  await addTarget(page, 'layout:dvorak');
  await expectTargetNames(page, ['Dvorak', 'QWERTY', 'Colemak-DH']);
  await toggleTarget(page, 'setup:fixed-a');
  await toggleTarget(page, 'setup:fixed-a');
  await expectTargetNames(page, ['Dvorak', 'QWERTY', 'Colemak-DH']);
  await toggleTarget(page, 'layout:dvorak');

  // 基準を選ぶと、その行に基準マークが付く。
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('setup:fixed-a');
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(1);
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('QWERTY');
});

test('選択・基準はリロードしても残る（資産の読み込み前に消えない）', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await addTarget(page, 'setup:fixed-b');
  await addTarget(page, 'setup:fixed-a');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);

  await openTargetSelection(page);
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

  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);
  await openTargetSelection(page);
  await expect(page.getByLabel('基準', { exact: true })).toHaveValue('setup:fixed-a');
  await expect(tableAfterReload.locator('tr[data-baseline="true"]')).toHaveCount(1);

  // storage側の中身も保たれている（付けた順・基準とも。付けた順は色を配る順）。
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
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
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

  // 選択の並び（2件のまま）自体は保たれている。見つからない対象は選択の中で外せる形で出る。
  await expect.poll(async () => (await targetNames(page)).length).toBe(2);
  const missing = (await openTargetSelection(page)).locator('[data-target-group="missing"] input[value="setup:deleted-setup"]');
  await expect(missing).toBeChecked();
});

test('既定と違う条件が行に併記される（#544 Phase 3レビュー: 集合対象ページ共通の条件併記）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
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

test('既定の物理配列を変えると、配列対象は追従しSetup対象（明示的な物理配列を持つ）は追従しない', async ({ page }) => {
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

  // 配列対象・Setup対象とも最初は同じ物理配列（row-staggered、既定）なので条件欄は差分無し。
  await expect.poll(async () => (await targetNames(page))[0]).toContain('QWERTY');

  await page.getByLabel('既定の物理配列').selectOption('ortholinear');

  // 配列対象（行1: layout:qwerty）の条件欄に物理配列の変更が反映される。
  // Setup対象（行2: setup:fixed-a、shapeIdを明示的に持つ）は変わらない。
  const rows = table.locator('tbody tr[data-comparison-row="ok"]');
  await expect(rows.nth(0).locator('.comparison-condition-cell')).toContainText('オーソリニア', { timeout: 10_000 });
  await expect(rows.nth(1).locator('.comparison-condition-cell')).not.toContainText('オーソリニア');
});

/** fixed-a（qwerty）・fixed-b（colemak-dh）の2件と、比較表の集合を仕込む。 */
function seedSelection({ targets, overrides }: { targets: readonly unknown[]; overrides: Record<string, unknown> }) {
  localStorage.setItem(
    'keydist:setup-library',
    JSON.stringify({
      version: 1,
      setups: [
        { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
        { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
      ],
      overrides,
    }),
  );
  localStorage.setItem(
    'keydist:analyzer-set-selections',
    JSON.stringify({ version: 2, selections: { comparison: { targets } } }),
  );
}

test('Setup対象だけの集合では、既定の物理配列を変えても名前・条件欄に「既定の物理配列」が出ない（M1）', async ({ page }) => {
  const targets = [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'fixed-b' }];
  await page.addInitScript(seedSelection, { targets, overrides: {} });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:setup-library')))
    .toContain('ortholinear');

  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);
  await expect(table).not.toContainText('既定の物理配列');
  await expect(table).not.toContainText('ortholinear');
  await expect(table).not.toContainText('オーソリニア');
});

test('配列と上書きの無いSetupが同名になっても、衝突した2つだけ種類で区別しidは出さない（M3）', async ({ page }) => {
  const targets = [
    { kind: 'layout', layoutId: 'qwerty' },
    { kind: 'setup', setupId: 'fixed-a' },
    { kind: 'setup', setupId: 'fixed-b' },
  ];
  await page.addInitScript(seedSelection, { targets, overrides: {} });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY（配列）', 'QWERTY（Setup 1）', 'Colemak-DH']);
  await expect(await openTargetSelection(page)).not.toContainText(/layout:|setup:|fixed-/);
  await expect(table).not.toContainText(/layout:|setup:|fixed-/);
});

test('解決に失敗したメンバーにも意味のある名前が付く（L2）', async ({ page }) => {
  const targets = [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'deleted-setup' }];
  await page.addInitScript(seedSelection, { targets, overrides: {} });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="failed"]')).toHaveCount(1, { timeout: 10_000 });
  await expect.poll(async () => (await targetNames(page))[1]).toBe('削除されたSetup');
  const failedRow = table.locator('tbody tr[data-comparison-row="failed"]');
  await expect(failedRow).toContainText('削除されたSetup');
  // 理由は1つの短い文で、前置きを重ねない・idを出さない（レビュー指摘H3）。
  await expect(failedRow.locator('td')).toHaveText('Setupが削除された');
  await expect(failedRow).not.toContainText(/deleted-setup|解決できない/);
});

test('絞り込み欄で候補を絞り、キーボードだけで選んで、Escapeで閉じるとボタンへ戻る', async ({ page }) => {
  await page.goto('/standalone/comparison');
  const button = page.getByRole('button', { name: /^対象: / });
  await dismissAutoOpenedSelection(page);
  await button.click();
  const selection = page.getByRole('dialog', { name: '対象の選択' });
  await expect(selection).toBeVisible();
  // 開くと絞り込み欄にフォーカスがあり、すぐ打てる。
  const filter = selection.getByRole('searchbox', { name: '配列・Setupを名前で絞り込む' });
  await expect(filter).toBeFocused();
  await page.keyboard.type('colemak');
  await expect(selection.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(selection.locator('[data-target-group]')).toHaveCount(1);

  // Tabで候補へ移り、Spaceで付けた瞬間に反映される（決定ボタンは無い）。
  await page.keyboard.press('Tab');
  await expect(selection.locator('input[value="layout:colemak"]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(selection.locator('input[value="layout:colemak"]')).toBeChecked();
  await expect(selection.getByRole('button', { name: '決定' })).toHaveCount(0);
  await expectTargetNames(page, ['Colemak']);

  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await expect(selection).toHaveCount(0);
  await expect(button).toBeFocused();
  // 閉じて開き直すと絞り込みは空に戻る。
  await button.click();
  await expect(filter).toHaveValue('');
});

test('Tabで選択の最後から先へ進むと閉じてボタンの次へ、最初から戻るとボタンへ移る', async ({ page }) => {
  await page.goto('/standalone/comparison');
  const button = page.getByRole('button', { name: /^対象: / });
  const selection = page.getByRole('dialog', { name: '対象の選択' });
  await dismissAutoOpenedSelection(page);

  // 最初（絞り込み欄）からShift+Tabで戻ると、閉じて対象ボタンへ。
  await button.click();
  await expect(selection.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(selection).toHaveCount(0);
  await expect(button).toBeFocused();

  // 最後（閉じる）からTabで進むと、閉じてボタンの次（解析設定）へ。
  await button.click();
  await selection.getByRole('button', { name: '閉じる' }).focus();
  await page.keyboard.press('Tab');
  await expect(selection).toHaveCount(0);
  await expect(page.getByRole('button', { name: '解析設定', exact: true })).toBeFocused();
});

test('ラベル付きのSetupは、候補の2行目にフル名を出す', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:setup-library', JSON.stringify({
      version: 1,
      setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered', label: '自宅の分割キーボード' }],
      overrides: {},
    }));
  });
  await page.goto('/standalone/comparison');
  const selection = await openTargetSelection(page);
  const choice = selection.locator('label:has(input[value="setup:fixed-a"])');
  await expect(choice.locator('.target-selection-choice-name')).toHaveText('自宅の分割キーボード');
  await expect(choice.locator('.target-selection-choice-detail')).toContainText('QWERTY');
});

test.describe('スマホ幅', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('選択は画面下からのシートで出て、暗い所を押すと閉じて対象ボタンへフォーカスが戻る', async ({ page }) => {
    await page.goto('/standalone/comparison');
    const button = page.getByRole('button', { name: /^対象: / });
    const selection = await openTargetSelection(page);
    const box = (await selection.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    await page.mouse.click(195, 40);
    await expect(selection).toHaveCount(0);
    await expect(button).toBeFocused();
  });
});

test('候補に当てはまる配列・Setupが無い時は、その旨を出す', async ({ page }) => {
  await page.goto('/standalone/comparison');
  const selection = await openTargetSelection(page);
  await selection.getByRole('searchbox').fill('そんな配列は無い');
  await expect(selection).toContainText('当てはまる配列・Setupは無い。');
});

test('対象の選択は組み込み・英字 / 組み込み・かな / Setupの区分に分かれ、外を押すと閉じる', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/comparison');
  const selection = await openTargetSelection(page);
  await expect(selection.locator('legend')).toHaveText(['組み込み・英字の配列', '組み込み・かな配列', 'Setup']);
  await expect(selection.locator('[data-target-group="builtin-kana"] input[value="layout:naginata-v18"]')).toHaveCount(1);
  await toggleTarget(page, 'layout:qwerty');
  await toggleTarget(page, 'layout:naginata-v18');
  await expect(selection.getByRole('status')).toHaveText('2件を選択中');
  await page.getByRole('heading', { name: '比較表', level: 1 }).click();
  await expect(selection).toHaveCount(0);

  // 「すべて外す」は選択を空にする（戻す時はUndo）。
  await openTargetSelection(page);
  await selection.getByRole('button', { name: 'すべて外す' }).click();
  await expectTargetNames(page, []);
  await expect(page.locator('[data-pane-empty="true"]')).toBeVisible();
});

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・開発用の語）が出ない（レビュー指摘H1〜H4）', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expect(page).toHaveTitle('比較表 | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|standalone|単体ページ|個別画面/);
  const body = page.locator('body');
  await expect(body).not.toContainText(/#\d{3}|Phase|standalone|単体ページ|個別画面|\.ts\b|Vector lab|connections|N sensitivity|Setup comparison|baseline|言語判定: /);
});

test('保存済みの表示する列は、操作可能になった瞬間から表示されている（既定値のまま操作できる瞬間が無い。#603）', async ({ page }) => {
  // 既定は全列表示。保存値では先頭の「動作数」を外しておく。
  await recordControlStates(
    page,
    {
      storageKey: 'keydist:standalone-analyzer-options',
      storageValue: JSON.stringify({ version: 1, comparison: { visibleColumns: ['totalUnits'] } }),
    },
    // 表示する列は解析設定の小窓にあり、小窓を開くボタンは読み込みが済むまで押せない。先頭が「動作数」。
    { selector: '[data-settings-window="true"] input[type="checkbox"]', read: 'checked' },
  );
  await page.goto('/standalone/comparison');
  const firstColumn = (await openSettings(page)).getByRole('checkbox', { name: '動作数', exact: true });
  await expect(firstColumn).toBeEnabled({ timeout: 10_000 });
  await expect(firstColumn).not.toBeChecked();
  expect(await enabledValues(page)).toEqual(['false']);
});

test('基準にする対象は対象の選択の中にあり、解析設定には無い', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });

  const selection = await openTargetSelection(page);
  await expect(selection.getByLabel('基準', { exact: true })).toBeVisible();
  const settings = await openSettings(page);
  await expect(settings.getByLabel('基準', { exact: true })).toHaveCount(0);
  await expect(settings.getByRole('checkbox', { name: '動作数', exact: true })).toBeVisible();

  // 本体は見出し・説明段落・観測値の注記を持たない。
  const body = page.locator('.pane-body');
  await expect(body.getByRole('heading', { name: '比較表' })).toHaveCount(0);
  await expect(body).not.toContainText('配列の優劣を判定するスコアではない');
});

test('対象が空の時は、ペインに選ぶボタンだけを出し、パソコン幅では選択を自動で開く（フォーカスは奪わない）', async ({ page }) => {
  await page.goto('/standalone/comparison');
  const empty = page.locator('[data-pane-empty="true"]');
  const choose = empty.getByRole('button', { name: '配列・Setupを選ぶ' });
  await expect(choose).toBeVisible();
  // 操作すれば分かる結果の説明は置かない。
  await expect(empty).toHaveText('配列・Setupを選ぶ');
  await expect(page.locator('.comparison-table')).toHaveCount(0);

  // 開いた直後に自動で開くが、フォーカスは中へ移さない。
  const selection = page.getByRole('dialog', { name: '対象の選択' });
  await expect(selection).toBeVisible();
  await expect(selection.getByRole('searchbox')).not.toBeFocused();

  // 閉じたら同じペインでは出し直さない。空のボタンから開けば同じ選択が開く。
  await page.getByRole('heading', { name: '比較表', level: 1 }).click();
  await expect(selection).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(selection).toHaveCount(0);
  await choose.click();
  await expect(selection).toBeVisible();
  await expect(selection.getByRole('searchbox')).toBeFocused();
  await toggleTarget(page, 'layout:qwerty');
  await expect(empty).toHaveCount(0);
});

test.describe('スマホ幅で対象が空の時', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('選択は自動では開かない', async ({ page }) => {
    await page.goto('/standalone/comparison');
    await expect(page.getByRole('button', { name: '配列・Setupを選ぶ' })).toBeEnabled();
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);
  });
});

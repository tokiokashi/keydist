import { expect, test, type Page } from '@playwright/test';
import { enabledValues, recordControlStates } from './options-draft-recorder.ts';
import { dismissAutoOpenedSelection, expectChosenTarget, expectTargetNames, openSettings, openTargetSelection, targetButton, targetNames, toggleTarget } from './pane-helper.ts';

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

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに比較できる', async ({ page }) => {
  await page.goto('/standalone/comparison');
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
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY))
    .toContain('fixed-a');
  const storedBeforeReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    MULTI_TARGET_SELECTION_KEY,
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
    MULTI_TARGET_SELECTION_KEY,
  );
  const parsed = JSON.parse(storedAfterReload ?? '{}') as {
    targets: { kind: string; setupId?: string }[];
    baseline?: { kind: string; setupId?: string };
  };
  expect(parsed.targets.map((t) => t.setupId)).toEqual(['fixed-b', 'fixed-a']);
  expect(parsed.baseline?.setupId).toEqual('fixed-a');
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
      'keydist:multi-target-selection',
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'deleted-setup' }],
      }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });

  // 解決できたメンバー（fixed-a）は通常通りok行として出る。
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });

  // 解決できなかったメンバー（deleted-setup）は行ごと消えず、失敗として表示される
  // （全体をfailedにしない）。
  const failedRow = table.locator('tbody tr[data-comparison-row="failed"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText('削除された');

  // 選択の並び（2件のまま）自体は保たれている。見つからない対象は選択の中で外せる形で出る。
  await expect.poll(async () => (await targetNames(page)).length).toBe(2);
  const missing = (await openTargetSelection(page)).locator('[data-target-group="missing"] input[value="setup:deleted-setup"]');
  await expect(missing).toBeChecked();
});

test('既定と違う条件が条件の要約に出る（対象ごとの差は無い）', async ({ page }) => {
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
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'setup', setupId: 'fixed-a' }] }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('同指連続のホーム復帰距離');
  await expect(summary.locator('.pane-condition-trigger')).not.toContainText('対象ごとに差あり');
  await summary.locator('.pane-condition-trigger').click();
  await expect(summary.getByRole('region', { name: '対象ごとの差' })).toHaveCount(0);
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
      'keydist:multi-target-selection',
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: 'fixed-a' }],
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

  // 既定の物理配列は全体の条件として、条件の要約に出る。
  await expect(page.locator('.pane-condition-trigger')).toContainText('オーソリニア', { timeout: 10_000 });
});

test('対象ごとに条件が違う時は、閉じた1行に「対象ごとに差あり」、開くと違う対象の違う項目だけが出る。「条件」の列は無い', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
        ],
        overrides: { setup: { 'fixed-a': { windowSize: 2 } } },
      }),
    );
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'fixed-b' }] }),
    );
  });
  await page.goto('/standalone/comparison');

  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expect(table.getByRole('columnheader', { name: '条件' })).toHaveCount(0);

  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり');
  await summary.locator('.pane-condition-trigger').click();
  const diffs = summary.getByRole('region', { name: '対象ごとの差' });
  // 共通の行は画面の値（N=3）。違うSetupだけが差に出る
  await expect(diffs.locator('.pane-condition-diff')).toHaveCount(1);
  await expect(diffs.locator('.pane-condition-diff')).toContainText('先読みN=2');
  await expect(diffs).not.toContainText('同指連続');
});

test('全対象の条件が同じなら、対象ごとの差の節も「対象ごとに差あり」も出ない', async ({ page }) => {
  const targets = [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'fixed-b' }];
  await page.addInitScript(seedSelection, { targets, overrides: {} });
  await page.goto('/standalone/comparison');

  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).not.toContainText('対象ごとに差あり');
  await summary.locator('.pane-condition-trigger').click();
  await expect(summary.getByRole('region', { name: '対象ごとの差' })).toHaveCount(0);
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
    'keydist:multi-target-selection',
    JSON.stringify({ version: 1, targets }),
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
  // 理由は1つの短い文で、前置きを重ねない・idを出さない。
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

test('絞り込み欄は読みでも探せ、カタカナで打っても同じ候補が出る', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await dismissAutoOpenedSelection(page);
  await page.getByRole('button', { name: /^対象: / }).click();
  const selection = page.getByRole('dialog', { name: '対象の選択' });
  const filter = selection.getByRole('searchbox', { name: '配列・Setupを名前で絞り込む' });
  await filter.fill('なぎなた');
  await expect(selection.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(selection.locator('input[value="layout:naginata-v18"]')).toBeVisible();
  await filter.fill('ナギナタ');
  await expect(selection.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(selection.locator('input[value="layout:naginata-v18"]')).toBeVisible();
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

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・開発用の語）が出ない', async ({ page }) => {
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

test('保存済みの表示する列は、操作可能になった瞬間から表示されている（既定値のまま操作できる瞬間が無い）', async ({ page }) => {
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
  // 「閉じた後に開き直されない」ことが検査の中身なので、猶予の分は実時間で待つ
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
    // 「後から自動で開かない」ことが検査の中身なので、猶予の分は実時間で待つ
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);
  });
});

function seedQwertySelection() {
  return () => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }] }),
    );
  };
}

test('読み込み時に対象があったペインは、最後の1件を外しても選択を自動で開かず、開き直すと絞り込み欄へフォーカスが入る', async ({ page }) => {
  await page.addInitScript(seedQwertySelection());
  await page.goto('/standalone/comparison');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  const selection = page.getByRole('dialog', { name: '対象の選択' });
  await expect(selection).toHaveCount(0);

  // 最後の1件を外して空にし、Escapeで閉じる。
  const panel = await openTargetSelection(page);
  await panel.locator('input[value="layout:qwerty"]').click();
  await expect(page.locator('[data-pane-empty="true"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selection).toHaveCount(0);
  // 「閉じた後に開き直されない」ことが検査の中身なので、猶予の分は実時間で待つ
  await page.waitForTimeout(300);
  await expect(selection).toHaveCount(0);

  // 見出しの対象ボタンで開き直すと、ふつうに開いた時と同じく絞り込み欄へフォーカスが入る。
  await targetButton(page).click();
  await expect(selection).toBeVisible();
  await expect(selection.getByRole('searchbox')).toBeFocused();
});

test('別のタブで対象をすべて外されても、今のタブで選択が勝手に開かない', async ({ context }) => {
  await context.addInitScript(seedQwertySelection());
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto('/standalone/comparison');
  await pageB.goto('/standalone/comparison');
  await expect(pageA.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(pageB.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });

  const panelB = await openTargetSelection(pageB);
  await panelB.getByRole('button', { name: 'すべて外す' }).click();
  await expect(pageB.locator('[data-pane-empty="true"]')).toBeVisible();

  // 外した結果はタブAへも届くが、タブAの選択は開かない。
  await expect(pageA.locator('[data-pane-empty="true"]')).toBeVisible({ timeout: 10_000 });
  // 「後から自動で開かない」ことが検査の中身なので、猶予の分は実時間で待つ
  await pageA.waitForTimeout(300);
  await expect(pageA.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);

  await pageA.close();
  await pageB.close();
});

// 1本にまとめると6回のページ遷移で単独でも12〜15秒かかり、並列の負荷で30秒の枠を超える。
// 共有（Multi同士）、穴埋めと独立（Single→Multi）、Singleを選んだ後の不変（Multi→Single）は別の主張なので、3本に分ける。
test('Multiの集合（並び・色・基準）はN感度と共有される', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('layout:colemak-dh');
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY))
    .toContain('"baseline"');
  const comparisonNames = await targetNames(page);

  // N感度は同じ集合をそのまま使う。
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, comparisonNames);
});

test('Singleはまだ選んでいなければMultiの基準で埋まり、Singleで選び直してもMultiの集合は変わらない', async ({ page }) => {
  // Singleの穴埋めは、Multiで基準を選んだ時に一度だけ書かれる（保存済みの集合を読んでも起きない）ので、画面で基準を選ぶ。
  const table = page.locator('.comparison-table');
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('layout:colemak-dh');
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY))
    .toContain('"baseline"');
  const comparisonNames = await targetNames(page);

  // Bigram Flowはまだ対象を選んでいないので、Multiの基準（Colemak-DH）で埋まる。
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expectChosenTarget(page, 'layout:colemak-dh');

  // Bigram Flowで選び直してもMultiの集合は変わらない。
  await toggleTarget(page, 'layout:dvorak');
  await expectChosenTarget(page, 'layout:dvorak');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:single-target-selection')))
    .toContain('dvorak');
  await page.goto('/standalone/comparison');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, comparisonNames);
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('Colemak-DH');
});

test('Singleで一度選んだ後は、Multiの基準を変えてもSingleは変わらない', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await toggleTarget(page, 'layout:dvorak');
  await expectChosenTarget(page, 'layout:dvorak');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:single-target-selection')))
    .toContain('dvorak');

  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('layout:qwerty');
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY))
    .toContain('"baseline":{"kind":"layout","layoutId":"qwerty"}');
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expectChosenTarget(page, 'layout:dvorak');
});

test('基準の配列を外すと基準なしになり、付け直すと基準と表の内容が戻る', async ({ page }) => {
  await page.goto('/standalone/comparison');
  const table = page.locator('.comparison-table');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:dvorak');
  await addTarget(page, 'layout:colemak-dh');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('layout:qwerty');
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('QWERTY');
  const before = await table.innerText();

  await toggleTarget(page, 'layout:qwerty');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expect(table.locator('tr[data-baseline="true"]')).toHaveCount(0);

  await toggleTarget(page, 'layout:qwerty');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
  await expect(table.locator('tr[data-baseline="true"]')).toContainText('QWERTY');
  expect(await table.innerText()).toBe(before);
});

test('読み込み前のHTMLに空状態のボタンが無く、保存済みの対象があれば読み込み後に表が出る', async ({ page }) => {
  // プリレンダーされたHTML（=ハイドレーション前に見える画面）。保存済みの対象が
  // まだ反映されていないだけの間に、押せない「配列・Setupを選ぶ」を出さない。
  for (const path of ['/standalone/comparison', '/standalone/n-sensitivity']) {
    const html = await (await page.request.get(path)).text();
    expect(html, path).not.toContain('配列・Setupを選ぶ');
  }

  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'layout', layoutId: 'dvorak' }],
        colorSlots: {},
      }),
    );
  }, MULTI_TARGET_SELECTION_KEY);
  await page.goto('/standalone/comparison');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: '配列・Setupを選ぶ' })).toHaveCount(0);
});

test('「共有」でコピーしたURLを新しいページで開くと、解析設定（表示する列）がその値で開く', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:qwerty');
  const table = page.locator('.comparison-table');
  await expect(table).toBeVisible({ timeout: 10_000 });

  // 既定（全列）から「動作数」の列を外す。
  await expect(table.locator('thead')).toContainText('動作数');
  const actions = (await openSettings(page)).getByRole('checkbox', { name: '動作数', exact: true });
  await actions.uncheck();
  await expect(table.locator('thead th', { hasText: /^動作数$/ })).toHaveCount(0);

  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('columns=');

  // 保存値の無い新しいコンテキストで開く。URLの値で開き、取り込み後はURLから消える。
  const other = await context.browser()!.newContext();
  try {
    const opened = await other.newPage();
    await opened.goto(url);
    // 対象もURLで届くので、選び直さなくても表が出る。
    const openedTable = opened.locator('.comparison-table');
    await expect(openedTable).toBeVisible({ timeout: 10_000 });
    await expect(openedTable.locator('thead')).toContainText('距離');
    await expect(openedTable.locator('thead th', { hasText: /^動作数$/ })).toHaveCount(0);
    await expect((await openSettings(opened)).getByRole('checkbox', { name: '動作数', exact: true })).not.toBeChecked();
    await expect(opened).toHaveURL(/\/standalone\/comparison$/);
  } finally {
    await other.close();
  }
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
  await page.goto('/standalone/comparison');
  // 加えた順は Dvorak → 仕事用 → QWERTY（表示の並びは一覧の順で、ここの順とは別）。
  await addTarget(page, 'layout:dvorak');
  await addTarget(page, 'setup:src-1');
  await addTarget(page, 'layout:qwerty');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
  await openTargetSelection(page);
  await page.getByLabel('基準', { exact: true }).selectOption('setup:src-1');
  await expect(page.locator('.comparison-table tr[data-baseline="true"]')).toContainText('仕事用');
  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  // 組み込みの配列はid、Setupは名前だけ（端末ごとのidは載せない）。
  expect(url).toContain('targets=layout%3Advorak');
  expect(url).not.toContain('src-1');

  // 同じ名前のSetupを別のidで持つ人は、そのSetupで開く。並び順と基準も同じ。
  const same = await openShared(context, url, [
    { id: 'dst-9', layoutId: 'colemak-dh', shapeId: 'row-staggered', label: '仕事用' },
  ]);
  try {
    await expect(same.opened.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 10_000 });
    await expect(same.opened.locator('.comparison-table tr[data-baseline="true"]')).toContainText('仕事用');
    await expect(same.opened.locator('[data-pane-link-notice="true"]')).toHaveCount(0);
    await expect(same.opened).toHaveURL(/\/standalone\/comparison$/);
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
    await expect(missing.opened.locator('[data-pane-link-notice="true"]')).toContainText('見つからなかった');
    await expect(missing.opened.locator('.comparison-table tr[data-baseline="true"]')).toHaveCount(0);
  } finally {
    await missing.close();
  }
});

test('共有リンクの対象を1つも引けない時は、今の対象を変えずに名前を示す', async ({ page }) => {
  await page.goto('/standalone/comparison');
  await addTarget(page, 'layout:dvorak');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  await page.goto('/standalone/comparison?targets=setup%3A%E6%B6%88%E3%81%88%E3%81%9FSetup');
  await expect(page.locator('[data-pane-link-notice="true"]')).toContainText('Setup「消えたSetup」');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
});

test('手持ちの集合が空で共有リンクの対象を1つも引けない時も、対象の選択を自動で開かない', async ({ page }) => {
  await page.goto('/standalone/comparison?targets=setup%3A%E6%B6%88%E3%81%88%E3%81%9FSetup');
  await expect(page.locator('[data-pane-link-notice="true"]')).toContainText('Setup「消えたSetup」');
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  // URLからパラメータが消えた後の再描画でも、開く判断へ戻らない
  // 「後から自動で開かない」ことが検査の中身なので、猶予の分は実時間で待つ
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);
});

async function openSummaryWith(page: Page, setups: readonly { id: string; layoutId: string; shapeId: string }[]) {
  await page.addInitScript(({ setups: list }) => {
    localStorage.setItem('keydist:setup-library', JSON.stringify({ version: 1, setups: list, overrides: {} }));
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: list.map((s) => ({ kind: 'setup', setupId: s.id })) }),
    );
  }, { setups });
  await page.goto('/standalone/comparison');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(setups.length, { timeout: 10_000 });
  const summary = page.locator('.pane-condition-summary');
  await summary.locator('.pane-condition-trigger').click();
  return summary;
}

test('ANSIとJISのQWERTYは、共通の指の割当は列固定で、JISだけが対象ごとの差に出る', async ({ page }) => {
  const summary = await openSummaryWith(page, [
    { id: 'ansi', layoutId: 'qwerty', shapeId: 'row-staggered' },
    { id: 'jis', layoutId: 'qwerty', shapeId: 'jis-row-staggered' },
  ]);
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり');
  await expect(summary.getByLabel('指の割当', { exact: true })).toHaveValue('default');
  const diffs = summary.getByRole('region', { name: '対象ごとの差' });
  await expect(diffs.locator('.pane-condition-diff')).toHaveCount(1);
  await expect(diffs.locator('.pane-condition-diff')).toContainText('ロウスタッガード（JIS）');
  await expect(diffs.locator('.pane-condition-diff')).toContainText('指の割当=JIS既定（列固定）');
});

for (const order of ['大西が先', 'QWERTYが先']) {
  test(`QWERTYと大西配列は、並び（${order}）によらず共通は訓令式で、大西配列だけが対象ごとの差に出る`, async ({ page }) => {
    const qwerty = { id: 'qwerty', layoutId: 'qwerty', shapeId: 'row-staggered' };
    const onishi = { id: 'onishi', layoutId: 'oonishi', shapeId: 'row-staggered' };
    const summary = await openSummaryWith(page, order === '大西が先' ? [onishi, qwerty] : [qwerty, onishi]);
    await expect(summary).toContainText('訓令式');
    const diffs = summary.getByRole('region', { name: '対象ごとの差' });
    await expect(diffs.locator('.pane-condition-diff')).toHaveCount(1);
    await expect(diffs.locator('.pane-condition-diff')).toContainText('ローマ字規則=大西式');
  });
}

test('全体のローマ字規則を変えると、QWERTYの数値は動き、推奨を持つ大西配列は動かない', async ({ page }) => {
  const summary = await openSummaryWith(page, [
    { id: 'qwerty', layoutId: 'qwerty', shapeId: 'row-staggered' },
    { id: 'onishi', layoutId: 'oonishi', shapeId: 'row-staggered' },
  ]);
  const rows = page.locator('.comparison-table tbody tr[data-comparison-row="ok"]');
  const before = await rows.allInnerTexts();

  await summary.getByLabel('ローマ字規則', { exact: true }).selectOption('azik');
  await expect(summary.locator('[data-item="romajiRuleId"]')).toContainText('全体で変更');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await rows.allInnerTexts())[0]).not.toBe(before[0]);
  const after = await rows.allInnerTexts();
  expect(after[1]).toBe(before[1]);
});

test('2件とも同じ値へ上書きしても、共通の行は画面の値のまま、2件とも対象ごとの差に出る', async ({ page }) => {
  await page.addInitScript(seedSelection, {
    targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'fixed-b' }],
    overrides: { setup: { 'fixed-a': { windowSize: 2 }, 'fixed-b': { windowSize: 2 } } },
  });
  await page.goto('/standalone/comparison');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり');
  await summary.locator('.pane-condition-trigger').click();
  await expect(summary.locator('[data-item="windowSize"]')).toContainText('既定値');
  const diffs = summary.getByRole('region', { name: '対象ごとの差' });
  await expect(diffs.locator('.pane-condition-diff')).toHaveCount(2);
  await expect(diffs.locator('.pane-condition-diff').first()).toContainText('先読みN=2');
  await expect(diffs.locator('.pane-condition-diff').last()).toContainText('先読みN=2');
});

test('上書きありのSetupを1件だけ選ぶと、条件の要約の「対象ごとの差」にその条件が出る（「条件」の列が無くても条件が見える）', async ({ page }) => {
  await page.addInitScript(seedSelection, {
    targets: [{ kind: 'setup', setupId: 'fixed-a' }],
    overrides: { setup: { 'fixed-a': { windowSize: 2 } } },
  });
  await page.goto('/standalone/comparison');
  await expect(page.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり');
  await summary.locator('.pane-condition-trigger').click();
  await expect(summary.getByRole('region', { name: '対象ごとの差' })).toContainText('先読みN=2');
});

test('共有リンクで届いた解析設定と対象は、「元に戻す」1回でリンクを開く前へ戻る', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }] }),
    );
    localStorage.setItem(
      'keydist:standalone-analyzer-options',
      JSON.stringify({ version: 1, comparison: { visibleColumns: ['actions', 'totalUnits'] } }),
    );
  });
  await page.goto('/standalone/comparison?targets=layout%3Advorak&targets=layout%3Aqwerty&columns=totalUnits');
  const rows = page.locator('.comparison-table tbody tr[data-comparison-row="ok"]');
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  const firstColumn = async () => (await openSettings(page)).getByRole('checkbox', { name: '動作数', exact: true });
  await expect(await firstColumn()).not.toBeChecked();
  await page.keyboard.press('Escape');

  const undo = page.getByRole('button', { name: '元に戻す' });
  await undo.click();
  await expect(rows).toHaveCount(1);
  await expect(await firstColumn()).toBeChecked();
  await page.keyboard.press('Escape');
  // 取り込みは履歴1項目なので、これ以上戻すものは無い。
  await expect(undo).toBeDisabled();
});

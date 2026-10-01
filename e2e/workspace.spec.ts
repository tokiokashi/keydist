import { expect, test, type Locator, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspace（Analyzerを並べる器。docs/architecture.md「画面の構成」）のE2E。
 * 保存したWorkspaceを`/workspace/<id>`で開き、個別画面と同じAnalyzerのcomponentをペインとして並べる。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const STANDALONE_TEXT_KEY = 'keydist:standalone-text-selection';

/** サイドバーの「＋ 新しいWorkspace」で作って開く。開いたWorkspaceのidを返す。 */
async function createWorkspace(page: Page): Promise<string> {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1 })).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop()!;
}

/** Analyzerを追加（見出しの「Analyzerを追加」から選ぶ）。 */
async function addAnalyzer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
}

/** Workspaceの中のペイン（Analyzer名のh2で引く）。 */
function pane(page: Page, name: string): Locator {
  return page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });
}

/** 保存したWorkspaceの手持ち（decodeせず生のJSON）。 */
async function storedWorkspaces(page: Page): Promise<{ workspaces: { id: string; name: string; panes: { id: string; analyzerId: string; options?: unknown }[]; layout?: unknown; text: { ref: { kind: string; id: string } } }[] }> {
  return JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY)) ?? '{"workspaces":[]}');
}

/** 保存先へ、ペインを指定してWorkspaceを直接書く（画面を経由せず状態を作る）。 */
function seedWorkspace(page: Page, workspace: unknown): Promise<void> {
  return page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 3, workspaces: [value] }));
  }, { key: WORKSPACES_KEY, value: workspace });
}

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };

test('サイドバー: 保存したWorkspaceが無い間は案内文、作ると一覧に出て、文脈バーの左端のh1に名前が出る', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar.getByText('Analyzerを並べて見る画面。')).toBeVisible();

  const id = await createWorkspace(page);
  const bar = page.locator('.context-bar');
  await expect(bar.getByRole('heading', { level: 1, name: '新しいWorkspace', exact: true })).toBeVisible();
  // ページのh1は1つだけ（文脈バーのWorkspace名）
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(sidebar.getByText('Analyzerを並べて見る画面。')).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: '新しいWorkspace', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: '新しいWorkspace', exact: true })).toHaveAttribute('href', new RegExp(`/workspace/${id}$`));

  // 2つ目は名前が重ならない。一覧は作った順で、再読み込みしても残る
  await sidebar.getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(bar.getByRole('heading', { level: 1, name: '新しいWorkspace 2', exact: true })).toBeVisible();
  await page.reload();
  await waitForHydration(page);
  // 「＋ 新しいWorkspace」はボタン。一覧の項目はリンクで、作った順
  await expect(sidebar.getByRole('link', { name: /^新しいWorkspace/ })).toHaveText(['新しいWorkspace', '新しいWorkspace 2']);
});

test('サイドバーのリンクでWorkspaceを切り替えられる。無いidは見つからないと出る', async ({ page }) => {
  const first = await createWorkspace(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name: '新しいWorkspace 2' })).toBeVisible();

  await page.locator('#app-sidebar').getByRole('link', { name: '新しいWorkspace', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${first}$`));
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name: '新しいWorkspace', exact: true })).toBeVisible();

  await page.goto('/workspace/no-such-workspace');
  await waitForHydration(page);
  await expect(page.locator('[data-workspace-missing]').getByRole('heading', { level: 1, name: 'Workspaceが見つからない' })).toBeVisible();
});

test('名前はh1を押してその場で変えられ、Undoで戻る。Escapeは取り消し、空は確定しない', async ({ page }) => {
  await createWorkspace(page);
  const bar = page.locator('.context-bar');
  const sidebar = page.locator('#app-sidebar');

  await bar.getByRole('button', { name: '新しいWorkspace', exact: true }).click();
  const input = bar.getByRole('textbox', { name: 'Workspaceの名前' });
  await input.fill('比べる');
  await input.press('Enter');
  await expect(bar.getByRole('heading', { level: 1, name: '比べる', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: '比べる', exact: true })).toBeVisible();

  // Escapeは取り消す（続くblurで確定しない）
  await bar.getByRole('button', { name: '比べる', exact: true }).click();
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).fill('捨てる名前');
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).press('Escape');
  await expect(bar.getByRole('heading', { level: 1, name: '比べる', exact: true })).toBeVisible();

  // 空は確定しない
  await bar.getByRole('button', { name: '比べる', exact: true }).click();
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).fill('   ');
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).press('Enter');
  await expect(bar.getByRole('heading', { level: 1, name: '比べる', exact: true })).toBeVisible();

  await page.reload();
  await expect(bar.getByRole('heading', { level: 1, name: '比べる', exact: true })).toBeVisible();

  // Undoは名前の変更を戻す（画面を開き直すと履歴は空なので、変更してから戻す）
  await bar.getByRole('button', { name: '比べる', exact: true }).click();
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).fill('もう一度');
  await bar.getByRole('textbox', { name: 'Workspaceの名前' }).press('Enter');
  await expect(bar.getByRole('heading', { level: 1, name: 'もう一度', exact: true })).toBeVisible();
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(bar.getByRole('heading', { level: 1, name: '比べる', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: '比べる', exact: true })).toBeVisible();
});

test('Analyzerを追加して並べる。個別画面と同じcomponentが載り、再読み込みしても並びが戻る', async ({ page }) => {
  const id = await createWorkspace(page);
  await expect(page.locator('[data-workspace-empty]')).toContainText('Analyzerを追加');
  await page.locator('[data-workspace-empty]').getByRole('button', { name: /Analyzerを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await addAnalyzer(page, '比較表');
  await addAnalyzer(page, 'N感度');

  for (const name of ['Bigram Flow', '比較表', 'N感度']) {
    await expect(pane(page, name)).toBeVisible();
  }
  // 個別画面と同じAnalyzerのcomponent（本体の目印が同じ）が載る
  await expect(pane(page, 'Bigram Flow').locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  // ペインはh2（ページのh1は文脈バーのWorkspace名だけ）
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // 3つが同じ高さで横に並ぶ
  const boxes = await Promise.all(['Bigram Flow', '比較表', 'N感度'].map((name) => pane(page, name).boundingBox()));
  expect(boxes.every((box) => box !== null)).toBe(true);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
  expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(2);

  await expect.poll(async () => (await storedWorkspaces(page)).workspaces[0]?.panes.map((p) => p.analyzerId))
    .toEqual(['bigram-flow', 'comparison', 'n-sensitivity']);

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', '比較表', 'N感度']);
  expect(new URL(page.url()).pathname.endsWith(id)).toBe(true);
});

test('ペインの⋯: 複製・閉じる。解析設定と対象を写して右隣に並び、Undo / Redoで戻る', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, 'N感度');
  const first = pane(page, 'Bigram Flow');
  await expect(first.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  // 解析設定を変えてから複製する（複製は変えた値を写す）
  await first.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  await first.getByRole('button', { name: /の操作$/ }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/複製/, /解析設定を初期値に戻す/, /閉じる/]);
  await page.getByRole('menuitem', { name: /複製/ }).click();

  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'Bigram Flow', 'N感度']);
  const copy = page.locator('.pane-frame').nth(1);
  await copy.getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();

  // 閉じる
  await copy.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'N感度']);

  // Undoで閉じたペインが元の位置に戻り、もう一度Undoで複製が消える。Redoで進む
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'Bigram Flow', 'N感度']);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'N感度']);
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'Bigram Flow', 'N感度']);
});

test('タブの×で閉じたペインも資産から消え、最後の1つを閉じると空の表示に戻る', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, '比較表');
  await expect(page.locator('.dv-default-tab')).toHaveCount(2);

  await page.locator('.dv-default-tab').filter({ hasText: '比較表' }).getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow']);
  await expect.poll(async () => (await storedWorkspaces(page)).workspaces[0]?.panes.length).toBe(1);

  await page.locator('.dv-default-tab').getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('[data-workspace-empty]')).toBeVisible();
  await expect.poll(async () => (await storedWorkspaces(page)).workspaces[0]?.panes.length).toBe(0);
  // Undoで戻る
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow']);
});

test('ペインの解析設定はペインごとに持ち、再読み込みしても残り、初期値へ戻せる', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, 'Bigram Flow');
  const [left, right] = [page.locator('.pane-frame').nth(0), page.locator('.pane-frame').nth(1)];
  await expect(left.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(right.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  await left.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  // 間引き後に保存される。右のペインの設定は変わらない
  await expect.poll(async () => JSON.stringify((await storedWorkspaces(page)).workspaces[0]?.panes[0]?.options ?? null)).toContain('within-hand');
  expect((await storedWorkspaces(page)).workspaces[0]!.panes[1]!.options).toBeUndefined();
  // 個別画面の解析設定にも書かれない
  expect(await page.evaluate(() => localStorage.getItem('keydist:standalone-analyzer-options'))).toBeNull();

  await page.reload();
  await waitForHydration(page);
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();
  await page.locator('.pane-frame').nth(1).getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-settings-window="true"]').getByRole('button', { name: '解析設定を閉じる' }).click();

  // ⋯の「解析設定を初期値に戻す」。対象は変わらない
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ }).click();
  await page.locator('.pane-frame').nth(0).getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'false');
});

/** ペインの見出しの対象ボタン。 */
const targetButton = (pane: Locator) => pane.getByRole('button', { name: /^対象: / });
/** 見出しの対象の連動（ピン）のボタン。 */
const pinButton = (pane: Locator) => pane.locator('.pane-target-binding .pane-menu-button');

/** ピンのメニューから、固定・連動 N・新しい連動を選ぶ（項目の読み上げ名の先頭で引く）。 */
async function pickBinding(page: Page, pane: Locator, label: string): Promise<void> {
  await pinButton(pane).click();
  await page.locator(`.pane-menu-item[aria-label^="${label}"]`).click();
}

async function chooseLayout(page: Page, button: Locator, layoutId: string): Promise<void> {
  await button.click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${layoutId}"]`).click();
}

interface StoredWorkspace {
  groups: { id: string; target: { single?: { layoutId: string } } }[];
  panes: { binding: { mode: string; group?: string; target?: { target: { layoutId: string } } } }[];
}
const storedFirst = async (page: Page) => (await storedWorkspaces(page)).workspaces[0]! as unknown as StoredWorkspace;

const QWERTY_LABEL = '対象: QWERTY';
const COLEMAK_LABEL = '対象: Colemak-DH';

test('ペインの対象: 従うペイン2つと固定のペイン1つ。従うペインで対象を選ぶと従う2つだけ変わり、Undoで戻る', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, 'Bigram Flow');
  const panes = page.locator('.pane-frame');
  await expect(panes.nth(2).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  // 足したペインは最初の連動に従う。3つ目を固定にすると、押した瞬間は見た目が変わらない
  for (let n = 0; n < 3; n += 1) await expect(pinButton(panes.nth(n))).toHaveAttribute('aria-label', /^連動 1（/);
  await pickBinding(page, panes.nth(2), '固定');
  await expect(pinButton(panes.nth(2))).toHaveAttribute('aria-label', /^固定（対象: /);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);

  // 従うペインの見出しで対象を選ぶと、同じ連動の2つだけが追従する
  await chooseLayout(page, targetButton(panes.nth(0)), 'colemak-dh');
  await expect(targetButton(panes.nth(0))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);

  const stored = await storedFirst(page);
  expect(stored.groups.map((g) => g.target.single?.layoutId)).toEqual(['colemak-dh']);
  expect(stored.panes.map((p) => p.binding.mode)).toEqual(['follow', 'follow', 'fixed']);
  expect(stored.panes[2]!.binding.target!.target.layoutId).toBe('qwerty');
  // 個別画面のSingleの対象には書かない
  expect(await page.evaluate(() => localStorage.getItem('keydist:single-target-selection'))).toBeNull();

  // 元に戻すで、従う2つが戻り、固定はそのまま
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  for (let n = 0; n < 3; n += 1) await expect(targetButton(panes.nth(n))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await page.locator('.context-bar').getByRole('button', { name: 'やり直す' }).click();
  await expect(targetButton(panes.nth(0))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);

  // 再読み込みしても、従う / 固定と対象が残る
  await page.reload();
  await waitForHydration(page);
  await expect(targetButton(page.locator('.pane-frame').nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(page.locator('.pane-frame').nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await expect(pinButton(page.locator('.pane-frame').nth(2))).toHaveAttribute('aria-label', /^固定（対象: /);

  // 固定のペインを最初の連動へ戻すと、その連動の対象へ追従する
  await pickBinding(page, page.locator('.pane-frame').nth(2), '連動 1');
  await expect(targetButton(page.locator('.pane-frame').nth(2))).toHaveAttribute('aria-label', COLEMAK_LABEL);
});

/** Workspaceを作り、Bigram Flowのペインを`count`枚並べて、最後のペインの描画を待つ。 */
async function createWithBigramPanes(page: Page, count: number): Promise<Locator> {
  await createWorkspace(page);
  for (let n = 0; n < count; n += 1) await addAnalyzer(page, 'Bigram Flow');
  const panes = page.locator('.pane-frame');
  await expect(panes.nth(count - 1).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  return panes;
}

test('連動を2つ持てる: 組ごとに対象が別で、片方を変えてももう片方と固定は動かない。Undo・Redoで戻る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 4);

  // 3つ目を新しい連動へ移す（見た目は変わらない）。4つ目は固定にする
  await pickBinding(page, panes.nth(2), '新しい連動');
  await expect(pinButton(panes.nth(2))).toHaveAttribute('aria-label', /^連動 2（/);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await pickBinding(page, panes.nth(3), '固定');

  // 連動1のペインで対象を選ぶと、連動1のペインだけが変わる
  await chooseLayout(page, targetButton(panes.nth(0)), 'colemak-dh');
  await expect(targetButton(panes.nth(0))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await expect(targetButton(panes.nth(3))).toHaveAttribute('aria-label', QWERTY_LABEL);
  const stored = await storedFirst(page);
  expect(stored.groups.map((g) => g.target.single?.layoutId)).toEqual(['colemak-dh', 'qwerty']);
  expect(stored.panes.map((p) => p.binding.group ?? p.binding.mode)).toEqual([stored.groups[0]!.id, stored.groups[0]!.id, stored.groups[1]!.id, 'fixed']);

  // 元に戻す1回で、連動1の変更だけが戻る（連動の組は残る）
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  for (let n = 0; n < 4; n += 1) await expect(targetButton(panes.nth(n))).toHaveAttribute('aria-label', QWERTY_LABEL);
  expect((await storedFirst(page)).groups).toHaveLength(2);
  await page.locator('.context-bar').getByRole('button', { name: 'やり直す' }).click();
  await expect(targetButton(panes.nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
});

test('連動2のペインで対象を選ぶと連動2だけが変わり、別のペインを連動2へ移せる。再読み込みしても残る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 4);
  await pickBinding(page, panes.nth(2), '新しい連動');
  await pickBinding(page, panes.nth(3), '固定');

  await chooseLayout(page, targetButton(panes.nth(2)), 'colemak-dh');
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  for (const n of [0, 1, 3]) await expect(targetButton(panes.nth(n))).toHaveAttribute('aria-label', QWERTY_LABEL);

  // 2つ目を連動2へ移すと、連動2の対象へ追従する。連動1（1つ目）と固定は動かない
  await pickBinding(page, panes.nth(1), '連動 2');
  await expect(targetButton(panes.nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(0))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await expect(targetButton(panes.nth(3))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await page.reload();
  await waitForHydration(page);
  const reloaded = page.locator('.pane-frame');
  await expect(pinButton(reloaded.nth(1))).toHaveAttribute('aria-label', /^連動 2（/);
  await expect(pinButton(reloaded.nth(3))).toHaveAttribute('aria-label', /^固定（対象: /);
  await expect(targetButton(reloaded.nth(1))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(reloaded.nth(3))).toHaveAttribute('aria-label', QWERTY_LABEL);
});

test('誰も従わなくなった連動は消え、連動のメニューを開くと従っている項目へフォーカスが移る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 3);
  await pickBinding(page, panes.nth(2), '新しい連動');
  await expect(pinButton(panes.nth(2))).toHaveAttribute('aria-label', /^連動 2（/);
  expect((await storedFirst(page)).groups).toHaveLength(2);

  // 3つ目を連動1へ戻すと、連動2が空になって消える
  await pickBinding(page, panes.nth(2), '連動 1');
  await expect.poll(async () => (await storedFirst(page)).groups.length).toBe(1);
  await pinButton(panes.nth(0)).click();
  await expect(page.locator('.pane-menu-item')).toHaveCount(3);
  // 連動のペインでは、従っている連動の項目へフォーカスが移る
  await expect(page.locator('.pane-menu-item').nth(1)).toBeFocused();
});

test('先頭の連動が空になって消えると、残った連動が「連動 1」と名乗る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 3);
  await pickBinding(page, panes.nth(2), '新しい連動');
  await expect(pinButton(panes.nth(2))).toHaveAttribute('aria-label', /^連動 2（/);

  // 1つ目・2つ目を固定にして連動1を空にすると、残った連動は番号が詰まる
  await pickBinding(page, panes.nth(0), '固定');
  await pickBinding(page, panes.nth(1), '固定');
  await expect.poll(async () => (await storedFirst(page)).groups.length).toBe(1);
  await expect(pinButton(panes.nth(2))).toHaveAttribute('aria-label', /^連動 1（/);
});

test('先頭の連動が消えた後にメニューを開くと、項目の番号が「連動 1」から詰まる', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 3);
  await pickBinding(page, panes.nth(2), '新しい連動');
  await pickBinding(page, panes.nth(0), '固定');
  await pickBinding(page, panes.nth(1), '固定');
  await expect.poll(async () => (await storedFirst(page)).groups.length).toBe(1);

  await pinButton(panes.nth(2)).click();
  const items = page.locator('.pane-menu-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(1)).toHaveAttribute('aria-label', /^連動 1（/);
  await expect(items.nth(1).locator('.pane-binding-icon-number')).toHaveText('1');
  // 従っているペインでは、選ばれている連動の項目へフォーカスが移る
  await expect(items.nth(1)).toBeFocused();
  await expect(pinButton(panes.nth(2)).locator('.pane-binding-icon-number')).toHaveText('1');
});

test('連動のメニュー: 項目は絵と対象の要約の1行で、読み上げ名・hoverの説明があり、固定のペインでは「固定」へフォーカスが移る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 3);
  // 3つ目を新しい連動（連動2）へ移し、2つ目を固定にする。1つ目は連動1のまま
  await pickBinding(page, panes.nth(2), '新しい連動');
  await pickBinding(page, panes.nth(1), '固定');
  await chooseLayout(page, targetButton(panes.nth(0)), 'colemak-dh');
  await expect(targetButton(panes.nth(0))).toHaveAttribute('aria-label', COLEMAK_LABEL);
  await expect(targetButton(panes.nth(2))).toHaveAttribute('aria-label', QWERTY_LABEL);

  // 連動は鎖と組の番号、固定はピン。メニューの各連動には、その連動の対象の要約が出る
  await expect(pinButton(panes.nth(0)).locator('svg[data-icon="link"]')).toBeVisible();
  await expect(pinButton(panes.nth(1)).locator('svg[data-icon="pin"]')).toBeVisible();
  await pinButton(panes.nth(1)).click();
  const items = page.locator('.pane-menu-item');
  await expect(items).toHaveCount(4);
  for (const [n, name] of ['固定', '連動 1（Colemak-DH）', '連動 2（QWERTY）', '新しい連動（今の対象で作る）'].entries()) {
    await expect(items.nth(n)).toHaveAttribute('aria-label', name);
  }
  // 開いた直後は、選ばれている項目（この固定のペインでは「固定」）へフォーカスが移る
  await expect(items.nth(0)).toBeFocused();
  // 項目は絵（ピン・鎖と番号・鎖と＋）と要約の1行で、「リンク」の文字は出さない
  await expect(items.nth(1).locator('.pane-binding-icon-number')).toHaveText('1');
  await expect(items.nth(1).locator('.pane-menu-item-label')).toHaveText('Colemak-DH');
  await expect(items.nth(3).locator('svg[data-icon="link-new"]')).toBeVisible();
  await expect(items.nth(0).locator('svg[data-icon="pin"]')).toBeVisible();
  await expect(page.locator('.pane-menu-list')).not.toContainText('リンク');
  // ボタンの説明（hover）は、対象に付く条件が変わらないとは書かない
  await expect(pinButton(panes.nth(0))).toHaveAttribute('title', /同じ番号のペインと、配列・Setupが一緒に変わる/);
  await expect(pinButton(panes.nth(1))).toHaveAttribute('title', /他のペインに合わせて変わらない/);
  await page.keyboard.press('Escape');
});

test('連動を2つ持つ時、集合のペインは連動ごとに別の集合を持つ。片方を変えてももう片方と固定のペインは変わらない', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, '比較表');
  await addAnalyzer(page, '比較表');
  await addAnalyzer(page, 'N感度');
  const comparisons = pane(page, '比較表');
  const first = comparisons.nth(0);
  const second = comparisons.nth(1);
  const sensitivity = pane(page, 'N感度');
  const rows = (target: Locator) => target.locator('.comparison-table tbody tr[data-comparison-row="ok"]');
  await pickBinding(page, sensitivity, '固定');
  await expect(pinButton(sensitivity)).toHaveAttribute('aria-label', /^固定（対象: /);

  // 1つ目で集合を選ぶと、同じ連動の2つ目も同じ集合になる。固定のN感度は空のまま
  await first.getByRole('button', { name: '配列・Setupを選ぶ' }).click();
  const dialog = page.getByRole('dialog', { name: '対象の選択' });
  await dialog.locator('input[value="layout:qwerty"]').click();
  await dialog.locator('input[value="layout:colemak-dh"]').click();
  await page.keyboard.press('Escape');
  await expect(rows(first)).toHaveCount(2, { timeout: 10_000 });
  await expect(rows(second)).toHaveCount(2, { timeout: 10_000 });
  await expect(sensitivity.getByRole('button', { name: '配列・Setupを選ぶ' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('keydist:multi-target-selection'))).toBeNull();

  // メニューには、連動の集合の要約が出る
  await pinButton(first).click();
  await expect(page.locator('.pane-menu-item').nth(1)).toHaveAttribute('aria-label', '連動 1（QWERTY、Colemak-DH）');
  await page.keyboard.press('Escape');

  // 2つ目を新しい連動へ移すと、今の集合で始まる（表は変わらない）
  await pickBinding(page, second, '新しい連動');
  await expect(pinButton(second)).toHaveAttribute('aria-label', /^連動 2（/);
  await expect(rows(second)).toHaveCount(2, { timeout: 10_000 });

  // 連動2の集合だけを減らす。連動1の1つ目は2件のまま、固定のN感度も空のまま
  await targetButton(second).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:colemak-dh"]').click();
  await page.keyboard.press('Escape');
  await expect(rows(second)).toHaveCount(1, { timeout: 10_000 });
  await expect(rows(first)).toHaveCount(2);
  await expect(sensitivity.getByRole('button', { name: '配列・Setupを選ぶ' })).toBeVisible();
  const stored = await storedFirst(page) as unknown as { groups: { target: { set: { targets: unknown[] } } }[] };
  expect(stored.groups.map((g) => g.target.set.targets.length)).toEqual([2, 1]);
});

test('Workspaceを作ると、個別画面で選んでいる対象が最初の連動の対象として写る。以後は連動しない', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: 'colemak-dh' } }));
    }
  });
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await expect(targetButton(page.locator('.pane-frame').first())).toHaveAttribute('aria-label', COLEMAK_LABEL);

  // 個別画面で選び直しても、Workspaceの対象は変わらない
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await chooseLayout(page, targetButton(page.locator('.pane-frame')), 'qwerty');
  await expect(targetButton(page.locator('.pane-frame'))).toHaveAttribute('aria-label', QWERTY_LABEL);
  await page.locator('#app-sidebar').getByRole('link', { name: '新しいWorkspace', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\//);
  await expect(targetButton(page.locator('.pane-frame').first())).toHaveAttribute('aria-label', COLEMAK_LABEL);
});

test('従う集合のペインで対象を選ぶと、連動の対象が変わり、個別画面のMultiの集合は書き換えない', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, '比較表');
  const comparison = pane(page, '比較表');
  await comparison.getByRole('button', { name: '配列・Setupを選ぶ' }).click();
  const dialog = page.getByRole('dialog', { name: '対象の選択' });
  await dialog.locator('input[value="layout:qwerty"]').click();
  await dialog.locator('input[value="layout:colemak-dh"]').click();
  await page.keyboard.press('Escape');
  await expect(comparison.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
  expect(await page.evaluate(() => localStorage.getItem('keydist:multi-target-selection'))).toBeNull();

  await page.reload();
  await waitForHydration(page);
  await expect(pane(page, '比較表').locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(2, { timeout: 10_000 });
});

test('テキストはWorkspace自身が持ち、個別画面のテキストとは別。再読み込みしても残る', async ({ page }) => {
  await createWorkspace(page);
  const bar = page.locator('.context-bar');
  await expect(bar.locator('button.text-chip')).toContainText('吾輩は猫である');

  await openTextChip(page);
  await page.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  const stored = (await storedWorkspaces(page)).workspaces[0]!;
  expect(stored.text.ref.id).not.toBe('builtin:ja.legacy');
  const chosen = stored.text.ref.id;
  // 個別画面の選択は書かれない
  expect(await page.evaluate((key) => localStorage.getItem(key), STANDALONE_TEXT_KEY)).toBeNull();

  await page.reload();
  await waitForHydration(page);
  expect((await storedWorkspaces(page)).workspaces[0]!.text.ref.id).toBe(chosen);

  // 個別画面はこれまでどおり既定のテキストを使う
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.context-bar button.text-chip')).toContainText('吾輩は猫である');
});

test('ペイン間でengineのキャッシュを共有する: 同じ条件の2つ目のペインは計算をやり直さず、違う条件は計算する', async ({ page }) => {
  // 計算はWorkerの中で走る。Workerのスクリプトの先頭に差し込み、抽出の計算だけが通る関数
  // （描画は使わない）の呼び出し回数で、計算が走ったかを見る
  await page.route('**/*engine-worker*', async (route) => {
    const response = await route.fetch();
    const patch = 'self.__counter = { atan2: 0 }; { const original = Math.atan2; Math.atan2 = (y, x) => { self.__counter.atan2 += 1; return original(y, x); }; }\n';
    await route.fulfill({ response, body: patch + (await response.text()) });
  });
  const calls = async () => {
    // Workerが複数起きても（共有が崩れた時）、全部の合計で数える
    const counts = await Promise.all(
      page.workers().map((worker) => worker.evaluate(() => (self as unknown as { __counter: { atan2: number } }).__counter.atan2)),
    );
    return counts.reduce((sum, count) => sum + count, 0);
  };
  // 計算が落ち着いてから数える
  const settled = async () => {
    let previous = -1;
    await expect.poll(async () => {
      const now = await calls();
      const stable = now === previous;
      previous = now;
      return stable;
    }, { intervals: [400, 400, 400], timeout: 10_000 }).toBe(true);
    return calls();
  };

  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await expect(page.locator('.pane-frame').nth(0).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  const one = await settled();
  expect(one).toBeGreaterThan(0);

  await addAnalyzer(page, 'Bigram Flow');
  await expect(page.locator('.pane-frame').nth(1).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  expect(await settled()).toBe(one);

  await page.locator('.pane-frame').nth(1).getByRole('button', { name: /^対象: / }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:colemak-dh"]').click();
  await expect(page.locator('.pane-frame').nth(1).getByRole('button', { name: /^対象: / })).toHaveAttribute('aria-label', '対象: Colemak-DH');
  await expect.poll(settled).toBeGreaterThan(one);
});

test('1つのペインの描画が落ちても、他のペインとWorkspaceは動き続ける', async ({ page }) => {
  // Math.sin はBigram Flowの描画でしか使われない（計算は成功したまま描画だけが落ちる）
  await page.addInitScript(() => {
    const original = Math.sin;
    Math.sin = (value: number) => {
      if ((window as unknown as { __break?: boolean }).__break) throw new Error('描画の失敗を再現する');
      return original(value);
    };
  });
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, '比較表');
  const comparison = pane(page, '比較表');
  await comparison.getByRole('button', { name: '配列・Setupを選ぶ' }).click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator('input[value="layout:qwerty"]').click();
  await page.keyboard.press('Escape');
  await expect(comparison.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(pane(page, 'Bigram Flow').locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => { (window as unknown as { __break: boolean }).__break = true; });
  // 既定の物理配列を変えて、Bigram Flowを描き直させる
  await page.getByLabel('既定の物理配列').selectOption('ortholinear');
  await expect(pane(page, 'Bigram Flow').locator('[data-pane-crashed]')).toBeVisible({ timeout: 10_000 });

  // 落ちたのはそのペインの本体だけ。見出しは残り、他のペインは動き、Workspaceの操作もできる
  await expect(pane(page, 'Bigram Flow').getByRole('heading', { level: 2, name: 'Bigram Flow' })).toBeVisible();
  await expect(comparison.locator('.comparison-table tbody tr[data-comparison-row="ok"]')).toHaveCount(1);
  await expect(comparison.locator('[data-pane-crashed]')).toHaveCount(0);
  await addAnalyzer(page, 'N感度');
  await expect(pane(page, 'N感度')).toBeVisible();
});

test('使えないAnalyzerのペインは使えないと出て、閉じられる。他のペインは動く', async ({ page }) => {
  await seedWorkspace(page, {
    id: 'seeded',
    name: '読み込みの確認',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: [
      { id: 'p-good', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } },
      { id: 'p-unknown', analyzerId: 'future-analyzer', options: { z: 1 }, binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [] } } } },
      { id: 'p-mismatch', analyzerId: 'comparison', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } },
    ],
    layout: {
      kind: 'split', direction: 'row', weight: 1,
      children: [
        { kind: 'group', paneIds: ['p-good'], weight: 1 },
        { kind: 'group', paneIds: ['p-unknown'], weight: 1 },
        { kind: 'group', paneIds: ['p-mismatch'], weight: 1 },
      ],
    },
  });
  await page.goto('/workspace/seeded');
  await waitForHydration(page);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name: '読み込みの確認' })).toBeVisible();

  await expect(pane(page, 'Bigram Flow').locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  const notices = page.locator('[data-workspace-pane-notice]');
  await expect(notices).toHaveCount(2);
  await expect(notices.first()).toContainText('このAnalyzerは使えない');

  await notices.first().getByRole('button', { name: '閉じる' }).click();
  await expect(notices).toHaveCount(1);
  await notices.first().getByRole('button', { name: '閉じる' }).click();
  await expect(notices).toHaveCount(0);
  await expect(pane(page, 'Bigram Flow')).toBeVisible();
  // 知らないAnalyzerのペインを閉じるまでは、保存した値を失わない
  await expect.poll(async () => (await storedWorkspaces(page)).workspaces[0]?.panes.map((p) => p.id)).toEqual(['p-good']);
});

test('壊れた保存データでも画面は開き、壊れた部分だけが落ちる', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 3,
      workspaces: [
        { id: 'w', name: '一部が壊れている', panes: [
          { id: 'ok', analyzerId: 'bigram-flow', binding: { mode: 'follow' } },
          { id: 'broken', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'nonsense' } } },
        ], layout: { kind: 'split', direction: 'sideways', children: 3 } },
      ],
    }));
  }, { key: WORKSPACES_KEY });
  await page.goto('/workspace/w');
  await waitForHydration(page);
  await expect(page.locator('.context-bar').getByRole('heading', { level: 1, name: '一部が壊れている' })).toBeVisible();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow']);
});

test('並びの変更（境界のドラッグ）は保存され、Undo / Redoで戻り、再読み込みしても残る', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await createWorkspace(page);
  await addAnalyzer(page, 'N感度');
  await addAnalyzer(page, '比較表');
  await expect(page.locator('.pane-frame').nth(1)).toBeVisible();
  const ratio = async () => (await page.locator('.pane-frame').nth(0).boundingBox())!.width / (await page.locator('.pane-frame').nth(1).boundingBox())!.width;
  const storedRatio = async () => {
    const layout = (await storedWorkspaces(page)).workspaces[0]!.layout as { children?: { weight: number }[] };
    const [a, b] = layout.children?.map((child) => child.weight) ?? [1, 1];
    return a! / b!;
  };
  expect(await ratio()).toBeGreaterThan(0.9);
  expect(await ratio()).toBeLessThan(1.1);

  const sash = page.locator('.dv-sash').first();
  const box = (await sash.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 250, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(ratio).toBeLessThan(0.7);
  await expect.poll(storedRatio).toBeLessThan(0.7);

  // Undoで並びが戻り、Redoで進む
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(ratio).toBeGreaterThan(0.9);
  await expect.poll(storedRatio).toBeGreaterThan(0.9);
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(ratio).toBeLessThan(0.7);
  await expect.poll(storedRatio).toBeLessThan(0.7);

  await page.reload();
  await waitForHydration(page);
  await expect.poll(ratio).toBeLessThan(0.7);
});

test('ペインを足しても、既にあるペインは作り直されない（開いている解析設定の小窓が残る）', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  const first = pane(page, 'Bigram Flow');
  await expect(first.locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await first.getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]')).toBeVisible();

  await addAnalyzer(page, 'N感度');
  await expect(pane(page, 'N感度')).toBeVisible();
  await expect(page.locator('[data-settings-window="true"]')).toBeVisible();
  await expect(first.getByRole('button', { name: '解析設定', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

test('境界のドラッグの途中で止まっても1回の操作として書き、Undo 1回で元へ戻る', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await createWorkspace(page);
  await addAnalyzer(page, 'N感度');
  await addAnalyzer(page, '比較表');
  const ratio = async () => (await page.locator('.pane-frame').nth(0).boundingBox())!.width / (await page.locator('.pane-frame').nth(1).boundingBox())!.width;
  await expect(page.locator('.pane-frame').nth(1)).toBeVisible();
  expect(await ratio()).toBeGreaterThan(0.9);

  const box = (await page.locator('.dv-sash').first().boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, y, { steps: 4 });
  // 押したまま間引きの待ち時間より長く止まる
  await page.waitForTimeout(700);
  await page.mouse.move(box.x + box.width / 2 - 260, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(ratio).toBeLessThan(0.65);
  await expect.poll(async () => {
    const layout = (await storedWorkspaces(page)).workspaces[0]!.layout as { children: { weight: number }[] };
    return layout.children[0]!.weight / layout.children[1]!.weight;
  }).toBeLessThan(0.65);

  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(ratio).toBeGreaterThan(0.9);
});

test('ドラッグの直後（書く前）にUndoしても、そのドラッグが先に書かれて戻る（直前のペインの追加は残る）', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await createWorkspace(page);
  await addAnalyzer(page, 'N感度');
  await addAnalyzer(page, '比較表');
  const ratio = async () => (await page.locator('.pane-frame').nth(0).boundingBox())!.width / (await page.locator('.pane-frame').nth(1).boundingBox())!.width;
  await expect(page.locator('.pane-frame').nth(1)).toBeVisible();
  expect(await ratio()).toBeGreaterThan(0.9);

  const box = (await page.locator('.dv-sash').first().boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 250, y, { steps: 4 });
  await page.mouse.up();
  // 間引きの待ち（250ms）が終わる前に押す
  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();

  await expect.poll(ratio).toBeGreaterThan(0.9);
  await expect(page.locator('.pane-frame')).toHaveCount(2);
  await page.waitForTimeout(600);
  expect(await ratio()).toBeGreaterThan(0.9);
  await expect(page.locator('.pane-frame')).toHaveCount(2);
});

test('窓の大きさを変えても、並びは書き換わらない（狭い窓でペインの最小幅に押された比を保存しない）', async ({ page }) => {
  const set = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: { mode: 'follow' } });
  await seedWorkspace(page, {
    id: 'resize',
    name: '大きさの確認',
    panes: [set('a'), set('b'), set('c')],
    // 両端が細い並び。窓を狭めると両端が最小幅で止まり、真ん中が縮んで比が変わる
    layout: {
      kind: 'split', direction: 'row', weight: 1,
      children: [
        { kind: 'group', paneIds: ['a'], weight: 1 },
        { kind: 'group', paneIds: ['b'], weight: 8 },
        { kind: 'group', paneIds: ['c'], weight: 1 },
      ],
    },
  });
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/workspace/resize');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveCount(3);
  const widths = () => page.$$eval('.pane-frame', (elements) => elements.map((element) => Math.round(element.getBoundingClientRect().width)));
  const wide = await widths();
  const layoutBefore = JSON.stringify((await storedWorkspaces(page)).workspaces[0]!.layout);

  await page.setViewportSize({ width: 900, height: 900 });
  // 狭い窓では両端が最小幅で止まり、比が変わる（変わらなければこの確認は意味を持たない）
  await expect.poll(async () => {
    const [first, middle] = await widths();
    return first! / (first! + middle!);
  }).toBeGreaterThan(0.12);
  await page.waitForTimeout(900);
  expect(JSON.stringify((await storedWorkspaces(page)).workspaces[0]!.layout)).toBe(layoutBefore);

  // 広い窓へ戻れば、保存した比のまま並ぶ
  await page.setViewportSize({ width: 1500, height: 900 });
  await expect.poll(async () => (await widths()).every((width, index) => Math.abs(width - wide[index]!) < 6)).toBe(true);
  expect(JSON.stringify((await storedWorkspaces(page)).workspaces[0]!.layout)).toBe(layoutBefore);
});

test('タブの表現は見比べられる: 既定はタブを出し、?tabs=hideでタブの帯を出さない', async ({ page }) => {
  const id = await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await expect(page.locator('.dv-tabs-and-actions-container').first()).toBeVisible();
  await page.goto(`/workspace/${id}?tabs=hide`);
  await waitForHydration(page);
  await expect(pane(page, 'Bigram Flow')).toBeVisible();
  await expect(page.locator('.dv-tabs-and-actions-container').first()).toBeHidden();
});

test('Workspaceの画面の文言に開発の内部が出ない', async ({ page }) => {
  await createWorkspace(page);
  await addAnalyzer(page, 'Bigram Flow');
  await expect(pane(page, 'Bigram Flow').locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('Workspace | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|Dockview|dockview|standalone|単体ページ|個別画面|ペイン/);
  await expect(page.locator('body')).not.toContainText(/#\d{3}|Phase|Dockview|dockview|standalone|単体ページ|個別画面|\.ts\b|Close tab/);
  // 英語の既定の文言（読み上げ用を含む）が残っていない
  await expect(page.locator('[aria-label="Close tab"]')).toHaveCount(0);
});

test('Workspaceの文脈バーに共有ボタンは無く、個別画面には有る', async ({ page }) => {
  await createWorkspace(page);
  const share = page.locator('.context-bar').getByRole('button', { name: '共有', exact: true });
  // 元に戻すは出ている（バーは描かれた上で、共有だけが無い）
  await expect(page.locator('.context-bar').getByRole('button', { name: '元に戻す' })).toBeVisible();
  await expect(share).toHaveCount(0);

  // 見つからないWorkspaceのバーにも出さない
  await page.goto('/workspace/no-such-workspace');
  await waitForHydration(page);
  await expect(page.locator('[data-workspace-missing="true"]')).toBeVisible();
  await expect(share).toHaveCount(0);

  // 個別画面はURLで対象を運べるので、共有が残る
  await page.goto('/standalone/comparison');
  await waitForHydration(page);
  await expect(share).toBeVisible();
});

const SETUP_LIBRARY_KEY = 'keydist:setup-library';

/** 全体の条件の保存内容（`setupLibrary.overrides.global`。decodeせず生のJSON）。無ければ空。 */
async function storedGlobalOverrides(page: Page): Promise<Record<string, unknown>> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), SETUP_LIBRARY_KEY);
  if (raw === null) return {};
  return (JSON.parse(raw) as { overrides?: { global?: Record<string, unknown> } }).overrides?.global ?? {};
}

/** ペインの条件の要約を押して、条件のモーダルを開いて返す。 */
async function openPaneConditionModal(page: Page, paneLocator: Locator): Promise<Locator> {
  await paneLocator.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

test('Workspaceのペインの条件のモーダルで全体の条件を変えると、全体の保存先に書かれ、個別画面にも反映される', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 1);
  // 見出しの1行には chip で出す（変えた項目の中身はhoverの説明とモーダルが出す）
  await expect(panes.first().locator('.pane-condition-trigger')).toHaveText('条件: 既定値');

  const modal = await openPaneConditionModal(page, panes.first());
  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  await expect(modal.locator('[data-item="windowSize"]')).toContainText('全体で変更');
  await page.keyboard.press('Escape');
  await expect(panes.first().locator('.pane-condition-trigger')).toHaveText('条件: 1件変更');
  await expect(panes.first().locator('.pane-condition-trigger')).toHaveAttribute('title', /先読みN: 4/);

  // 書き込み先は全体の値。Workspaceは条件を別に持たない
  await expect.poll(async () => (await storedGlobalOverrides(page)).windowSize).toBe(4);
  expect(JSON.stringify(await storedWorkspaces(page))).not.toContain('windowSize');

  // 個別画面を開き直すと、同じ全体の値が反映されている
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await expect(page.locator('.pane-condition-trigger')).toContainText('先読みN: 4');
  const standaloneModal = await openPaneConditionModal(page, page.locator('.pane-frame'));
  await expect(standaloneModal.locator('[data-item="windowSize"]').locator('output[aria-label="先読みN"]')).toHaveText('4');
});

test('Workspaceのペインの条件のモーダルでもプリセットを保存・流し込みでき、元に戻すで戻る', async ({ page }) => {
  const panes = await createWithBigramPanes(page, 1);
  const modal = await openPaneConditionModal(page, panes.first());
  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  const section = modal.locator('[data-condition-presets]');
  await section.locator('summary').click();
  await section.getByLabel('プリセットの名前').fill('厳しめ');
  await section.getByRole('button', { name: '今の全体の値を保存' }).click();
  await modal.getByRole('button', { name: 'すべて既定値に戻す' }).click();
  await section.getByRole('button', { name: '「厳しめ」の値を流し込む' }).click();
  await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('4');
  await section.getByRole('button', { name: '元に戻す' }).click();
  await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('3');
  await expect.poll(async () => (await storedGlobalOverrides(page)).windowSize).toBeUndefined();
});

test('Workspaceで変えた全体の条件はWorkspaceの元に戻すで戻り、その結果が個別画面にも効く。元に戻すの履歴は画面ごと', async ({ page, context }) => {
  const panes = await createWithBigramPanes(page, 1);
  const trigger = panes.first().locator('.pane-condition-trigger');
  const modal = await openPaneConditionModal(page, panes.first());
  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveText('条件: 1件変更');
  await expect.poll(async () => (await storedGlobalOverrides(page)).windowSize).toBe(4);

  // 別のタブで開いた個別画面は変更を反映していて、その画面の履歴は空（Workspaceの操作は戻せない）
  const other = await context.newPage();
  await other.goto('/standalone/bigram-flow');
  await expect(other.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await expect(other.locator('.pane-condition-trigger')).toContainText('先読みN: 4');
  await expect(other.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  // Workspaceの元に戻すで、全体の条件が既定へ戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(trigger).toHaveText('条件: 既定値');
  await expect.poll(async () => (await storedGlobalOverrides(page)).windowSize).toBeUndefined();

  // 個別画面を開き直すと、戻った結果が効いている
  await other.reload();
  await expect(other.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await expect(other.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');
  await other.close();
});

test('Bigram Flowを配列違いで並べても、Keyboard Flowの線は自分のペインの色で塗られる', async ({ page }) => {
  const fixed = (id: string, layoutId: string) => ({
    id, analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId } } },
  });
  await seedWorkspace(page, {
    id: 'flow-gradient',
    name: '色の確認',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    panes: [fixed('a', 'qwerty'), fixed('b', 'dvorak')],
    layout: {
      kind: 'split', direction: 'row', weight: 1,
      children: [{ kind: 'group', paneIds: ['a'], weight: 1 }, { kind: 'group', paneIds: ['b'], weight: 1 }],
    },
  });
  await page.goto('/workspace/flow-gradient');
  await waitForHydration(page);
  const flows = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flows.nth(1)).toBeVisible({ timeout: 10_000 });
  await expect(flows.nth(1).locator('[data-flow-edge="true"]').first()).toBeAttached();

  // 線が参照する塗りは、同じ図（SVG）の中の定義でなければならない。idが図をまたいで重なると、
  // 後ろの図の線が先頭の図の色・座標で塗られる
  const foreign = await flows.evaluateAll((roots) => roots.map((root) => {
    const svg = root.querySelector('svg.flow-keyboard-svg')!;
    let total = 0;
    let outside = 0;
    for (const edge of svg.querySelectorAll('[data-flow-edge="true"]')) {
      const id = /url\(#(.+)\)/.exec(edge.getAttribute('stroke') ?? '')?.[1];
      if (id === undefined) continue;
      total += 1;
      if (document.getElementById(id)?.closest('svg') !== svg) outside += 1;
    }
    return { total, outside };
  }));
  expect(foreign.map((f) => f.total > 0)).toEqual([true, true]);
  expect(foreign.map((f) => f.outside)).toEqual([0, 0]);
});

/** 見出しの⋯からWorkspaceの操作（複製・削除）を選ぶ。 */
async function workspaceMenu(page: Page, item: '複製' | '削除'): Promise<void> {
  await page.locator('.context-bar').getByRole('button', { name: 'Workspaceの操作' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

function currentId(page: Page): string {
  return new URL(page.url()).pathname.split('/').pop()!;
}

test('Workspaceを複製すると、ペイン・解析設定を写した別のWorkspaceが開き、再読み込みしても残る', async ({ page }) => {
  const sourceId = await createWorkspace(page);
  const bar = page.locator('.context-bar');
  const sidebar = page.locator('#app-sidebar');
  await addAnalyzer(page, 'Bigram Flow');
  await addAnalyzer(page, 'N感度');
  const first = pane(page, 'Bigram Flow');
  await first.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();

  // ⋯の一覧は画面の左端で切れない
  await bar.getByRole('button', { name: 'Workspaceの操作' }).click();
  expect((await page.getByRole('menuitem', { name: '複製', exact: true }).boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');

  await workspaceMenu(page, '複製');
  await expect(bar.getByRole('heading', { level: 1, name: '新しいWorkspace のコピー', exact: true })).toBeVisible();
  const copyId = currentId(page);
  expect(copyId).not.toBe(sourceId);
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'N感度']);
  await pane(page, 'Bigram Flow').getByRole('button', { name: '解析設定', exact: true }).click();
  await expect(page.locator('[data-settings-window="true"]').getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');

  // 一覧では元の右隣に並び、元も残っている
  await expect(sidebar.getByRole('link', { name: /^新しいWorkspace/ })).toHaveText(['新しいWorkspace', '新しいWorkspace のコピー']);

  await page.reload();
  await expect(bar.getByRole('heading', { level: 1, name: '新しいWorkspace のコピー', exact: true })).toBeVisible();
  const stored = await storedWorkspaces(page);
  expect(stored.workspaces.map((workspace) => workspace.id)).toEqual([sourceId, copyId]);
  expect(stored.workspaces[1]!.panes.map((p) => p.analyzerId)).toEqual(stored.workspaces[0]!.panes.map((p) => p.analyzerId));
  // 元は複製で変わらない
  await page.goto(`/workspace/${sourceId}`);
  await expect(bar.getByRole('heading', { level: 1, name: '新しいWorkspace', exact: true })).toBeVisible();
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', 'N感度']);
});

test('Workspaceを削除すると次のWorkspaceへ移り、元に戻すで元の位置に戻る。再読み込みしても削除は残る', async ({ page }) => {
  const firstId = await createWorkspace(page);
  await workspaceMenu(page, '複製');
  const secondId = currentId(page);
  await workspaceMenu(page, '複製');
  const thirdId = currentId(page);
  const bar = page.locator('.context-bar');
  const sidebar = page.locator('#app-sidebar');
  const notice = page.locator('[data-deleted-workspace-notice="true"]');
  // 複製は、複製した元の右隣に入る（開いていた順に並ぶ）
  expect((await storedWorkspaces(page)).workspaces.map((w) => w.id)).toEqual([firstId, secondId, thirdId]);

  // 真ん中を開いて削除すると、一覧で次のWorkspaceへ移る
  await sidebar.getByRole('link', { name: '新しいWorkspace のコピー', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${secondId}$`));
  await workspaceMenu(page, '削除');
  await expect(page).toHaveURL(new RegExp(`/workspace/${thirdId}$`));
  await expect(bar.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice).toContainText('を削除した');
  expect((await storedWorkspaces(page)).workspaces.map((w) => w.id)).toEqual([firstId, thirdId]);

  // 元に戻すと、元の位置へ戻ってそのWorkspaceが開く
  await notice.getByRole('button', { name: '元に戻す' }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${secondId}$`));
  await expect(notice).toHaveCount(0);
  expect((await storedWorkspaces(page)).workspaces.map((w) => w.id)).toEqual([firstId, secondId, thirdId]);

  // もう一度削除して再読み込みしても、削除は残る。知らせは再読み込みで消える
  await workspaceMenu(page, '削除');
  await page.reload();
  await expect(notice).toHaveCount(0);
  expect((await storedWorkspaces(page)).workspaces.map((w) => w.id)).toEqual([firstId, thirdId]);
  await expect(sidebar.getByRole('link', { name: /^新しいWorkspace/ })).toHaveCount(2);
});

test('末尾のWorkspaceを削除すると1つ前へ、最後の1つを削除するとトップへ移る。戻すとそのWorkspaceを開く', async ({ page }) => {
  const firstId = await createWorkspace(page);
  await workspaceMenu(page, '複製');
  const sidebar = page.locator('#app-sidebar');
  const notice = page.locator('[data-deleted-workspace-notice="true"]');

  await workspaceMenu(page, '削除');
  await expect(page).toHaveURL(new RegExp(`/workspace/${firstId}$`));

  await workspaceMenu(page, '削除');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-workspace-missing="true"]')).toHaveCount(0);
  await expect(sidebar.getByText('Analyzerを並べて見る画面。')).toBeVisible();
  expect((await storedWorkspaces(page)).workspaces).toEqual([]);

  await notice.getByRole('button', { name: '元に戻す' }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${firstId}$`));
  expect((await storedWorkspaces(page)).workspaces.map((w) => w.id)).toEqual([firstId]);
});

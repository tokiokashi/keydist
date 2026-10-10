import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * キーの詳細。キーにカーソルを乗せると要点（ツールチップ）、押すと小窓で全件が読める。
 * 集計の値と並びはunit test（`key-detail-view.test.ts`・`key-selection.test.ts`）で固定しているので、
 * ここでは画面の配線（ツールチップ・小窓の開閉・選択の連動）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const heatmapKey = (scope: Locator, diagram: string, keyId: string) =>
  scope.locator(`[data-heatmap-diagram="${diagram}"] [data-heatmap-key="${keyId}"]`);
const flowKey = (scope: Locator, keyId: string) => scope.locator(`.flow-key[data-key-id="${keyId}"]`);
const detailWindow = (page: Page) => page.locator('[data-key-detail-window]');

/** 小窓を見出しでつかんで、図に重ならない所（画面の右下）へ動かす。 */
async function moveWindowAway(page: Page, win: Locator): Promise<void> {
  const box = (await win.locator('.settings-window-handle').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1000, 900, { steps: 5 });
  await page.mouse.up();
}
const tooltipOf = async (key: Locator) => (await key.locator('title').first().textContent()) ?? '';

test('ヒートマップ: ツールチップは押下数・押し方・前の文字を出し、統合とレイヤー別で同じキーは同じ値になる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap-integrated');
  const feature = page.locator('[data-react-feature="heatmap-integrated"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });

  const integrated = await tooltipOf(heatmapKey(feature, 'integrated', 'e'));
  const lines = integrated.split('\n');
  expect(lines[0]).toMatch(/^E: \d+打$/);
  expect(lines[1]).toMatch(/^押し方: 出力 \d+打$/);
  expect(lines[2]).toMatch(/^前の文字: .+ \d+打/);
  // 押していないキーは名前と0打だけ
  expect(await tooltipOf(heatmapKey(feature, 'integrated', '1'))).toBe('1: 0打');

  // 層が1つの配列では、レイヤー別の図が表す面は統合図と同じ
  await page.goto('/standalone/heatmap-layers');
  const layers = page.locator('[data-react-feature="heatmap-layers"]');
  await expect(layers).toBeVisible({ timeout: 10_000 });
  expect(await tooltipOf(heatmapKey(layers, 'single', 'e'))).toBe(integrated);
});

test('ヒートマップ: キーを押すと小窓が開き、図で同じキーが選ばれる。Escapeと押し直しで外れる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/heatmap-integrated');
  const feature = page.locator('[data-react-feature="heatmap-integrated"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });

  await expect(detailWindow(page)).toHaveCount(0);
  await heatmapKey(feature, 'integrated', 'e').click();
  const win = detailWindow(page);
  await expect(win).toBeVisible();
  await expect(win).toBeFocused();
  await expect(win.getByRole('heading', { name: 'E', level: 4 })).toBeVisible();
  await expect(win.getByRole('heading', { name: '押し方', level: 5 })).toBeVisible();
  await expect(win.getByRole('heading', { name: '前の文字', level: 5 })).toBeVisible();
  await expect(win.getByRole('heading', { name: '移動の起点', level: 5 })).toBeVisible();
  await expect(win.getByRole('heading', { name: '距離の分布', level: 5 })).toBeVisible();
  // 入力パターンとトリガーのガイド: QWERTYのeは単打の面とShiftの面に出る
  await expect(win.getByRole('heading', { name: '入力方法', level: 5 })).toBeVisible();
  await expect(win.locator('[data-pattern-face="single"]')).toContainText(/E\s*→\s*e/);
  await expect(win.locator('[data-pattern-face="layer:Shift"]')).toContainText('トリガー: 左Shift（押したまま） / 右Shift（押したまま）');
  await expect(heatmapKey(feature, 'integrated', 'e')).toHaveAttribute('data-key-selected', 'true');
  await expect(feature.locator('[data-key-selected]')).toHaveCount(1);

  // 別のキーを押すと、小窓と強調が移る
  await heatmapKey(feature, 'integrated', 'r').click();
  await expect(win.getByRole('heading', { name: 'R', level: 4 })).toBeVisible();
  await expect(feature.locator('[data-key-selected]')).toHaveCount(1);
  await expect(heatmapKey(feature, 'integrated', 'r')).toHaveAttribute('data-key-selected', 'true');

  // Escapeで外れる
  await page.keyboard.press('Escape');
  await expect(win).toHaveCount(0);
  await expect(feature.locator('[data-key-selected]')).toHaveCount(0);

  // 同じキーをもう1度押すと外れる
  await heatmapKey(feature, 'integrated', 'e').click();
  await expect(win).toBeVisible();
  await heatmapKey(feature, 'integrated', 'e').click();
  await expect(win).toHaveCount(0);
  await expect(feature.locator('[data-key-selected]')).toHaveCount(0);

  // 小窓の閉じるボタンでも外れる
  await heatmapKey(feature, 'integrated', 'e').click();
  await win.getByRole('button', { name: 'キーの詳細を閉じる' }).click();
  await expect(win).toHaveCount(0);
  await expect(feature.locator('[data-key-selected]')).toHaveCount(0);
});

test('レイヤー別ヒートマップ: キーを押すと小窓が開き、全部のレイヤーの図で同じキーが選ばれる', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-layers');
  const feature = page.locator('[data-react-feature="heatmap-layers"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });

  await heatmapKey(feature, 'single', 'd').click();
  await expect(detailWindow(page)).toBeVisible();
  await expect(feature.locator('[data-heatmap-key="d"][data-key-selected="true"]')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(detailWindow(page)).toHaveCount(0);
  await expect(feature.locator('[data-key-selected]')).toHaveCount(0);
});

test('ヒートマップ: レイヤーごとの内訳を開くと、そのレイヤーだけの値が読める', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-layers');
  const feature = page.locator('[data-react-feature="heatmap-layers"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });

  await heatmapKey(feature, 'single', 'd').click();
  const win = detailWindow(page);
  await expect(win).toBeVisible();
  // dは単打の面（出力）と中指シフトの面（トリガー）に出る
  const faces = win.locator('.key-detail-faces li');
  await expect(faces.filter({ hasText: '単打' })).toHaveCount(1);
  await expect(faces.filter({ hasText: '中指シフト' })).toHaveCount(1);
  // トリガーのガイド: dは中指シフトのトリガーに使われる
  await expect(win.locator('[data-pattern-face="layer:中指シフト"]')).toContainText('このキーはトリガーに使われます');
  await expect(win.locator('[data-pattern-face="single"]')).not.toContainText('トリガー:');
  // 中指シフトの内訳を開くと、そのレイヤーの押し方（トリガー）だけが並ぶ
  await faces.filter({ hasText: '中指シフト' }).locator('summary').click();
  await expect(faces.filter({ hasText: '中指シフト' }).locator('tbody tr').first()).toContainText('トリガー');
  // レイヤー別の図のツールチップは、そのレイヤーの値
  const shiftTip = await tooltipOf(heatmapKey(feature, 'layer:中指シフト', 'd'));
  expect(shiftTip).toMatch(/\（D\）: \d+打\n押し方: 出力 \d+打・トリガー \d+打|\（D\）: \d+打\n押し方: トリガー \d+打・出力 \d+打/);
  // 統合ヒートマップは、単打の面とシフトの面を合算した値（シフトの面だけの値より大きい）
  const total = (tip: string) => Number(/: (\d+)打/.exec(tip)![1]);
  await page.goto('/standalone/heatmap-integrated');
  const integrated = page.locator('[data-react-feature="heatmap-integrated"]');
  await expect(integrated).toBeVisible({ timeout: 10_000 });
  const mergedTip = await tooltipOf(heatmapKey(integrated, 'integrated', 'd'));
  expect(total(mergedTip)).toBeGreaterThan(total(shiftTip));
});

test('Bigram Flow: ツールチップを足しても、キーに乗せた時の線の強調は残り、キーを押すと小窓が開く', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/bigram-flow');
  const feature = page.locator('[data-react-feature="bigram-flow"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });

  const key = flowKey(feature, 'e');
  const tip = await tooltipOf(key);
  expect(tip.split('\n')[0]).toMatch(/^E: \d+打$/);
  // 乗せた時の強調と「このキーから出る打鍵」は従来どおり
  await key.hover({ force: true });
  await expect(key).toHaveAttribute('data-hovered', 'true');
  await expect(feature.locator('.flow-coverage')).toContainText('このキーから出る打鍵');

  await key.click({ force: true });
  const win = detailWindow(page);
  await expect(win).toBeVisible();
  await expect(win.getByRole('heading', { name: 'E', level: 4 })).toBeVisible();
  await expect(win.locator('[data-pattern-face="single"]')).toContainText(/E\s*→\s*e/);
  await expect(key).toHaveAttribute('data-key-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(win).toHaveCount(0);
  await expect(key).not.toHaveAttribute('data-key-selected', 'true');
});

const WORKSPACES_KEY = 'keydist:workspaces';
const fixed = (id: string, analyzerId: string, layoutId: string) => ({
  id,
  analyzerId,
  binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId } } },
});

async function openWorkspace(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 4, workspaces: [value] }));
  }, {
    key: WORKSPACES_KEY,
    value: {
      id: 'k',
      name: 'キー',
      text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
      // a: 統合ヒートマップ(QWERTY) / b: Bigram Flow(QWERTY) / c: 統合ヒートマップ(Dvorak) / d: レイヤー別ヒートマップ(QWERTY)。
      // a・b・dは配列と物理配列が同じ
      panes: [
        fixed('a', 'heatmap-integrated', 'qwerty'),
        fixed('b', 'bigram-flow', 'qwerty'),
        fixed('c', 'heatmap-integrated', 'dvorak'),
        fixed('d', 'heatmap-layers', 'qwerty'),
      ],
      grid: [
        { id: 'a', x: 0, y: 0, w: 12, h: 18 },
        { id: 'b', x: 12, y: 0, w: 12, h: 18 },
        { id: 'c', x: 0, y: 18, w: 12, h: 18 },
        { id: 'd', x: 12, y: 18, w: 12, h: 18 },
      ],
      groups: [{ id: 'g1', target: { single: { kind: 'layout', layoutId: 'qwerty' } } }],
    },
  });
  await page.goto('/workspace/k');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(4, { timeout: 20_000 });
}

const pane = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);

test('Workspace: 配列と物理配列が同じペインどうしでは選択が連動し、違うペインには届かない', async ({ page }) => {
  await openWorkspace(page);
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const c = pane(page, 'c');
  const d = pane(page, 'd');

  // 同じ対象のAnalyzerが違うペインでも、同じキーのツールチップは同じ値になる
  expect(await tooltipOf(heatmapKey(a, 'integrated', 'e'))).toBe(await tooltipOf(flowKey(b, 'e')));

  // aで押す: aに小窓が開き、bのキーも選ばれる。違う配列のcは変わらない
  await heatmapKey(a, 'integrated', 'e').click();
  await expect(detailWindow(page)).toHaveCount(1);
  await moveWindowAway(page, detailWindow(page));
  // Workspaceでは、どのペインの小窓か分かるようペインの名前を出す
  await expect(detailWindow(page)).toContainText('統合ヒートマップ');
  await expect(flowKey(b, 'e')).toHaveAttribute('data-key-selected', 'true');
  // 別のAnalyzer（レイヤー別ヒートマップ）のペインでも、同じ対象なら選ばれる
  await expect(heatmapKey(d, 'single', 'e')).toHaveAttribute('data-key-selected', 'true');
  await expect(c.locator('[data-key-selected]')).toHaveCount(0);

  // cで別のキーを選ぶと、cだけが選ばれ、a・bの選択は変わらない（小窓はそれぞれのペインで開く）
  await heatmapKey(c, 'integrated', 'e').click();
  await expect(detailWindow(page)).toHaveCount(2);
  await expect(heatmapKey(c, 'integrated', 'e')).toHaveAttribute('data-key-selected', 'true');
  await expect(flowKey(b, 'e')).toHaveAttribute('data-key-selected', 'true');
  await heatmapKey(c, 'integrated', 'e').click();
  await expect(detailWindow(page)).toHaveCount(1);
  await expect(c.locator('[data-key-selected]')).toHaveCount(0);
  await expect(flowKey(b, 'e')).toHaveAttribute('data-key-selected', 'true');

  // bでも同じキーを押すと、bの小窓も開く（選択は変わらない）。bで押し直すと、a・bの選択と小窓が全部外れる
  await flowKey(b, 'e').click({ force: true });
  await expect(detailWindow(page)).toHaveCount(2);
  await flowKey(b, 'e').click({ force: true });
  await expect(detailWindow(page)).toHaveCount(0);
  await expect(a.locator('[data-key-selected]')).toHaveCount(0);
  await expect(b.locator('[data-key-selected]')).toHaveCount(0);
});

test('Workspace: ペインを拡大すると他のペインの小窓は閉じ、選択は残る', async ({ page }) => {
  await openWorkspace(page);
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  await heatmapKey(a, 'integrated', 'e').click();
  await expect(detailWindow(page)).toHaveCount(1);

  await b.locator('.pane-menu-button[aria-label$="の操作"]').click();
  await page.getByRole('menuitem', { name: '拡大表示' }).click();
  await expect(b).toHaveAttribute('data-maximized', 'true');
  await expect(detailWindow(page)).toHaveCount(0);
  await expect(flowKey(b, 'e')).toHaveAttribute('data-key-selected', 'true');
});

test('小窓を閉じると、フォーカスは押したキーへ戻る（Escapeでも、閉じるボタンでも）', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/standalone/heatmap-integrated');
  const feature = page.locator('[data-react-feature="heatmap-integrated"]');
  await expect(feature).toBeVisible({ timeout: 10_000 });
  const key = heatmapKey(feature, 'integrated', 'd');
  const win = detailWindow(page);

  // キーボード: フォーカスしてEnterで開き、小窓の中のEscapeで閉じる
  await key.focus();
  await page.keyboard.press('Enter');
  await expect(win).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(win).toHaveCount(0);
  await expect(key).toBeFocused();

  // マウス: 押して開き、閉じるボタンで閉じる
  await key.click();
  await expect(win).toBeVisible();
  await win.getByRole('button', { name: 'キーの詳細を閉じる' }).click();
  await expect(win).toHaveCount(0);
  await expect(key).toBeFocused();
});

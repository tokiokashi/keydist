import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ヒートマップのE2E。押下数の値はunit test（`extract.test.ts`）で固定しているので、
 * ここでは画面の配線（図が1枚出る・解析設定の項目が無い・Workspaceに足せる）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap"]');
const diagrams = (page: Page) => feature(page).locator('[data-heatmap-diagram]');

test('ヒートマップの図が1枚出て、押したキーにだけヒートが付く。シフトキーの枠は描かない', async ({ page }) => {
  await selectLayout(page, 'shingeta');
  await page.goto('/analyzer/heatmap');
  await expect(page.getByRole('heading', { name: 'ヒートマップ', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  await expect(diagrams(page).first().locator('figcaption')).toHaveText('打鍵頻度');
  const heat = (id: string) => diagrams(page).first().locator(`[data-heatmap-key="${id}"]`).getAttribute('data-heat');
  expect(Number(await heat('d'))).toBeGreaterThan(0);
  // 新下駄の中指シフトのトリガー(k)は、ヒートマップ（レイヤー）では枠色が付くが、ヒートマップには付かない
  await expect(diagrams(page).first().locator('[data-heatmap-key="k"] rect').first()).toHaveAttribute('stroke-width', '1');
  await expect(feature(page).getByLabel('シフトキーの枠色')).toHaveCount(0);
  await expect(feature(page).getByRole('tablist')).toHaveCount(0);
});

test('解析設定に項目は無い', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings.getByText('このAnalyzerに解析設定はありません。')).toBeVisible();
  await expect(settings.getByRole('group', { name: '色の尺度' })).toHaveCount(0);
});

test('Workspaceの「ペインを追加」にヒートマップとヒートマップ（レイヤー）の2つが並び、ヒートマップを足せる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await expect(page.getByRole('menuitem', { name: /ヒートマップ（レイヤー）/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
});

/** 単体の画面でSingleの対象の図の下に並べる、Multiの集合の対象の図 */
const SINGLE_KEY = 'keydist:single-target-selection';
const MULTI_KEY = 'keydist:multi-target-selection';

async function seedSelections(page: Page, single: string, multi: readonly string[]) {
  await page.addInitScript(
    ([singleId, multiIds, singleKey, multiKey]) => {
      localStorage.setItem(singleKey, JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: singleId } }));
      localStorage.setItem(multiKey, JSON.stringify({ version: 1, targets: multiIds.map((layoutId) => ({ kind: 'layout', layoutId })), colorSlots: {} }));
    },
    [single, multi, SINGLE_KEY, MULTI_KEY] as const,
  );
}

const cells = (page: Page) => feature(page).locator('[data-heatmap-set-target]');

/** 図のキーごとの、ツールチップ1行目（キーの名前と押下数）と色の強度。配列が使わないために枠だけで描くキーは含めない */
async function keyReadings(figure: Locator) {
  return figure.locator('[data-heatmap-key]:not([data-heatmap-key-unused])').evaluateAll((keys) =>
    keys.map((key) => ({
      id: key.getAttribute('data-heatmap-key')!,
      tooltip: (key.querySelector('title')?.textContent ?? '').split('\n')[0]!,
      heat: key.getAttribute('data-heat')!,
    })),
  );
}

test('集合の対象の図が、Singleの対象の下に名前と印付きで並ぶ。Singleの対象と同じ対象は並ばない', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak', 'colemak-dh']);
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(cells(page)).toHaveCount(2);
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  await expect(diagrams(page).first()).toHaveAttribute('data-heatmap-diagram', 'integrated');
  for (const cell of await cells(page).all()) {
    await expect(cell.locator('.heatmap-set-name')).not.toHaveText('');
    await expect(cell.locator('.heatmap-set-swatch')).toHaveCount(1);
  }
  const top = await diagrams(page).first().boundingBox();
  const first = await cells(page).first().boundingBox();
  expect(first!.y).toBeGreaterThan(top!.y + top!.height - 1);
});

test('集合が空、またはSingleの対象だけなら、図は1つだけ', async ({ page }) => {
  await seedSelections(page, 'qwerty', []);
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(cells(page)).toHaveCount(0);

  const onlySingle = await page.context().newPage();
  await seedSelections(onlySingle, 'qwerty', ['qwerty']);
  await onlySingle.goto('/analyzer/heatmap');
  await expect(feature(onlySingle)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(onlySingle)).toHaveCount(1);
  await expect(cells(onlySingle)).toHaveCount(0);
});

test('格子の図の押下数は、同じ対象をSingleで選んだ時の図と一致する', async ({ page }) => {
  await seedSelections(page, 'colemak-dh', ['colemak-dh']);
  await page.goto('/analyzer/heatmap');
  await expect(diagrams(page)).toHaveCount(1, { timeout: 10_000 });
  const asSingle = await keyReadings(diagrams(page).first());

  const grid = await page.context().newPage();
  await seedSelections(grid, 'qwerty', ['qwerty', 'colemak-dh']);
  await grid.goto('/analyzer/heatmap');
  const cell = cells(grid).filter({ has: grid.locator('[data-heatmap-diagram]') });
  await expect(cell).toHaveCount(1, { timeout: 10_000 });
  const inGrid = await keyReadings(cell.locator('[data-heatmap-diagram]'));
  expect(inGrid.map(({ id, tooltip }) => ({ id, tooltip }))).toEqual(asSingle.map(({ id, tooltip }) => ({ id, tooltip })));
});

test('色の尺度は全部の図の最大で揃う。最大の違う組では、格子の図の濃さが押下数÷全部の図の最大になる', async ({ page }) => {
  // 既定のテキストで、QWERTYの最大は340、新下駄の最大は185
  await seedSelections(page, 'qwerty', ['shingeta']);
  await page.goto('/analyzer/heatmap');
  const cell = cells(page).filter({ has: page.locator('[data-heatmap-diagram]') });
  await expect(cell).toHaveCount(1, { timeout: 10_000 });
  const top = await keyReadings(diagrams(page).first());
  const grid = await keyReadings(cell.locator('[data-heatmap-diagram]'));
  const countOf = (tooltip: string) => Number(tooltip.split(': ')[1]!.replace('打', ''));
  const max = Math.max(...top.map((key) => countOf(key.tooltip)), ...grid.map((key) => countOf(key.tooltip)));
  expect(max).toBe(340);
  expect(Math.max(...grid.map((key) => countOf(key.tooltip)))).toBe(185);
  for (const key of [...top, ...grid]) {
    expect(Math.abs(Number(key.heat) - countOf(key.tooltip) / max)).toBeLessThan(0.002);
  }
  expect(Math.max(...grid.map((key) => Number(key.heat)))).toBeLessThan(0.6);
});

test('格子の図は、1列になる幅でも一番上の図より大きくならない', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await seedSelections(page, 'qwerty', ['dvorak', 'workman']);
  await page.goto('/analyzer/heatmap');
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  const top = (await diagrams(page).first().boundingBox())!;
  for (const cell of await cells(page).all()) {
    const box = (await cell.locator('[data-heatmap-diagram]').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(top.width + 1);
  }
});

test('格子の図のツールチップは押下数だけで、キーを押しても小窓は開かない。一番上の図は内訳を出す', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['dvorak']);
  await page.goto('/analyzer/heatmap');
  const cell = cells(page).first();
  await expect(cell.locator('[data-heatmap-diagram]')).toBeVisible({ timeout: 10_000 });
  const gridTitles = await cell.locator('[data-heatmap-key] title').allTextContents();
  expect(gridTitles.every((title) => !title.includes('\n'))).toBe(true);
  await expect(cell.locator('[data-heatmap-key][role="button"]')).toHaveCount(0);
  const topTitles = await diagrams(page).first().locator('[data-heatmap-key] title').allTextContents();
  expect(topTitles.some((title) => title.includes('押し方:'))).toBe(true);
});

for (const viewport of [
  { name: 'パソコン幅', width: 1440, height: 900 },
  { name: 'スマホ幅', width: 390, height: 800 },
]) {
  test(`${viewport.name}: 格子の図が画面の幅からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await seedSelections(page, 'qwerty', ['dvorak', 'colemak-dh', 'workman', 'colemak']);
    await page.goto('/analyzer/heatmap');
    await expect(
      cells(page)
        .filter({ has: page.locator('[data-heatmap-diagram]') })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const figure of await feature(page).locator('[data-heatmap-diagram]').all()) {
      const box = (await figure.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
}

test('Workspaceのペインは、Multiの集合があっても図が1つのまま', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak']);
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(diagrams(page)).toHaveCount(1);
  await expect(cells(page)).toHaveCount(0);
});

test('配列が使わないキーは、左端の列と左右のShiftだけが枠で描かれ、選べず、ツールチップも無い', async ({ page }) => {
  await selectLayout(page, 'naginata-v18');
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const unused = diagrams(page).first().locator('[data-heatmap-key-unused]');
  await expect(unused).toHaveCount(5);
  expect(await unused.evaluateAll((keys) => keys.map((key) => key.getAttribute('data-heatmap-key')).sort())).toEqual(
    ['backquote', 'caps-lock', 'shift-l', 'shift-r', 'tab'].sort(),
  );
  await expect(unused.locator('title')).toHaveCount(0);
  await expect(unused.locator('text')).toHaveCount(0);
  await expect(unused.first()).not.toHaveAttribute('role', 'button');
  await unused.first().click({ force: true });
  await expect(page.locator('[data-key-detail-window]')).toHaveCount(0);
});

test('格子の図は、Shiftを使う配列と使わない配列でもキー1つの幅が同じになり、左端の列が実寸の幅で揃う', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await seedSelections(page, 'qwerty', ['qwerty', 'naginata-v18', 'dvorak']);
    await page.goto('/analyzer/heatmap');
    const figures = cells(page).locator('[data-heatmap-diagram]');
    await expect(figures).toHaveCount(2, { timeout: 10_000 });
    const keyBoxes = async (id: string) =>
      Promise.all((await figures.all()).map(async (figure) => (await figure.locator(`[data-heatmap-key="${id}"] rect`).first().boundingBox())!));
    // 文字キー1つの幅と、同じキーの図の中の位置は、図によらず同じ
    const [a1, a2] = await keyBoxes('a');
    expect(Math.abs(a1!.width - a2!.width)).toBeLessThan(0.5);
    const [figure1, figure2] = await Promise.all((await figures.all()).map((figure) => figure.boundingBox()));
    expect(Math.abs(a1!.x - figure1!.x - (a2!.x - figure2!.x))).toBeLessThan(0.5);
    // 左端の列は実寸の幅で、左端が段によらず揃う
    const lefts = await Promise.all(['backquote', 'tab', 'caps-lock', 'shift-l'].map(async (id) => (await keyBoxes(id))[0]!));
    for (const box of lefts) expect(Math.abs(box.x - lefts[0]!.x)).toBeLessThan(0.5);
    expect(lefts[1]!.width).toBeGreaterThan(lefts[0]!.width);
    expect(lefts[2]!.width).toBeGreaterThan(lefts[1]!.width);
    expect(lefts[3]!.width).toBeGreaterThan(lefts[2]!.width);
  }
});

/** 格子に並べる配列を選ぶ操作（Multiの集合の書き換え）。Singleの対象の選択とは別の部品 */
const setPicker = (page: Page) => feature(page).getByRole('button', { name: /^並べる配列: / });
const setDialog = (page: Page) => page.getByRole('dialog', { name: '並べる配列の選択' });
const multiOf = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, MULTI_KEY);

test('集合が空でも、並べる配列を選ぶ操作だけが出る。選ぶと格子が出て、Undoで戻る。Singleの対象は変わらない', async ({ page }) => {
  await seedSelections(page, 'qwerty', []);
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(cells(page)).toHaveCount(0);
  await expect(setPicker(page)).toHaveAttribute('aria-label', '並べる配列: 未選択');
  // 見出しのSingleの対象の選択は別のボタンで、名前で区別できる
  await expect(page.getByRole('button', { name: /^対象: / })).toHaveCount(1);
  // 選択の小窓は自動で開かない
  await expect(setDialog(page)).toHaveCount(0);

  await setPicker(page).click();
  await setDialog(page).locator('input[value="layout:dvorak"]').click();
  await setDialog(page).locator('input[value="layout:colemak-dh"]').click();
  await expect(cells(page)).toHaveCount(2);
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(2, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  expect(await page.evaluate((key) => localStorage.getItem(key), SINGLE_KEY)).toContain('qwerty');

  // 選択の中の名前と格子の図の名前が同じ
  const gridNames = await cells(page).locator('.heatmap-set-name').allTextContents();
  const summary = (await setPicker(page).getAttribute('aria-label'))!.replace('並べる配列: ', '');
  for (const name of gridNames) expect(summary).toContain(name.trim());

  // 1回のUndoで、直前に足した1件だけが戻る
  const bar = page.locator('.context-bar');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(cells(page)).toHaveCount(1);
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(cells(page)).toHaveCount(0);
  await expect(setPicker(page)).toHaveAttribute('aria-label', '並べる配列: 未選択');
});

test('Singleの対象を集合に足しても格子は増えない。外すと選択からも消える', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['dvorak']);
  await page.goto('/analyzer/heatmap');
  await expect(cells(page)).toHaveCount(1, { timeout: 10_000 });
  await setPicker(page).click();
  await setDialog(page).locator('input[value="layout:qwerty"]').click();
  await expect(setDialog(page).getByRole('status')).toContainText('2件を選択中');
  await expect(cells(page)).toHaveCount(1);
  await setDialog(page).locator('input[value="layout:dvorak"]').click();
  await expect(cells(page)).toHaveCount(0);
  await expect(setDialog(page).getByRole('status')).toContainText('1件を選択中');
});

test('ヒートマップの画面で変えた集合は、比較表の画面にも出る', async ({ page }) => {
  await seedSelections(page, 'qwerty', []);
  await page.goto('/analyzer/heatmap');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await setPicker(page).click();
  await setDialog(page).locator('input[value="layout:dvorak"]').click();
  await expect(cells(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => JSON.stringify(await multiOf(page))).toContain('dvorak');
  // 初期値の書き込みを仕込んだページとは別のページで開く（開き直しで集合が上書きされない）
  const comparison = await page.context().newPage();
  await comparison.goto('/analyzer/comparison');
  await expect(comparison.getByRole('button', { name: /^対象: .*Dvorak/ })).toBeVisible({ timeout: 10_000 });
});

test('Workspaceのヒートマップのペインには、並べる配列を選ぶ操作が出ない', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak']);
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /^ヒートマップ(?!（レイヤー）)/ }).click();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(setPicker(page)).toHaveCount(0);
});

test('描き方を熱の塊にすると、一番上の図と格子の図が一緒に変わる。キーごとの値は変わらず、再読み込みで戻る', async ({ page }) => {
  await seedSelections(page, 'qwerty', ['qwerty', 'dvorak']);
  await page.goto('/analyzer/heatmap');
  await expect(cells(page).filter({ has: page.locator('[data-heatmap-diagram]') })).toHaveCount(1, { timeout: 10_000 });
  const blobLayers = feature(page).locator('.heatmap-blob-layer');
  await expect(blobLayers).toHaveCount(0);
  const before = await keyReadings(diagrams(page).first());

  await page.getByRole('button', { name: '打鍵頻度の図の表示', exact: true }).click();
  const figureSettings = page.locator('[data-figure-settings-window="true"]');
  await expect(figureSettings.getByRole('button', { name: 'キーの塗り', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await figureSettings.getByRole('button', { name: '熱の塊', exact: true }).click();
  await expect(blobLayers).toHaveCount(2);
  expect(await keyReadings(diagrams(page).first())).toEqual(before);
  // キーの選択は今と同じく動く
  await diagrams(page).first().locator('[data-heatmap-key="a"]').click();
  await expect(diagrams(page).first().locator('[data-heatmap-key="a"]')).toHaveAttribute('data-key-selected', 'true');

  await page.reload();
  await expect(blobLayers).toHaveCount(2, { timeout: 10_000 });
});

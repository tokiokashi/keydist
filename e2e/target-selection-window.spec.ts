import { expect, test, type Locator, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings, targetButton, targetChoice } from './pane-helper.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * 対象の選択は、解析設定と同じ浮かぶ小窓（パソコン幅）・下からのシート（スマホ幅）で開く。
 * 外を押す・フォーカスが外へ移る・Tabで出る、では閉じず、×・Escape・対象ボタンで閉じる。
 * 図を見ながら対象を足し引きできること、開いているものが画面全体で1つであること、
 * 「表示中を全部選ぶ」の動きを見る。
 */

const SELECTION = (page: Page) => page.getByRole('dialog', { name: '対象の選択' });
const closeButton = (page: Page) => page.getByRole('button', { name: '対象の選択を閉じる' });
const scatterPoints = (page: Page) => page.locator('[data-react-feature="scatter"] [data-scatter-point]');

async function seedMulti(page: Page, targets: readonly { kind: string; layoutId: string }[]): Promise<void> {
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:multi-target-selection') === null) {
      localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: value }));
    }
  }, targets);
}

const THREE = [
  { kind: 'layout', layoutId: 'qwerty' },
  { kind: 'layout', layoutId: 'jis-kana' },
  { kind: 'layout', layoutId: 'dvorak' },
];

/** 見出し行を掴んで`dx`・`dy`だけ動かす。 */
async function dragHeader(page: Page, dx: number, dy: number): Promise<void> {
  const handle = SELECTION(page).locator('.settings-window-handle');
  const box = (await handle.boundingBox())!;
  const x = box.x + 30;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('パソコン幅の個別画面（散布図）', () => {
  test.beforeEach(async ({ page }) => {
    await useShortText(page);
    await seedMulti(page, THREE);
    await page.goto('/analyzer/scatter');
    await expect(scatterPoints(page)).toHaveCount(3, { timeout: 15_000 });
  });

  test('開いたまま図を押す・図へフォーカスを移す・Tabで一覧の端から出ても閉じない', async ({ page }) => {
    await targetButton(page).click();
    await expect(SELECTION(page)).toBeVisible();
    await expect(SELECTION(page).getByRole('searchbox')).toBeFocused();
    // 背後は暗くならない
    await expect(page.locator('.target-selection-scrim')).toHaveCount(0);

    // 図の上を押す
    const figure = page.locator('[data-react-feature="scatter"] [data-scatter-figure]').first();
    await figure.click({ position: { x: 4, y: 4 }, force: true });
    await expect(SELECTION(page)).toBeVisible();

    // 図の点へフォーカスを移す
    await scatterPoints(page).first().focus();
    await expect(scatterPoints(page).first()).toBeFocused();
    await expect(SELECTION(page)).toBeVisible();

    // 一覧の端から出る。Tabは対象ボタンの次の要素へ移すだけで閉じない
    await SELECTION(page).getByRole('searchbox').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(closeButton(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(targetButton(page)).toBeFocused();
    await expect(SELECTION(page)).toBeVisible();

    await closeButton(page).focus();
    await SELECTION(page).locator('.target-selection-foot button').last().focus();
    await page.keyboard.press('Tab');
    await expect(SELECTION(page)).toBeVisible();
    await expect(SELECTION(page).locator(':focus')).toHaveCount(0);
    await expect(targetButton(page)).not.toBeFocused();
  });

  test('開いたまま対象を足すと図の点が増える。見出し行をドラッグすると動き、画面の大きさを変えても対象ボタンの近くへ戻らない', async ({ page }) => {
    await targetButton(page).click();
    const selection = SELECTION(page);
    const button = (await targetButton(page).boundingBox())!;
    const first = (await selection.boundingBox())!;
    expect(Math.abs(first.x - button.x)).toBeLessThan(40);
    expect(first.y).toBeGreaterThanOrEqual(button.y + button.height);

    await targetChoice(page, 'layout:colemak-dh').then((choice) => choice.click());
    await expect(scatterPoints(page)).toHaveCount(4);
    await expect(selection).toBeVisible();

    await dragHeader(page, 120, 90);
    const moved = (await selection.boundingBox())!;
    expect(moved.x - first.x).toBeGreaterThan(80);
    expect(moved.y - first.y).toBeGreaterThan(60);

    await page.setViewportSize({ width: 1200, height: 760 });
    await page.waitForTimeout(200);
    const after = (await selection.boundingBox())!;
    expect(Math.abs(after.x - moved.x)).toBeLessThan(2);
    expect(Math.abs(after.y - moved.y)).toBeLessThan(2);
  });

  test('ドラッグする前は、画面の大きさが変わると対象ボタンの近くへ置き直す', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await targetButton(page).click();
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect
      .poll(async () => {
        const button = (await targetButton(page).boundingBox())!;
        const box = (await SELECTION(page).boundingBox())!;
        return Math.abs(box.x - button.x) < 40 && box.y >= button.y + button.height;
      })
      .toBe(true);
  });

  test('×・Escape・対象ボタンで閉じる。×ではフォーカスが対象ボタンへ戻り、フォーカスが図にある時のEscapeでは戻さない', async ({ page }) => {
    const selection = SELECTION(page);
    await targetButton(page).click();
    await expect(selection).toBeVisible();
    await expect(closeButton(page)).toHaveCount(1);
    // 下のボタン列に「閉じる」は無い
    await expect(selection.getByRole('button', { name: '閉じる', exact: true })).toHaveCount(0);
    await closeButton(page).click();
    await expect(selection).toHaveCount(0);
    await expect(targetButton(page)).toBeFocused();

    // 小窓の中のEscape: フォーカスは対象ボタンへ戻る
    await targetButton(page).click();
    await expect(selection.getByRole('searchbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(selection).toHaveCount(0);
    await expect(targetButton(page)).toBeFocused();

    // 図にフォーカスがある時のEscape: 閉じるが、フォーカスは図に残る
    await targetButton(page).click();
    await expect(selection).toBeVisible();
    await scatterPoints(page).first().focus();
    await page.keyboard.press('Escape');
    await expect(selection).toHaveCount(0);
    await expect(scatterPoints(page).first()).toBeFocused();

    // 対象ボタンをもう一度押す
    await targetButton(page).click();
    await expect(selection).toBeVisible();
    await targetButton(page).click();
    await expect(selection).toHaveCount(0);
  });

  test('解析設定の小窓の中にフォーカスがある時のEscapeは、解析設定の小窓だけを閉じる。対象の選択は上に出る', async ({ page }) => {
    await targetButton(page).click();
    await expect(SELECTION(page)).toBeVisible();
    const settings = await openSettings(page);
    await expect(settings).toBeFocused();
    const z = async (locator: Locator) => Number(await locator.evaluate((element) => getComputedStyle(element).zIndex));
    expect(await z(SELECTION(page))).toBeGreaterThan(await z(settings));
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(SELECTION(page)).toBeVisible();
    // 次のEscapeで対象の選択も閉じる（フォーカスは小窓が消えて行き場が無い）
    await page.keyboard.press('Escape');
    await expect(SELECTION(page)).toHaveCount(0);
  });

  test('「表示中を全部選ぶ」は、出ている候補のうち選んでいないものを一覧の順に足し、既に選んだ対象は残す', async ({ page }) => {
    await targetButton(page).click();
    const selection = SELECTION(page);
    const selectAll = selection.getByRole('button', { name: '表示中を全部選ぶ' });
    const choices = selection.locator('input[type="checkbox"]');

    // かな配列に絞って押す。かな配列が全て選ばれ、選んでいた英字の配列も残る
    await selection.getByRole('radio', { name: 'かな配列' }).check({ force: true });
    await expect(selectAll).toBeEnabled();
    await selectAll.click();
    await expect(selectAll).toBeDisabled();
    const kanaCount = await choices.count();
    await expect(choices.locator('visible=true')).toHaveCount(kanaCount);
    for (let n = 0; n < kanaCount; n += 1) await expect(choices.nth(n)).toBeChecked();
    await selection.getByRole('radio', { name: '英字の配列' }).check({ force: true });
    await expect(selection.locator('input[value="layout:qwerty"]')).toBeChecked();
    await expect(selection.locator('input[value="layout:dvorak"]')).toBeChecked();
    // 英字の配列のうち選んでいなかったものは、まだ選ばれていない
    await expect(selection.locator('input[value="layout:colemak-dh"]')).not.toBeChecked();
    await expect(selectAll).toBeEnabled();

    // 絞り込み欄で絞る。一覧に出ているものだけが足される
    await selection.getByRole('radio', { name: 'すべて' }).check({ force: true });
    await selection.getByRole('searchbox').fill('colemak');
    const visible = selection.locator('input[type="checkbox"]');
    const visibleCount = await visible.count();
    expect(visibleCount).toBeGreaterThan(0);
    await selectAll.click();
    await expect(selectAll).toBeDisabled();
    for (let n = 0; n < visibleCount; n += 1) await expect(visible.nth(n)).toBeChecked();
    // 一覧に出ていない対象は変わらない（絞り込みを外すと、足していないものが残っている）
    await selection.getByRole('searchbox').fill('');
    await expect(selection.locator('input[value="layout:colemak-dh"]')).toBeChecked();
    await expect(selection.locator('input[value="layout:workman"]')).not.toBeChecked();
    await expect(selectAll).toBeEnabled();

    // 候補が0件の時は押せない
    await selection.getByRole('searchbox').fill('該当する名前はありません');
    await expect(selectAll).toBeDisabled();
    // すべて外すは絞り込みにかかわらず全部外す
    await selection.getByRole('button', { name: 'すべて外す' }).click();
    await expect(selection.getByRole('status')).toHaveText('0件を選択中');
  });
});

test('1つだけ選ぶAnalyzerには「表示中を全部選ぶ」が出ず、ポインターで選ぶと閉じる', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await targetButton(page).click();
  await expect(SELECTION(page)).toBeVisible();
  await expect(SELECTION(page).getByRole('button', { name: '表示中を全部選ぶ' })).toHaveCount(0);
  await expect(SELECTION(page).locator('input[type="radio"][name$="-target"]').first()).toBeVisible();
  await SELECTION(page).locator('input[value="layout:colemak-dh"]').click();
  await expect(SELECTION(page)).toHaveCount(0);
  await expect(targetButton(page)).toBeFocused();
});

test('ヒートマップの個別画面で「対象」と「並べる配列」の選択を順に開くと、先に開いた方が閉じる', async ({ page }) => {
  await page.goto('/analyzer/heatmap');
  await waitForHydration(page);
  const single = page.getByRole('dialog', { name: '対象の選択' });
  const beside = page.getByRole('dialog', { name: '並べる配列の選択' });
  await page.getByRole('button', { name: /^対象: / }).click();
  await expect(single).toBeVisible();
  await page.getByRole('button', { name: /^並べる配列: / }).click();
  await expect(beside).toBeVisible();
  await expect(single).toHaveCount(0);
  await page.getByRole('button', { name: /^対象: / }).click();
  await expect(single).toBeVisible();
  await expect(beside).toHaveCount(0);
});

test.describe('Workspace', () => {
  async function createWorkspace(page: Page): Promise<void> {
    await page.goto('/');
    await waitForHydration(page);
    await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
    await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
    await expect(page.locator('.context-bar').getByRole('heading', { level: 1 })).toBeVisible();
  }
  async function addAnalyzer(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  }

  test('2つのペインの対象の選択を順に開くと先に開いた方が閉じる。ペインを足しても開いているものは閉じない。拡大すると閉じる', async ({ page }) => {
    await createWorkspace(page);
    await addAnalyzer(page, 'Bigram Flow');
    await addAnalyzer(page, 'Bigram Flow');
    const panes = page.locator('.pane-frame');
    await expect(panes.nth(1).locator('[data-react-feature="bigram-flow"]')).toBeVisible({ timeout: 10_000 });
    const first = panes.nth(0).getByRole('button', { name: /^対象: / });
    const second = panes.nth(1).getByRole('button', { name: /^対象: / });

    await first.click();
    await expect(SELECTION(page)).toHaveCount(1);
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await second.click();
    await expect(SELECTION(page)).toHaveCount(1);
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(second).toHaveAttribute('aria-expanded', 'true');

    // 開いたまま、対象が空のペインを足しても閉じない
    await addAnalyzer(page, '比較表');
    await expect(page.locator('.pane-frame')).toHaveCount(3);
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(SELECTION(page)).toHaveCount(1);

    // ペインを拡大すると、開いている対象の選択が閉じる
    await panes
      .nth(0)
      .getByRole('button', { name: /の操作$/ })
      .click();
    await page.getByRole('menuitem', { name: /拡大表示/ }).click();
    await expect(SELECTION(page)).toHaveCount(0);
  });
});

test.describe('スマホ幅', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await useShortText(page);
    await seedMulti(page, THREE);
    await page.goto('/analyzer/scatter');
    await expect(scatterPoints(page)).toHaveCount(3, { timeout: 15_000 });
  });

  test('背後を暗くせず、高さは解析設定のシートと同じ上限以下。図を押しても閉じず、一覧は全ての候補までスクロールできる', async ({ page }) => {
    const settings = await openSettings(page);
    const settingsHeight = (await settings.boundingBox())!.height;
    await page.getByRole('button', { name: '解析設定を閉じる' }).click();
    await expect(settings).toHaveCount(0);

    await targetButton(page).click();
    const selection = SELECTION(page);
    await expect(selection).toBeVisible();
    await expect(page.locator('.target-selection-scrim')).toHaveCount(0);
    const box = (await selection.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(Math.max(settingsHeight, 844 * 0.55) + 1);
    expect(box.y + box.height).toBeCloseTo(844, 0);

    // 図（上の見える所）を押しても閉じない
    await page.mouse.click(195, 120);
    await expect(selection).toBeVisible();

    // 絞り込み欄・種類の切り替え・下のボタン列が残り、一覧が最後の候補までスクロールできる
    await expect(selection.getByRole('searchbox')).toBeVisible();
    await expect(selection.getByRole('radio', { name: 'かな配列' })).toBeAttached();
    const selectAll = selection.getByRole('button', { name: '表示中を全部選ぶ' });
    await expect(selectAll).toBeVisible();
    const last = selection.locator('.target-selection-choice').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    const lastBox = (await last.boundingBox())!;
    const footBox = (await selection.locator('.target-selection-foot').boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(footBox.y + 1);
  });

  test('×・Escape・対象ボタン・下へのドラッグで閉じる', async ({ page }) => {
    const selection = SELECTION(page);
    await targetButton(page).click();
    await closeButton(page).click();
    await expect(selection).toHaveCount(0);
    await expect(targetButton(page)).toBeFocused();

    await targetButton(page).click();
    await expect(selection).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(selection).toHaveCount(0);

    // シートが覆っていない対象ボタンをもう一度押す
    await targetButton(page).click();
    await expect(selection).toBeVisible();
    await targetButton(page).click();
    await expect(selection).toHaveCount(0);

    // 下へドラッグする
    await targetButton(page).click();
    await expect(selection).toBeVisible();
    const grabber = selection.locator('.settings-sheet-grabber');
    const box = (await grabber.boundingBox())!;
    const height = (await selection.boundingBox())!.height;
    await grabber.evaluate(
      async (element, args) => {
        const fire = (type: string, clientY: number) =>
          element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', button: 0, clientX: args.x, clientY }));
        fire('pointerdown', args.y);
        for (let step = 1; step <= 6; step += 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          fire('pointermove', args.y + (args.dy * step) / 6);
        }
        fire('pointerup', args.y + args.dy);
      },
      { x: box.x + 20, y: box.y + box.height / 2, dy: Math.ceil(height / 2) },
    );
    await expect(selection).toHaveCount(0);
  });

  test('解析設定のシートと同時に開くと、後から開いた方が上に出る', async ({ page }) => {
    await targetButton(page).click();
    const selection = SELECTION(page);
    await expect(selection).toBeVisible();
    const settings = await openSettings(page);
    const topmost = (locator: Locator) =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
        return element.contains(hit);
      });
    expect(await topmost(settings)).toBe(true);
    expect(await topmost(selection)).toBe(false);
  });
});

test.describe('トップページ', () => {
  test('配列を1つ選ぶ欄は浮かぶ小窓で開き、配列を選ぶと閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await targetButton(page).click();
    const selection = SELECTION(page);
    await expect(selection).toBeVisible();
    await expect(selection.locator('.settings-window-handle')).toBeVisible();
    await expect(page.locator('.target-selection-scrim')).toHaveCount(0);
    await selection.locator('input[value="layout:colemak-dh"]').click();
    await expect(selection).toHaveCount(0);
  });

  test('スマホ幅では背後を暗くしないシートで開き、配列を選ぶと閉じる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForHydration(page);
    await targetButton(page).click();
    const selection = SELECTION(page);
    await expect(selection).toBeVisible();
    await expect(page.locator('.target-selection-scrim')).toHaveCount(0);
    await expect(selection.locator('.settings-sheet-grabber')).toBeAttached();
    expect((await selection.boundingBox())!.height).toBeLessThanOrEqual(844 * 0.55 + 1);
    await selection.locator('input[value="layout:colemak-dh"]').click();
    await expect(selection).toHaveCount(0);
  });
});

import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings } from './pane-helper.ts';
import { SHORT_TEXT_REF, useShortText } from './short-text-helper.ts';

/**
 * 散布図のe2e。等位線の値・座標・名前の置き場所はunit testで固定しているので、
 * ここでは画面の配線（組み合わせの切り替えで軸の名前と点が替わる・Workspaceに載る・点のフォーカスで値が出る）だけを見る。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const JIS_KANA = { kind: 'layout', layoutId: 'jis-kana' };
const DVORAK = { kind: 'layout', layoutId: 'dvorak' };

const feature = (page: Page) => page.locator('[data-react-feature="scatter"]');

test.beforeEach(async ({ page }) => {
  await useShortText(page);
});

test.describe('個別画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('keydist:multi-target-selection') === null) {
        localStorage.setItem(
          'keydist:multi-target-selection',
          JSON.stringify({
            version: 1,
            targets: [
              { kind: 'layout', layoutId: 'qwerty' },
              { kind: 'layout', layoutId: 'jis-kana' },
              { kind: 'layout', layoutId: 'dvorak' },
            ],
          }),
        );
      }
    });
    await page.goto('/analyzer/scatter');
    await expect(feature(page).locator('[data-scatter-point]')).toHaveCount(3, { timeout: 15_000 });
  });

  test('既定は動作数と1打鍵の距離で、軸の名前は比較表の列名、等位線には量の名前と値を書く', async ({ page }) => {
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('動作数');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('u/打鍵');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toContainText(/^距離 \d+$/);
    await expect(feature(page).locator('[data-scatter-preset-note]')).toHaveCount(0);
    // かな配列と英字の配列は、色と形の両方で分ける
    await expect(feature(page).locator('[data-scatter-point][data-kind="kana"] [data-mark="diamond"]')).toHaveCount(1);
    await expect(feature(page).locator('[data-scatter-point][data-kind="alpha"] [data-mark="circle"]')).toHaveCount(2);
    // 配列の名前は点の近くに書く
    await expect(feature(page).locator('[data-scatter-point]').filter({ hasText: 'QWERTY' })).toHaveCount(1);
  });

  test('組み合わせを切り替えると、軸の名前と点の位置が変わる', async ({ page }) => {
    const qwerty = feature(page).locator('[data-scatter-point]').filter({ hasText: 'QWERTY' });
    const before = await qwerty.evaluate((element) => getComputedStyle(element).transform);
    const settings = await openSettings(page);
    await settings.getByLabel('組み合わせ', { exact: true }).selectOption('sameFinger');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('同指率');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toContainText(/^同指 \d+/);
    await expect(feature(page).locator('[data-scatter-preset-note]')).toBeVisible();
    await expect.poll(() => qwerty.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);

    await settings.getByLabel('組み合わせ', { exact: true }).selectOption('hand');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('手の切り替え');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('同じ手の続き');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toContainText(/^同じ手の続きの割合 [\d.]+%$/);
  });

  test('自由に選ぶと、横軸と縦軸を比較表の列から選べる。引けない組には線を引かず、選べない列は選択肢に出ない', async ({ page }) => {
    const settings = await openSettings(page);
    await settings.getByLabel('組み合わせ', { exact: true }).selectOption('free');
    await settings.getByLabel('横軸', { exact: true }).selectOption('singleTapRate');
    await settings.getByLabel('縦軸', { exact: true }).selectOption('perCharPresses');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('単打率');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('押下/文字');
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);

    await settings.getByLabel('横軸', { exact: true }).selectOption('perCharUnits');
    await settings.getByLabel('縦軸', { exact: true }).selectOption('meanPerStroke');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toContainText(/^動作数\/文字 [\d.]+$/);
    // 入力文字数倍の関係にある列と同じ列は、もう一方の軸の選択肢に出ない
    const vertical = settings.getByLabel('縦軸', { exact: true });
    await expect(vertical.locator('option', { hasText: /^距離$/ })).toHaveCount(0);
    await expect(vertical.locator('option', { hasText: /^u\/文字$/ })).toHaveCount(0);
  });

  test('点にフォーカスすると、完全な名前・横軸・縦軸・等位線の値を出す', async ({ page }) => {
    const readout = feature(page).locator('[data-scatter-readout]');
    await expect(readout).toHaveText('');
    await feature(page).locator('[data-scatter-point]').filter({ hasText: 'QWERTY' }).focus();
    await expect(readout).toContainText('QWERTY');
    await expect(readout).toContainText(/動作数 \d+/);
    await expect(readout).toContainText(/u\/打鍵 \d+\.\d{3}/);
    await expect(readout).toContainText(/距離 \d+/);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await expect(readout).toHaveText('');
  });

  test('図の見方のⓘに、種類の色と形を書く', async ({ page }) => {
    await page.getByRole('button', { name: '図の見方の説明' }).first().click();
    await expect(page.getByText('赤の菱形はかな配列')).toBeVisible();
  });

  test('動きを減らす設定では、点が動く間の遷移を付けない', async ({ page }) => {
    const point = feature(page).locator('[data-scatter-point]').first();
    await expect(point).toHaveCSS('transition-duration', '0.28s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(point).toHaveCSS('transition-duration', '0s');
  });
});

test.describe('Workspace', () => {
  test('Workspaceのペインとして載り、配列ごとの点を描く', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] })), {
      id: 'sc',
      name: '散布図',
      text: { ref: SHORT_TEXT_REF },
      panes: [
        {
          id: 'plot',
          analyzerId: 'scatter',
          binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, JIS_KANA, DVORAK], colorSlots: [0, 1, 2] } } },
        },
      ],
      grid: [{ id: 'plot', x: 0, y: 0, w: 18, h: 16 }],
    });
    await page.goto('/workspace/sc');
    await waitForHydration(page);
    const plot = page.locator('[data-pane-id="plot"] [data-react-feature="scatter"]').first();
    await expect(plot.locator('[data-scatter-point]')).toHaveCount(3, { timeout: 20_000 });
    await expect(plot.locator('[data-scatter-x-title]')).toHaveText('動作数');
  });
});

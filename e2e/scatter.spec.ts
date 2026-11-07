import { SCATTER_PRESET_IDS, scatterPresetLabels, type ScatterPresetId } from '#analyzers/scatter/axes.ts';
import { expect, test, type Locator, type Page } from './fixtures.ts';
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
const figureOf = (page: Page, preset: ScatterPresetId) => feature(page).locator(`[data-scatter-figure="${preset}"]`);
const pointOf = (scope: Locator, targetKey: string) => scope.locator(`[data-scatter-point="${targetKey}"]`);

const PRESET_LABELS = scatterPresetLabels('ja');
const presetBox = (settings: Locator, preset: ScatterPresetId) => settings.getByRole('checkbox', { name: PRESET_LABELS[preset], exact: true });

/** 選ぶ組み合わせを1つだけにする。先に選んでから他を外す（最後の1つは外せないため）。 */
async function selectOnlyPreset(settings: Locator, preset: ScatterPresetId): Promise<void> {
  const target = presetBox(settings, preset);
  if (!(await target.isChecked())) await target.check();
  for (const other of SCATTER_PRESET_IDS) {
    if (other !== preset && (await presetBox(settings, other).isChecked())) await presetBox(settings, other).uncheck();
  }
}

/** 組み合わせを選んだ状態で画面を開き直す（URLの`preset`。解析設定の小窓を開かないので、図の操作をふさがない）。 */
async function openWithPresets(page: Page, presets: readonly ScatterPresetId[]): Promise<void> {
  await page.goto(`/analyzer/scatter?preset=${presets.join(',')}`);
  await expect(feature(page).locator('[data-scatter-figure]')).toHaveCount(presets.length, { timeout: 15_000 });
  await expect(feature(page).locator('[data-scatter-point]')).toHaveCount(3 * presets.length);
}

/** 選んだ組み合わせに加える。 */
async function addPreset(settings: Locator, preset: ScatterPresetId): Promise<void> {
  if (!(await presetBox(settings, preset).isChecked())) await presetBox(settings, preset).check();
}

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

  test('既定は1かなあたりのアクション数と1アクションあたりの距離で、軸の名前は「量/何あたり（単位）」の形、細い線には値だけを書き、量の名前は凡例に1回出す', async ({
    page,
  }) => {
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/アクション（u）');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1カナあたりの距離（u）');
    await expect(feature(page).locator('[data-scatter-preset-note]')).toHaveCount(0);
    // 図の下に、縦軸の量と横軸の量の関係をキャプションで出す
    await expect(feature(page).locator('[data-scatter-caption]')).toHaveText('1アクションあたりの距離と1カナあたりのアクション数の関係');
    await expect(feature(page).locator('[data-scatter-center-line]')).toHaveCount(0);
    // かな配列と英字の配列は、色と形の両方で分ける
    await expect(feature(page).locator('[data-scatter-point][data-kind="kana"] [data-mark="diamond"]')).toHaveCount(1);
    await expect(feature(page).locator('[data-scatter-point][data-kind="alpha"] [data-mark="circle"]')).toHaveCount(2);
    // 配列の名前は点の近くに書く
    await expect(feature(page).locator('[data-scatter-name-of="layout:qwerty"]')).toHaveText('QWERTY');
  });

  test('組み合わせを切り替えると、軸の名前と点の位置が変わる', async ({ page }) => {
    const qwerty = pointOf(feature(page), 'layout:qwerty');
    const before = await qwerty.evaluate((element) => getComputedStyle(element).transform);
    const settings = await openSettings(page);
    await selectOnlyPreset(settings, 'press');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('キー数/アクション');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('アクション数/カナ');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1カナあたりのキー数');
    await expect(feature(page).locator('[data-scatter-preset-note]')).toHaveCount(0);

    await selectOnlyPreset(settings, 'perPress');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('キー数/カナ');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/キー（u）');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1カナあたりの距離（u）');

    await selectOnlyPreset(settings, 'sameFinger');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('アクション数');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('同指率（%）');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^\d+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('同指の回数');
    await expect.poll(() => qwerty.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);

    await selectOnlyPreset(settings, 'hand');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('手の切り替えの回数');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('同じ手の続きの回数');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+%$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('同じ手の続きの割合（%）');

    await selectOnlyPreset(settings, 'handRates');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('同じ手の続きの割合（%）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('同指率（%）');
    // 恒等式が無いので細い線は引かず、同じ手の続きの割合には50%の線も引かない
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-center-line]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-caption]')).toHaveText('同指率と同じ手の続きの割合の関係');

    await selectOnlyPreset(settings, 'handShare');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('右手キー率（%）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('右手距離率（%）');
    // 細い線は引かない。50%の位置は、軸の範囲に入る軸にだけ線を引く
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-caption]')).toHaveText('右手距離率と右手キー率の関係');

    await selectOnlyPreset(settings, 'movedPress');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('移動ありキー率（%）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/移動ありキー（u）');
    // 線の量が1キーあたりの距離の組は、細い線を引かない
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveCount(0);

    await expect(presetBox(settings, 'textDistance')).toHaveCount(1);
    await selectOnlyPreset(settings, 'textDistance');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('アクション数/文字');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/アクション（u）');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1文字あたりの距離（u）');
    await expect(feature(page).locator('[data-scatter-caption]')).toHaveText('1アクションあたりの距離と1文字あたりのアクション数の関係');

    await expect(presetBox(settings, 'charsPerAction')).toHaveCount(1);
    await selectOnlyPreset(settings, 'charsPerAction');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('文字数/アクション');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('アクション数/距離（1/u）');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1uあたりの文字数（1/u）');
  });

  test('目盛りを対数にすると、対数にできる図では軸の名前に対数と出て、できない図では通常のまま理由が出る', async ({ page }) => {
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: '対数', exact: true }).click();
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ（対数）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/アクション（u、対数）');
    await expect(feature(page).locator('[data-scatter-log-notice]')).toHaveCount(0);
    // 対数を選んだまま組み合わせを変える。線を引かない図は通常の目盛りで、理由が出る
    await selectOnlyPreset(settings, 'handShare');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('右手キー率（%）');
    await expect(feature(page).locator('[data-scatter-log-notice="noStraightLines"]')).toHaveCount(1);
    // 対数にできる図に戻ると、対数のまま
    await selectOnlyPreset(settings, 'charsPerAction');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('文字数/アクション（対数）');
    await expect(feature(page).locator('[data-scatter-log-notice]')).toHaveCount(0);
    await settings.getByRole('button', { name: '通常', exact: true }).click();
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('文字数/アクション');
  });

  test('自由に選ぶと、横軸と縦軸を比較表の列から選べる。引けない組には線を引かず、選べない列は選択肢に出ない', async ({ page }) => {
    const settings = await openSettings(page);
    await selectOnlyPreset(settings, 'free');
    await settings.getByLabel('横軸', { exact: true }).selectOption('singleTapRate');
    await settings.getByLabel('縦軸', { exact: true }).selectOption('perCharPresses');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('単打率（%）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('キー数/カナ');
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveCount(0);

    // 線の量が1アクションあたりの距離になる組は、細い線を引かない
    await settings.getByLabel('縦軸', { exact: true }).selectOption('perCharUnits');
    await settings.getByLabel('横軸', { exact: true }).selectOption('perCharPresses');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/カナ（u）');
    await expect(feature(page).locator('[data-scatter-contour]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveCount(0);

    await settings.getByLabel('縦軸', { exact: true }).selectOption('meanPerStroke');
    await settings.getByLabel('横軸', { exact: true }).selectOption('perCharUnits');
    // 何あたりの距離かが軸の名前で分かれる
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('距離/カナ（u）');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('距離/アクション（u）');
    await expect(feature(page).locator('[data-scatter-caption]')).toHaveText('1アクションあたりの距離と1カナあたりの距離の関係');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1カナあたりのアクション数');
    // 入力かな数倍の関係にある列と同じ列は、もう一方の軸の選択肢に出ない
    const vertical = settings.getByLabel('縦軸', { exact: true });
    await expect(vertical.locator('option', { hasText: /^距離$/ })).toHaveCount(0);
    await expect(vertical.locator('option', { hasText: /^u\/カナ$/ })).toHaveCount(0);
    // 選択肢の列名も、散布図の単位の語で書く
    await expect(vertical.locator('option', { hasText: /^キー数\/カナ$/ })).toHaveCount(1);
    // 積または比が一定になる列も選べない（アクション数/かなの逆の向きの文字/アクションと定数倍のアクション/文字、u/かなの定数倍のu/文字）
    await settings.getByLabel('横軸', { exact: true }).selectOption('perCharSteps');
    await expect(vertical.locator('option', { hasText: /^文字\/アクション$/ })).toHaveCount(0);
    await expect(vertical.locator('option', { hasText: /^アクション\/文字$/ })).toHaveCount(0);
    await settings.getByLabel('横軸', { exact: true }).selectOption('perCharUnits');
    await expect(vertical.locator('option', { hasText: /^u\/文字$/ })).toHaveCount(0);
    await expect(vertical.locator('option', { hasText: /^文字\/u$/ })).toHaveCount(0);
  });

  test('点にフォーカスすると、完全な名前と「(横, 縦)」と細い線の量の短い名前と値を出す', async ({ page }) => {
    const readout = feature(page).locator('[data-scatter-readout]');
    await expect(readout).toHaveCount(0);
    await pointOf(feature(page), 'layout:qwerty').focus();
    await expect(readout).toContainText('QWERTY');
    await expect(readout).toHaveText(/^QWERTY\S*　\(\d+\.\d{3}, \d+\.\d{3}\)　距離\/カナ \d+\.\d{3}$/);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await expect(readout).toHaveCount(0);
  });

  test('印が重なる点は名前を1つにまとめ、点は1つずつフォーカスして値を読める', async ({ page }) => {
    // 同じローマ字で打つQWERTYとDvorakは、1アクションあたりのキー数もアクション数/かなも同じで、印が重なる
    const settings = await openSettings(page);
    await selectOnlyPreset(settings, 'press');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('キー数/アクション');
    await expect(feature(page).locator('[data-scatter-point]')).toHaveCount(3);
    const grouped = feature(page).locator('[data-scatter-name="2"]');
    await expect(grouped).toHaveCount(1);
    await expect(grouped).toContainText('QWERTY');
    await expect(grouped).toContainText('Dvorak');
    await expect(feature(page).locator('[data-scatter-name="1"]')).toHaveCount(1);

    const readout = feature(page).locator('[data-scatter-readout]');
    const points = feature(page).locator('[data-scatter-point]');
    await points.nth(0).focus();
    await expect(readout).toContainText('QWERTY');
    await expect(grouped.locator('[data-scatter-name-of][data-active]')).toHaveText('QWERTY');
    await page.keyboard.press('Tab');
    await expect(readout).toContainText('Dvorak');
    await expect(grouped.locator('[data-scatter-name-of][data-active]')).toHaveText('Dvorak');
    await page.keyboard.press('Tab');
    await expect(readout).toContainText('JISかな配列');
    await expect(grouped.locator('[data-scatter-name-of][data-active]')).toHaveCount(0);
  });

  test('図の見方のⓘに、種類の色と形を書く', async ({ page }) => {
    await page.getByRole('button', { name: '図の見方の説明' }).first().click();
    await expect(page.getByText('赤の菱形はかな配列')).toBeVisible();
  });

  test('図の見方のⓘに、横軸・縦軸・細い線の量の説明と関係を書き、組み合わせを替えると追従する', async ({ page }) => {
    const settings = await openSettings(page);
    await selectOnlyPreset(settings, 'perPress');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('キー数/カナ');
    await page.getByRole('button', { name: '図の見方の説明' }).first().click();
    const dialog = page.getByRole('dialog', { name: '図の見方' });
    await expect(dialog.locator('.info-modal-item')).toHaveCount(3);
    await expect(dialog.locator('.info-modal-item dt')).toHaveText([
      '横軸　1カナあたりのキー数',
      '縦軸　1キーあたりの距離（u）',
      '細い線　1カナあたりの距離（u）',
    ]);
    await expect(dialog).toContainText('押したキー1つあたりの移動距離');
    await expect(dialog).toContainText('総移動距離 = キー数 × 1キーあたりの距離');
    // 軸の名前から比較表の列を探せるよう、量の説明に列名を添える
    await expect(dialog).toContainText('比較表の列名は「u/キー」');
    // 比較表の列名は比較表の見出しのとおりに引き、続く説明は散布図の単位の語で書く
    await expect(dialog).toContainText('比較表の列名は「キー数/かな」。入力1カナあたりに押すキーの数。');
    await expect(dialog).toContainText('距離の単位uは、キーの幅を1とした距離。');
  });

  test('組み合わせを複数選ぶと、選んだ組み合わせの図が一覧の順に並び、各図に題・軸の名前・図の見方がある', async ({ page }) => {
    const settings = await openSettings(page);
    await addPreset(settings, 'hand');
    await addPreset(settings, 'free');
    const figures = feature(page).locator('[data-scatter-figure]');
    await expect(figures).toHaveCount(3);
    await expect(figures.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-scatter-figure')))).resolves.toEqual([
      'distance',
      'hand',
      'free',
    ]);
    await expect(figureOf(page, 'distance').locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ');
    await expect(figureOf(page, 'hand').locator('[data-scatter-x-title]')).toHaveText('手の切り替えの回数');
    await expect(figureOf(page, 'free').locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ');
    await expect(figureOf(page, 'hand').locator('[data-scatter-caption]')).toHaveText('同じ手の続きの回数と手の切り替えの回数の関係');
    await expect(feature(page).getByRole('button', { name: '図の見方の説明' })).toHaveCount(3);
    // 点にブラウザのツールチップを出さない
    await expect(feature(page).locator('[data-scatter-point] title')).toHaveCount(0);
  });

  test('最後に残った組み合わせは外せない', async ({ page }) => {
    const settings = await openSettings(page);
    await expect(presetBox(settings, 'distance')).toBeChecked();
    await expect(presetBox(settings, 'distance')).toBeDisabled();
    await addPreset(settings, 'hand');
    await expect(presetBox(settings, 'distance')).toBeEnabled();
    await expect(presetBox(settings, 'hand')).toBeEnabled();
    await presetBox(settings, 'hand').uncheck();
    await expect(presetBox(settings, 'distance')).toBeDisabled();
    await expect(feature(page).locator('[data-scatter-figure]')).toHaveCount(1);
  });

  test('点にポインターを重ねると、他の図でも同じ対象の点が強調され、その図の値が出る', async ({ page }) => {
    await openWithPresets(page, ['distance', 'hand']);
    const distance = figureOf(page, 'distance');
    const hand = figureOf(page, 'hand');
    await pointOf(distance, 'layout:jis-kana').hover();
    for (const figure of [distance, hand]) {
      await expect(pointOf(figure, 'layout:jis-kana')).toHaveAttribute('data-active', 'true');
      await expect(figure.locator('[data-scatter-point][data-active]')).toHaveCount(1);
      await expect(figure.locator('[data-scatter-name-of="layout:jis-kana"]')).toHaveAttribute('data-active', 'true');
      await expect(figure.locator('[data-scatter-readout]')).toHaveCount(1);
      await expect(figure.locator('[data-scatter-readout]')).toContainText('JISかな配列');
    }
    // 図ごとの値を出す
    await expect(distance.locator('[data-scatter-readout]')).toContainText(/\(\d+\.\d{3}, \d+\.\d{3}\)　距離\/カナ \d+\.\d{3}/);
    await expect(hand.locator('[data-scatter-readout]')).toContainText(/\(\d+(\.\d+)?, \d+(\.\d+)?\)　同じ手の続きの割合 [\d.]+%/);
    await page.mouse.move(0, 0);
    await expect(feature(page).locator('[data-scatter-point][data-active]')).toHaveCount(0);
    await expect(feature(page).locator('[data-scatter-readout]')).toHaveCount(0);
  });

  test('点をクリックすると読み取りを留め、別の点に重ねると2点を並べ、外すと留めた1点に戻る', async ({ page }) => {
    await openWithPresets(page, ['distance', 'hand']);
    const distance = figureOf(page, 'distance');
    const hand = figureOf(page, 'hand');
    await pointOf(distance, 'layout:qwerty').click();
    for (const figure of [distance, hand]) {
      await expect(pointOf(figure, 'layout:qwerty')).toHaveAttribute('data-pinned', 'true');
      await expect(pointOf(figure, 'layout:qwerty')).toHaveAttribute('aria-pressed', 'true');
      await expect(figure.locator('[data-scatter-name-of="layout:qwerty"]')).toHaveAttribute('data-pinned', 'true');
      await expect(figure.locator('[data-scatter-readout="pinned"]')).toContainText('QWERTY');
    }
    // 留めた点の上にポインターがある間は、読み取りは1点のまま
    await expect(distance.locator('[data-scatter-readout]')).toHaveCount(1);
    // 別の図の別の点に重ねると、全ての図で2点の読み取りが並ぶ
    await pointOf(hand, 'layout:jis-kana').hover();
    for (const figure of [distance, hand]) {
      await expect(figure.locator('[data-scatter-readout="pinned"]')).toContainText('QWERTY');
      await expect(figure.locator('[data-scatter-readout="hover"]')).toContainText('JISかな配列');
      await expect(pointOf(figure, 'layout:jis-kana')).toHaveAttribute('data-active', 'true');
      await expect(pointOf(figure, 'layout:jis-kana')).not.toHaveAttribute('data-pinned', /.*/);
      await expect(pointOf(figure, 'layout:qwerty')).toHaveAttribute('data-pinned', 'true');
    }
    // ポインターを外すと、留めた1点に戻る
    await page.mouse.move(0, 0);
    for (const figure of [distance, hand]) {
      await expect(figure.locator('[data-scatter-readout]')).toHaveCount(1);
      await expect(figure.locator('[data-scatter-readout="pinned"]')).toContainText('QWERTY');
    }
    // 別の点をクリックすると、留める対象がその点に移る
    await pointOf(hand, 'layout:jis-kana').click();
    await expect(pointOf(distance, 'layout:jis-kana')).toHaveAttribute('data-pinned', 'true');
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(2);
    // 同じ点をもう一度クリックすると、留めるのをやめる
    await pointOf(hand, 'layout:jis-kana').click();
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(0);
  });

  test('Escで留めるのをやめ、Enterとスペースでも留める・やめるを切り替えられる', async ({ page }) => {
    await openWithPresets(page, ['distance', 'hand']);
    const distance = figureOf(page, 'distance');
    const hand = figureOf(page, 'hand');
    const qwerty = pointOf(distance, 'layout:qwerty');
    await qwerty.click();
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(0);

    await qwerty.focus();
    await page.keyboard.press('Enter');
    await expect(pointOf(hand, 'layout:qwerty')).toHaveAttribute('data-pinned', 'true');
    await page.keyboard.press('Enter');
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(0);
    await page.keyboard.press(' ');
    await expect(pointOf(hand, 'layout:qwerty')).toHaveAttribute('data-pinned', 'true');
    // フォーカスした別の点の読み取りが2点目として並ぶ
    await page.keyboard.press('Tab');
    await expect(distance.locator('[data-scatter-readout]')).toHaveCount(2);
    await page.keyboard.press(' ');
    await expect(feature(page).locator('[data-scatter-point][data-pinned]')).toHaveCount(2);
    await expect(feature(page).locator('[data-scatter-point][data-pinned]').first()).not.toHaveAttribute('data-scatter-point', 'layout:qwerty');
  });

  test('3つ選んだ状態で先頭の組み合わせを外すと、残りの図は同じ組み合わせの図のまま点が動かない', async ({ page }) => {
    const settings = await openSettings(page);
    await addPreset(settings, 'hand');
    await addPreset(settings, 'free');
    const hand = figureOf(page, 'hand');
    const qwerty = pointOf(hand, 'layout:qwerty');
    await expect(feature(page).locator('[data-scatter-figure]')).toHaveCount(3);
    const before = await qwerty.evaluate((element) => getComputedStyle(element).transform);
    await presetBox(settings, 'distance').uncheck();
    await expect(feature(page).locator('[data-scatter-figure]')).toHaveCount(2);
    await expect(figureOf(page, 'distance')).toHaveCount(0);
    await expect(figureOf(page, 'hand').locator('[data-scatter-x-title]')).toHaveText('手の切り替えの回数');
    await expect(figureOf(page, 'free').locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ');
    // 点の遷移（0.28秒）の途中で測っても、点は別の組み合わせの位置から動いてきた形にならない
    for (let sample = 0; sample < 4; sample++) {
      expect(await qwerty.evaluate((element) => getComputedStyle(element).transform)).toBe(before);
      await page.waitForTimeout(70);
    }
  });

  test('横軸と縦軸の選択は「自由に選ぶ」を含む時だけ出し、選べない組の知らせは「自由に選ぶ」の図にだけ出る', async ({ page }) => {
    const settings = await openSettings(page);
    await expect(settings.getByLabel('横軸', { exact: true })).toHaveCount(0);
    await addPreset(settings, 'hand');
    await addPreset(settings, 'free');
    await expect(settings.getByLabel('横軸', { exact: true })).toHaveCount(1);
    await page.goto('/analyzer/scatter?preset=distance,free&x=perCharSteps&y=perCharSteps');
    await expect(figureOf(page, 'free').locator('[data-scatter-axis-problem]')).toHaveCount(1, { timeout: 15_000 });
    await expect(figureOf(page, 'distance').locator('[data-scatter-point]')).toHaveCount(3);
    await expect(feature(page).locator('[data-scatter-axis-problem]')).toHaveCount(1);
  });

  test('列の数は幅で決まり、解析設定の列の数が上限になる', async ({ page }) => {
    await openWithPresets(page, ['distance', 'hand', 'free']);
    const settings = await openSettings(page);
    const columnsOf = () =>
      feature(page)
        .locator('.scatter-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    // 本文の幅に収まる最大の列（図の幅が下限を割らない範囲）。列の数は上限になる
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(columnsOf).toBe(3);
    await settings.getByRole('button', { name: '2', exact: true }).click();
    await expect.poll(columnsOf).toBe(2);
    await settings.getByRole('button', { name: '1', exact: true }).click();
    await expect.poll(columnsOf).toBe(1);
    await settings.getByRole('button', { name: '自動', exact: true }).click();
    await expect.poll(columnsOf).toBe(3);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(columnsOf).toBe(1);
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
    await expect(plot.locator('[data-scatter-x-title]')).toHaveText('アクション数/カナ');
  });

  test('Workspaceのペインは、ペインの幅に収まる列の数で図を並べる', async ({ page }) => {
    await page.setViewportSize({ width: 1900, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] })), {
      id: 'sc',
      name: '散布図',
      text: { ref: SHORT_TEXT_REF },
      panes: [
        {
          id: 'plot',
          analyzerId: 'scatter',
          options: { presets: ['distance', 'hand', 'free'] },
          binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, JIS_KANA, DVORAK], colorSlots: [0, 1, 2] } } },
        },
      ],
      grid: [{ id: 'plot', x: 0, y: 0, w: 22, h: 30 }],
    });
    await page.goto('/workspace/sc');
    await waitForHydration(page);
    const plot = page.locator('[data-pane-id="plot"] [data-react-feature="scatter"]').first();
    await expect(plot.locator('[data-scatter-figure]')).toHaveCount(3, { timeout: 20_000 });
    await expect(plot).toHaveAttribute('data-scatter-columns', '3');
    // 点の読み取りの連動は、Workspaceのペインでも同じ
    await pointOf(plot.locator('[data-scatter-figure="distance"]'), 'layout:jis-kana').focus();
    await expect(plot.locator('[data-scatter-point="layout:jis-kana"][data-active]')).toHaveCount(3);
  });
});

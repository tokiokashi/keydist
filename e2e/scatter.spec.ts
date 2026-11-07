import { SCATTER_PRESET_IDS, scatterPresetLabels, type ScatterPresetId } from '#analyzers/scatter/axes.ts';
import { expect, test, PAGE_TAG, type Locator, type Page } from './fixtures.ts';
import { openSettings } from './pane-helper.ts';
import { useShortText } from './short-text-helper.ts';

/**
 * 散布図のe2e。等位線の値・座標・名前の置き場所はunit testで固定しているので、
 * ここでは画面の配線（組み合わせの切り替えで軸の名前と点が替わる）だけを見る。
 */

const feature = (page: Page) => page.locator('[data-react-feature="scatter"]');
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

  test('組み合わせを切り替えると、軸の名前と点の位置が変わる', { tag: PAGE_TAG }, async ({ page }) => {
    const qwerty = pointOf(feature(page), 'layout:qwerty');
    const before = await qwerty.evaluate((element) => getComputedStyle(element).transform);
    const settings = await openSettings(page);
    await selectOnlyPreset(settings, 'press');
    await expect(feature(page).locator('[data-scatter-x-title]')).toHaveText('キー数/アクション');
    await expect(feature(page).locator('[data-scatter-y-title]')).toHaveText('アクション数/カナ');
    await expect(feature(page).locator('[data-scatter-contour]').first()).toHaveText(/^[\d.]+$/);
    await expect(feature(page).locator('[data-scatter-legend-contour]')).toHaveText('1カナ換算の押下数');
    await expect.poll(() => qwerty.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  });
});

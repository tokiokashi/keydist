import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { openSettings } from './pane-helper.ts';
import { SHORT_TEXT_REF } from './short-text-helper.ts';

/**
 * Run Chartのe2e。区間の集計・目安線・座標の計算はunit testで固定しているので、
 * ここでは画面の配線（重ねて描く・指標と窓幅の切り替え・押した点から打鍵再生へ移る）だけを見る。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const DVORAK = { kind: 'layout', layoutId: 'dvorak' };

const feature = (page: Page) => page.locator('[data-react-feature="run-chart"]');
const playback = (page: Page) => page.locator('[data-react-feature="playback"]');

/** 図の中の指定の割合の位置（プロット領域の左端が0、右端が1）を押す。 */
async function clickAt(page: Page, ratio: number): Promise<void> {
  const hit = feature(page).locator('[data-run-chart-hit]');
  const box = await hit.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * ratio, box!.y + box!.height / 2);
}

async function playbackPosition(page: Page): Promise<number> {
  const text = (await playback(page).locator('[data-playback-position]').textContent()) ?? '';
  const match = /^(\d+) \/ (\d+)ステップ$/.exec(text.trim());
  expect(match, text).not.toBeNull();
  return Number(match![1]);
}

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
            ],
          }),
        );
      }
    });
    await page.goto('/analyzer/run-chart');
    await expect(feature(page).locator('[data-run-chart-series]')).toHaveCount(2, { timeout: 15_000 });
  });

  test('2つの配列を同じ図に重ね、配列ごとに中心線と目安線を引き、図の線が何かを本文に書く', async ({ page }) => {
    await expect(feature(page).locator('[data-run-chart-line]')).toHaveCount(2);
    await expect(feature(page).locator('[data-run-chart-center]')).toHaveCount(2);
    await expect(feature(page).locator('[data-run-chart-guide="upper"]')).toHaveCount(2);
    await expect(feature(page).locator('[data-run-chart-guide="lower"]')).toHaveCount(2);
    await expect(feature(page).locator('[data-run-chart-guide-note]')).toContainText('細い線は目安線です');
    // 目安線の幅の求め方と、目安が統計的な保証でないことは、ⓘの説明に出す
    await expect(feature(page).locator('[data-run-chart-guide-note]')).not.toContainText('統計的な保証');
    await expect(feature(page).locator('[data-run-chart-window-note]')).toHaveCount(0);
  });

  test('ⓘの説明に、目安線の求め方・ランダムの作り方・順位の読み方を出し、優劣の注記は出さない', async ({ page }) => {
    await page.getByRole('button', { name: 'Run Chartの説明' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('統計的な保証ではなく、外れている箇所を探す目安です');
    await expect(dialog).toContainText('文節の区間の長さを並べ替えて作ります');
    await expect(dialog).toContainText('2/21の確率で端');
    await expect(dialog).toContainText('統計的に有意かどうかを示すものではありません');
    await expect(dialog).not.toContainText('優劣');
    await page.keyboard.press('Escape');
  });

  test('指標を切り替えると縦軸の見出しが替わり、窓幅を既定から変えるとペインの中に知らせる', async ({ page }) => {
    const title = feature(page).locator('[data-run-chart-y-title]');
    await expect(title).toContainText('1文字あたりの距離');
    const settings = await openSettings(page);
    await settings.getByLabel('指標').selectOption('sameFingerRate');
    await expect(title).toContainText('同指率');
    const window = settings.getByLabel('集計窓');
    await window.fill('20');
    await window.press('Enter');
    await expect(feature(page).locator('[data-run-chart-window-note]')).toContainText('集計窓は20文字です');
    await expect(title).toContainText('直近20文字');
  });

  test('区切りは既定で使わず、選ぶと区切りの位置を図に重ね、区切り方ごとの表と順位を出す', async ({ page }) => {
    const budouxRequests: string[] = [];
    page.on('request', (request) => {
      if (/budoux/.test(new URL(request.url()).pathname)) budouxRequests.push(request.url());
    });
    await expect(feature(page).locator('[data-run-chart-segments]')).toHaveCount(0);
    await expect(feature(page).locator('[data-run-chart-boundaries]')).toHaveCount(0);
    expect(budouxRequests).toEqual([]);

    const settings = await openSettings(page);
    await settings.getByLabel('区切り', { exact: true }).selectOption('bunsetsu');
    await expect(feature(page).locator('[data-run-chart-segmentation-note]')).toContainText('文節の区切りを図に重ね');
    await expect(feature(page).locator('[data-run-chart-boundaries]')).toHaveCount(1, { timeout: 15_000 });
    // 配列ごとに表のブロックを分ける
    await expect(feature(page).locator('[data-run-chart-segment-block]')).toHaveCount(2);
    await expect(feature(page).locator('[data-run-chart-segment-condition]').first()).toContainText('BudouX 0.10.0');
    // 乱数生成器と種の範囲は、対象が2つでも表の上に1回だけ出す
    await expect(feature(page).locator('[data-run-chart-segment-seed-range]')).toHaveCount(1);
    await expect(feature(page).locator('[data-run-chart-segment-seed-range]')).toContainText('mulberry32');
    await expect(feature(page).locator('[data-run-chart-segment-condition]').first()).not.toContainText('mulberry32');
    await expect(feature(page).locator('[data-run-chart-segment-rank]').first()).toContainText('21個のうち小さい方から');
    // 順位の注は本文に出さず、ⓘの説明に出す
    await expect(feature(page)).not.toContainText('有意');
    await expect(feature(page)).not.toContainText('優劣');
    expect(budouxRequests.length).toBeGreaterThan(0);

    // 区切り方を替えると、重ねる位置が替わる
    const before = await feature(page).locator('[data-run-chart-boundaries]').innerHTML();
    await settings.getByLabel('区切り', { exact: true }).selectOption('random');
    await expect(feature(page).locator('[data-run-chart-boundaries]')).not.toHaveJSProperty('innerHTML', before);
  });

  test('図を押すと、押した点の配列の打鍵再生へ、その文字位置のステップで一時停止して移り、URLに位置を残さない', async ({ page }) => {
    await clickAt(page, 0.5);
    await expect(page).toHaveURL(/\/analyzer\/playback/);
    await expect(playback(page)).toBeVisible({ timeout: 15_000 });
    expect(await playbackPosition(page)).toBeGreaterThan(0);
    await expect(playback(page).locator('[data-playback-action="toggle"]')).toContainText('再生');
    await expect(page).not.toHaveURL(/position=/);
  });

  test('キーボードでも点を選んで、Enterで打鍵再生へ移れる', async ({ page }) => {
    const hit = feature(page).locator('[data-run-chart-hit]');
    await hit.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(feature(page).locator('[data-run-chart-readout]')).toContainText('文字目');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/analyzer\/playback/);
    await expect(playback(page)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Workspace', () => {
  const pane = (page: Page, id: string) => page.locator(`.workspace-grid-item[data-pane-id="${id}"], .workspace-stack-pane[data-pane-id="${id}"]`);
  const cell = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

  async function open(page: Page, panes: readonly unknown[], grid: readonly unknown[]): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.addInitScript((value) => localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] })), {
      id: 'rc',
      name: 'Run Chartから打鍵再生へ',
      text: { ref: SHORT_TEXT_REF },
      panes,
      grid,
    });
    await page.goto('/workspace/rc');
    await waitForHydration(page);
  }

  const set = { kind: 'set', selection: { targets: [QWERTY, DVORAK], colorSlots: [0, 1] } };
  const chart = { id: 'chart', analyzerId: 'run-chart', binding: { mode: 'fixed', target: set } };
  const player = (id: string, target: unknown) => ({ id, analyzerId: 'playback', binding: { mode: 'fixed', target: { kind: 'single', target } } });

  test('押した点の配列と同じ対象を映す打鍵再生のペインだけが、その文字位置で一時停止する。映すペインが無い配列は知らせる', async ({ page }) => {
    await open(page, [chart, player('qwerty-player', QWERTY)], [cell('chart', 0, 0, 16, 14), cell('qwerty-player', 0, 14, 16, 20)]);
    const charts = pane(page, 'chart');
    await expect(charts.locator('[data-run-chart-series]')).toHaveCount(2, { timeout: 20_000 });
    await expect(charts.locator('[data-run-chart-no-playback]')).toContainText('Dvorak');
    await expect(charts.locator('[data-run-chart-no-playback]')).not.toContainText('QWERTY');

    const player0 = pane(page, 'qwerty-player').locator('[data-playback-position]');
    await expect(player0).toHaveText(/^0 \/ \d+ステップ$/);
    const hit = charts.locator('[data-run-chart-hit]');
    const box = await hit.boundingBox();
    // 2本の線のうちQWERTYの線の上を押す（Dvorakの点は移り先が無いので何も起きない）
    const qwertyLine = charts.locator('[data-run-chart-series] [data-run-chart-line]').first();
    const lineBox = await qwertyLine.boundingBox();
    expect(box).not.toBeNull();
    expect(lineBox).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * 0.5, lineBox!.y + lineBox!.height / 2);
    await expect(player0).not.toHaveText(/^0 \/ /);
    await expect(pane(page, 'qwerty-player').locator('[data-playback-action="toggle"]')).toContainText('再生');
  });
});

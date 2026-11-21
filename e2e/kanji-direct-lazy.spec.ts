import { expect, PAGE_TAG, test, type Page } from './fixtures.ts';

/**
 * 漢直の組み込みの配列（T-Code）の表は、配列を使う時にだけ取得する。表のファイルの取得は、ブラウザの通信でしか確かめられない。
 * 数値はunit test（`src/engine/layout-table-wait.test.ts` と回帰の固定値）で固定しているので、ここでは取得の配線だけを見る。
 */

const SINGLE_KEY = 'keydist:single-target-selection';
/** 開発サーバー（`tcode.json?raw`）と公開物（`tcode-<ハッシュ>.json`）のどちらでも当たる。`tut-code` には当たらない。 */
const TCODE_TABLE = /\/tcode[^/]*\.json/;

async function seedSingle(page: Page, layoutId: string) {
  await page.addInitScript(
    ([id, key]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    },
    [layoutId, SINGLE_KEY] as const,
  );
}

const feature = (page: Page) => page.locator('[data-react-feature="heatmap"]');
const diagram = (page: Page) => feature(page).locator('[data-heatmap-diagram]');

/** 見出しの対象の選択で、配列を選ぶ。 */
async function chooseTarget(page: Page, layoutId: string) {
  await page.getByRole('button', { name: /^対象: / }).click();
  await page.locator(`input[value="layout:${layoutId}"]`).click();
  await page.keyboard.press('Escape');
}

test('T-Codeを選ぶまで表を取得せず、選ぶと表を取得して図が出る', { tag: PAGE_TAG }, async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (TCODE_TABLE.test(request.url())) requested.push(request.url());
  });
  await seedSingle(page, 'qwerty');
  await page.goto('/analyzer/heatmap');
  await expect(diagram(page)).toBeVisible({ timeout: 10_000 });
  expect(requested).toEqual([]);

  await chooseTarget(page, 'tcode');
  await expect(diagram(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pane-error]')).toHaveCount(0);
  expect(requested.length).toBeGreaterThan(0);
});

test('表を取得できないと、その配列のペインにエラーが出て、ほかの配列は数値が出る。選び直すと取得し直す', async ({ page }) => {
  let blocked = true;
  await page.route(TCODE_TABLE, (route) => (blocked ? route.abort() : route.continue()));
  await seedSingle(page, 'tcode');
  await page.goto('/analyzer/heatmap');
  await expect(page.locator('[data-pane-error]')).toContainText('読み込めませんでした', { timeout: 10_000 });
  await expect(diagram(page)).toHaveCount(0);

  await chooseTarget(page, 'qwerty');
  await expect(diagram(page)).toBeVisible({ timeout: 10_000 });

  blocked = false;
  await chooseTarget(page, 'tcode');
  await expect(diagram(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pane-error]')).toHaveCount(0);
});

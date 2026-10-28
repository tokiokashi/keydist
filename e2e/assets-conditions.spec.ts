import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * データ・設定の管理の条件の設定のE2E。値の計算（継承する値・他の適用範囲の名前）はunit testが持つので、
 * ここでは画面の配線を見る: 適用範囲を選ぶと行が並ぶ、行の中で変えると選んだレベルに保存される、
 * 行のメニューが出ない、元に戻せる（Workspaceのレベルを含む）、動きが切り替わる。
 */

const SETUP_KEY = 'keydist:setup-library';
const WORKSPACES_KEY = 'keydist:workspaces';

interface StoredOverrides {
  global?: Record<string, unknown>;
  layout?: Record<string, Record<string, unknown>>;
  setup?: Record<string, Record<string, unknown>>;
}

const storedOverrides = async (page: Page): Promise<StoredOverrides> =>
  JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SETUP_KEY)) ?? '{}').overrides ?? {};

async function seed(page: Page, options: { overrides?: StoredOverrides; setups?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    (seedOptions) => {
      if (sessionStorage.getItem('seeded') !== null) return;
      sessionStorage.setItem('seeded', '1');
      const rows = ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
      localStorage.setItem(
        'keydist:user-layouts',
        JSON.stringify({
          version: 1,
          layouts: [
            { kind: 'alpha', id: 'user-a', name: '自作A', rows, romaji: 'rule-a' },
            { kind: 'alpha', id: 'user-b', name: '自作B', rows, romaji: 'kunrei' },
            { kind: 'alpha', id: 'user-broken', name: '使えない自作', rows: ['', '', '', ''] },
          ],
        }),
      );
      localStorage.setItem(
        'keydist:user-romaji-rules',
        JSON.stringify({
          version: 1,
          rules: [{ id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true }],
        }),
      );
      const setups = seedOptions.setups ? [{ id: 'setup-1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', label: '練習用' }] : [];
      localStorage.setItem('keydist:setup-library', JSON.stringify({ version: 1, setups, overrides: seedOptions.overrides ?? {} }));
    },
    { overrides: options.overrides, setups: options.setups === true },
  );
}

async function open(page: Page): Promise<void> {
  await page.goto('/assets');
  await waitForHydration(page);
}

const table = (page: Page) => page.locator('[data-user-assets-section="conditions"]');
const choose = (page: Page, key: string) => table(page).getByLabel('適用範囲を選ぶ').selectOption(key);

test('配列を選び、ローマ字規則を継承する値と違う値にすると配列のレベルに保存され、同じ値へ戻すと消える', async ({ page }) => {
  await seed(page);
  await open(page);
  await choose(page, 'layout:user-a');
  const row = table(page).locator('[data-item="romajiRuleId"]');
  // 配列の推奨が継承する値。上書きの印は付かない
  await expect(row.getByRole('combobox')).toHaveValue('rule-a');
  await expect(row).not.toHaveAttribute('data-changed', /.*/);
  await expect(table(page).locator('.condition-scope-menu')).toHaveCount(0);
  // 配列のレベルに置けない解釈の項目は出ない
  await expect(table(page).locator('[data-item="chainInterpretation"]')).toHaveCount(0);

  await row.getByRole('combobox').selectOption('azik');
  await expect.poll(async () => (await storedOverrides(page)).layout?.['user-a']?.romajiRuleId).toBe('azik');
  await expect(row).toHaveAttribute('data-changed', 'true');
  const list = page.locator('[data-user-assets-section="overrides"]');
  await expect(list.locator('[data-user-assets-override-group="layout:user-a"]')).toContainText('ローマ字規則: AZIK');

  await row.getByRole('combobox').selectOption('rule-a');
  await expect.poll(async () => (await storedOverrides(page)).layout?.['user-a']?.romajiRuleId).toBeUndefined();
  await expect(list.locator('[data-user-assets-override-group="layout:user-a"]')).toHaveCount(0);
});

test('全体とSetupを選んだ時も、それぞれのレベルに書ける。Setupに書いた値はSetupの画面で同じ値に見える', async ({ page }) => {
  await seed(page, { setups: true });
  await open(page);
  // 全体に上書きが1つも無くても選べる。解釈の項目の行も出る
  await expect(table(page).getByLabel('適用範囲を選ぶ')).toHaveValue('global');
  await expect(table(page).locator('[data-item="chainInterpretation"]')).toHaveCount(1);
  await table(page).locator('[data-item="windowSize"]').getByRole('button', { name: '先読みNを1増やす' }).click();
  await expect.poll(async () => (await storedOverrides(page)).global?.windowSize).toBe(4);

  await choose(page, 'setup:setup-1');
  await expect(table(page).locator('[data-item="chainInterpretation"]')).toHaveCount(0);
  await expect(table(page).locator('[data-item="defaultShapeId"]')).toHaveCount(0);
  // 全体で変えた値を継承しているので、4から始まる
  const window = table(page).locator('[data-item="windowSize"]');
  await expect(window.getByRole('status')).toHaveText('4');
  await window.getByRole('button', { name: '先読みNを1増やす' }).click();
  await expect.poll(async () => (await storedOverrides(page)).setup?.['setup-1']?.windowSize).toBe(5);
  // 他の適用範囲の上書きの名前が行に出る
  await expect(window.locator('[data-condition-others]')).toContainText('全体');

  await page.goto('/setup?setup=setup-1');
  await waitForHydration(page);
  await expect(page.locator('[data-item="windowSize"]').getByRole('status')).toHaveText('5');
});

test('Workspaceの適用範囲に書いた値は、そのWorkspaceに保存され、元に戻すと戻る', async ({ page }) => {
  await seed(page);
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\//);
  await page.locator('#app-sidebar').getByRole('link', { name: 'データ・設定の管理', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);

  const workspaceKey = await table(page).getByLabel('適用範囲を選ぶ').locator('optgroup[label="Workspace"] option').first().getAttribute('value');
  expect(workspaceKey).toMatch(/^workspace:/);
  await choose(page, workspaceKey!);
  const window = table(page).locator('[data-item="windowSize"]');
  await window.getByRole('button', { name: '先読みNを1増やす' }).click();
  const workspaceConditions = async () =>
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').workspaces?.[0]?.conditions, WORKSPACES_KEY);
  await expect.poll(workspaceConditions).toEqual({ windowSize: 4 });
  // 全体には入らない
  expect((await storedOverrides(page)).global?.windowSize).toBeUndefined();
  await expect(page.locator('[data-user-assets-override-group^="workspace:"]')).toContainText('先読みN: 4');

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(workspaceConditions).toBeUndefined();
  await expect(window.getByRole('status')).toHaveText('3');
  await expect(page.locator('[data-user-assets-override-group^="workspace:"]')).toHaveCount(0);
});

test('計算に使えない自作の配列を選ぶと、行は出ず、値を出せない旨が出る', async ({ page }) => {
  await seed(page);
  await open(page);
  await choose(page, 'layout:user-broken');
  await expect(table(page).locator('[data-conditions-unavailable]')).toContainText('計算に使えないため、値を出せません');
  await expect(table(page).locator('.condition-row')).toHaveCount(0);
});

test('適用範囲を選び直すと動きを伴って切り替わり、動きを減らす設定では動かない', async ({ page }) => {
  await seed(page);
  await open(page);
  const animationName = () =>
    table(page)
      .locator('.conditions-table-body')
      .evaluate((node) => getComputedStyle(node).animationName);
  await choose(page, 'layout:user-a');
  expect(await animationName()).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await choose(page, 'layout:user-b');
  expect(await animationName()).toBe('none');
});

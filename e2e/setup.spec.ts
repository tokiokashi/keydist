import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Setupの画面のE2E。作成・複製・付け替えの分岐と取り消しの照合はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、作る・名前を変える・複製・物理配列を選び直す・元に戻せる、
 * 同じ配列で物理配列の違う2つのSetupをWorkspaceの2つのペインに置ける、/assetsの一覧から削除できる。
 */

const STORAGE_KEY = 'keydist:setup-library';

interface StoredSetups {
  readonly setups: readonly { id: string; number: number; layoutId: string; shapeId: string; label?: string }[];
}

const stored = async (page: Page): Promise<StoredSetups> =>
  JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)) ?? '{"setups":[]}');

async function createSetup(page: Page, shapeName: string, name?: string): Promise<void> {
  await page.getByLabel('作るSetupの物理配列を選ぶ').selectOption({ label: shapeName });
  if (name !== undefined) await page.getByLabel('Setupの名前').fill(name);
  await page.locator('[data-setup-create]').click();
}

test('Setupを作り、名前の変更・複製・物理配列の選び直しをして、元に戻せる。/assetsの一覧から削除できる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Setup', exact: true, level: 1 })).toBeVisible();

  await createSetup(page, 'ロウスタッガード（ANSI）', '練習用');
  await expect(page.locator('[data-setup-row]')).toHaveCount(1);
  await expect.poll(async () => (await stored(page)).setups.map((setup) => [setup.layoutId, setup.label])).toEqual([['qwerty', '練習用']]);

  // 名前の変更
  await page.getByRole('button', { name: '「練習用」の名前を変更' }).click();
  await page.getByLabel('新しい名前').fill('本番用');
  await page.getByLabel('新しい名前').press('Enter');
  await expect.poll(async () => (await stored(page)).setups[0]?.label).toBe('本番用');

  // 複製: 番号は手持ちの最大+1
  await page.getByRole('button', { name: '「本番用」を複製' }).click();
  await expect(page.locator('[data-setup-row]')).toHaveCount(2);
  await expect.poll(async () => (await stored(page)).setups.map((setup) => setup.number)).toEqual([1, 2]);

  // 物理配列の選び直し
  const before = (await stored(page)).setups[1]!.shapeId;
  const select = page.getByLabel('このSetupの物理配列を選ぶ');
  const options = await select.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  const next = options.find((value) => value !== before)!;
  await select.selectOption(next);
  await expect.poll(async () => (await stored(page)).setups[1]?.shapeId).toBe(next);

  // 元に戻す: 物理配列、複製の順に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page)).setups[1]?.shapeId).toBe(before);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page)).setups.length).toBe(1);

  // /assetsの一覧から削除できる（確認を挟む）
  await page.goto('/assets');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '「本番用」を削除' }).click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect.poll(async () => (await stored(page)).setups.length).toBe(0);
});

test('同じ配列で物理配列の違う2つのSetupを作り、Workspaceの2つの打鍵再生ペインに置ける', async ({ page }) => {
  await page.goto('/setup');
  await waitForHydration(page);
  await createSetup(page, 'ロウスタッガード（ANSI）');
  await expect(page.locator('[data-setup-row]')).toHaveCount(1);
  await createSetup(page, 'オーソリニア（ANSI）');
  await expect(page.locator('[data-setup-row]')).toHaveCount(2);
  const shapeNames = ['ロウスタッガード（ANSI）', 'オーソリニア（ANSI）'];
  const setups = (await stored(page)).setups;
  expect(setups.map((setup) => setup.layoutId)).toEqual(['qwerty', 'qwerty']);
  expect(new Set(setups.map((setup) => setup.shapeId)).size).toBe(2);

  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: /打鍵再生/ }).click();
  }
  const panes = page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: '打鍵再生', exact: true }) });
  await expect(panes).toHaveCount(2);

  const names: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const pane = panes.nth(i);
    const button = pane.locator('.target-selection-button');
    await button.click();
    const dialog = page.getByRole('dialog', { name: '対象の選択' });
    await dialog.locator(`input[value="setup:${setups[i]!.id}"]`).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // 同じ配列でも、物理配列の違いが名前に出る
    await expect(button).toHaveAttribute('title', new RegExp(`^QWERTY/${shapeNames[i]}`));
    names.push((await button.getAttribute('title')) ?? '');
  }
  expect(names[0]).not.toBe(names[1]);
});

test('Setupを対象にしたペインの条件のモーダルから、そのSetupを/setupで開ける。複数の対象ではSetupごとにリンクが出る', async ({ page }) => {
  await page.goto('/setup');
  await waitForHydration(page);
  await createSetup(page, 'ロウスタッガード（ANSI）', '一つ目');
  await expect(page.locator('[data-setup-row]')).toHaveCount(1);
  await createSetup(page, 'オーソリニア（ANSI）', '二つ目');
  await expect(page.locator('[data-setup-row]')).toHaveCount(2);
  const setups = (await stored(page)).setups;

  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (const name of ['打鍵再生', '比較表']) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  }
  const paneOf = (name: string) => page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });

  const playback = paneOf('打鍵再生');
  await playback.locator('.target-selection-button').click();
  await page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="setup:${setups[0]!.id}"]`).click();
  await page.keyboard.press('Escape');
  await playback.locator('.pane-condition-trigger').click();
  const single = page.getByRole('dialog', { name: '条件' });
  await expect(single.getByRole('link', { name: 'このSetupの物理配列と条件を編集' })).toHaveAttribute('href', new RegExp(`/setup\\?setup=${setups[0]!.id}$`));
  await page.keyboard.press('Escape');

  const comparison = paneOf('比較表');
  await comparison.locator('.target-selection-button, .pane-empty-button').first().click();
  const dialog = page.getByRole('dialog', { name: '対象の選択' });
  for (const setup of setups) await dialog.locator(`input[value="setup:${setup.id}"]`).click();
  await page.keyboard.press('Escape');
  await comparison.locator('.pane-condition-trigger').click();
  const many = page.getByRole('dialog', { name: '条件' });
  await expect(many.getByRole('link', { name: /の物理配列と条件を編集$/ })).toHaveCount(2);
  await expect(many.getByRole('link', { name: '「一つ目」の物理配列と条件を編集' })).toBeVisible();
  await expect(many.getByRole('link', { name: '「二つ目」の物理配列と条件を編集' })).toBeVisible();
});

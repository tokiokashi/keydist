import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceの書き出し・読み込み。Workspaceの画面から書き出し、サイドバーから読み込んで同じWorkspaceに戻ることを、
 * ブラウザの操作で1件確かめる。突き合わせの場合分け（名前だけの違い・参照先の注記など）は計算で判定できるのでunit testが見る。
 */

const WORKSPACES_KEY = 'keydist:workspaces';

async function stored(page: Page): Promise<{ id: string; name: string; conditions?: Record<string, unknown> }[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), WORKSPACES_KEY);
  return (JSON.parse(raw ?? '{"workspaces":[]}') as { workspaces: { id: string; name: string }[] }).workspaces;
}

const notice = (page: Page) => page.locator('[data-imported-workspaces-notice]');

async function importFile(page: Page, content: string) {
  await page.getByLabel('読み込むWorkspaceのファイル').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
}

test('書き出したWorkspaceを、削除した後に読み込むと同じWorkspaceに戻る。読み直しても増えず、中身が違えば別名で足す', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('.hero').getByRole('button', { name: '複数の配列を並べたサンプルを作る' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  await expect(page.locator('.pane-frame')).toHaveCount(10);
  const original = (await stored(page))[0]!;

  // 書き出す: ファイル名にWorkspaceの名前が入り、プリセットと同じ封筒でWorkspaceだけを持つ
  const downloading = page.waitForEvent('download');
  await page.locator('.context-bar').getByRole('button', { name: 'Workspaceの操作' }).click();
  await page.getByRole('menuitem', { name: '書き出す' }).click();
  const download = await downloading;
  const text = await readFile((await download.path())!, 'utf8');
  const file = JSON.parse(text);
  expect(file).toMatchObject({ format: 'keydist-presets', version: 2 });
  expect(Object.keys(file)).toEqual(['format', 'version', 'workspaces']);
  expect(file.workspaces).toHaveLength(1);

  // 削除してから読み込むと、同じidのまま足されて、そのWorkspaceが開く。保存した中身も同じ
  await page.locator('.context-bar').getByRole('button', { name: 'Workspaceの操作' }).click();
  await page.getByRole('menuitem', { name: '削除' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await stored(page)).toEqual([]);
  await importFile(page, text);
  await expect(page).toHaveURL(new RegExp(`/workspace/${original.id}$`));
  await expect(notice(page).locator('[data-imported-workspaces-summary]')).toHaveText('1件のWorkspaceを読み込みました');
  await expect(page.locator('.pane-frame')).toHaveCount(10);
  expect(await stored(page)).toEqual([original]);

  // 同じファイルをもう一度読んでも増えない
  await importFile(page, text);
  await expect(notice(page).locator('[data-imported-workspaces-summary]')).toHaveText('読み込んだWorkspaceはありません。同じ中身のものが既にあります');
  expect(await stored(page)).toEqual([original]);

  // 同じidで中身が違うファイルは、手元を残して別の名前で足す。読み直しても増えない
  const changed = { ...file, workspaces: [{ ...file.workspaces[0], conditions: { ...file.workspaces[0].conditions, windowSize: 6 } }] };
  await importFile(page, JSON.stringify(changed));
  await expect(notice(page).locator('[data-imported-workspaces-summary]')).toHaveText('1件のWorkspaceを読み込みました');
  await expect(notice(page)).toContainText('「サンプル (2)」は、同じWorkspaceで中身の違うものが既にあるため、別の名前で追加しました');
  const after = await stored(page);
  expect(after.map((workspace) => workspace.name)).toEqual([original.name, 'サンプル (2)']);
  expect(after[0]).toEqual(original);
  expect(after[1]!.id).not.toBe(original.id);
  expect(after[1]!.conditions).toMatchObject({ windowSize: 6 });
  await expect(page).toHaveURL(new RegExp(`/workspace/${after[1]!.id}$`));
  await importFile(page, JSON.stringify(changed));
  await expect(notice(page).locator('[data-imported-workspaces-summary]')).toHaveText('読み込んだWorkspaceはありません。同じ中身のものが既にあります');
  expect(await stored(page)).toEqual(after);
});

test('読み込めないファイルは、理由を文で伝え、Workspaceを変えない', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const cases: readonly [string, string][] = [
    ['{ 壊れた', '条件ファイルとして読めませんでした'],
    ['{"version":2,"workspaces":[]}', 'keydist の条件ファイルではありません'],
    ['{"format":"keydist-presets","version":2,"presets":[{"id":"a","name":"A","values":{}}]}', 'このファイルにWorkspaceは含まれていません'],
  ];
  for (const [content, message] of cases) {
    await importFile(page, content);
    await expect(notice(page).locator('[data-imported-workspaces-summary]')).toHaveText(message);
    await expect(page).toHaveURL(/\/$/);
  }
  expect(await stored(page)).toEqual([]);
});

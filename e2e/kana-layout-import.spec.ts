import { expect, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * かな配列の画面で定義ファイルを取り込む操作のE2E。面の形への変換は unit testが持つので、
 * ここでは画面の配線を見る: 取り込むと保存していない新しい配列として開く、保存すると対象の選択に並ぶ、
 * 取り込めないファイルは取り込まずにその旨が出る。
 */

const DVORAKJ = [
  '-option-input[',
  '  {S} | +shift',
  ']',
  '[',
  '  |||',
  '  き|く|け|',
  '  あ|い|う|',
  '  |||',
  ']',
  '({S}[',
  '  |||',
  '  ぎ|ぐ|げ|',
  '  |||',
  '  |||',
  ']',
].join('\n');

const file = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf-8') });

test('定義ファイルを取り込むと新しい配列の下書きで開き、保存すると対象の選択に並ぶ', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);

  await page.locator('[data-kana-import-file]').setInputFiles(file('私の配列.txt', DVORAKJ));
  await expect(page.locator('[data-kana-file-import="ok"]')).toBeVisible();
  await expect(page.locator('[data-face-name]')).toHaveValue('私の配列');
  // 面は、triggerの無い面と、親指の面の2つ
  await expect(page.locator('[data-face-pick]')).toHaveCount(2);
  await expect(page.locator('[data-face-figure] [data-key-id="a"] .physical-keyboard-legend')).toHaveText('あ');

  // 保存するまでは資産に入らない
  const stored = () => page.evaluate(() => localStorage.getItem('keydist:user-layouts'));
  expect(await stored()).toBeNull();

  const submit = page.locator('[data-face-submit]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('[data-kana-pick]')).toHaveValue(/^user-/);
  await expect.poll(stored).toContain('私の配列');
  await expect.poll(stored).toContain('"simultaneous"');

  const id = await page.locator('[data-kana-pick]').inputValue();
  await page.goto('/');
  await waitForHydration(page);
  await page
    .locator('.hero')
    .getByRole('button', { name: /^対象: / })
    .click();
  await expect(page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${id}"]`)).toHaveCount(1);
});

test('既に配列を開いている時も、取り込みは新しい配列になり、開いていた配列を置き換えない', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);
  await page.locator('[data-face-name]').fill('元の配列');
  await page.locator('[data-face-figure] [data-key-id="a"]').click();
  await page.locator('[data-face-output]').fill('あ');
  await page.locator('[data-face-submit]').click();
  const originalId = await page.locator('[data-kana-pick]').inputValue();

  await page.locator('[data-kana-import-file]').setInputFiles(file('取り込み.txt', DVORAKJ));
  await expect(page.locator('[data-face-name]')).toHaveValue('取り込み');
  await page.locator('[data-face-submit]').click();

  const options = page.locator('[data-kana-pick] option');
  await expect(options).toHaveCount(2);
  await expect(page.locator('[data-kana-pick]')).not.toHaveValue(originalId);
  await page.locator('[data-kana-pick]').selectOption(originalId);
  await expect(page.locator('[data-face-name]')).toHaveValue('元の配列');
});

test('取り込めないセルがあれば注意が出て、形式が分からないファイルとかなを含まない定義は取り込まれない', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);
  const input = page.locator('[data-kana-import-file]');

  // triggerのキー自身の位置のセルは取り込めない旨が出る
  const withTriggerCell = ['-option-input[', '  {A} | +1e', ']', '({A}[', '  |||', '  |||', '  あ|い|う|', ']', '[', '  |||', '  き|', ']'].join('\n');
  await input.setInputFiles(file('注意.txt', withTriggerCell));
  await expect(page.locator('[data-kana-file-warnings]')).toContainText('自身の位置にあるため取り込みませんでした');

  // 取り込めないファイルは、今の下書きを替えずにその旨を出す
  await page.locator('[data-face-name]').fill('下書きのまま');
  await input.setInputFiles(file('layout.csv', 'a,b'));
  await expect(page.locator('[data-kana-file-import="error"]')).toContainText('取り込める形式ではありません');
  await input.setInputFiles(file('romaji.txt', '[\n  ka|si|tu|ne|\n  q|w|e|r|\n]'));
  await expect(page.locator('[data-kana-file-import="error"]')).toContainText('かな配列ではない');
  await input.setInputFiles(file('keyboard.vil', '{}'));
  await expect(page.locator('[data-kana-file-import="error"]')).toContainText('Vial');
  await expect(page.locator('[data-face-name]')).toHaveValue('下書きのまま');
});

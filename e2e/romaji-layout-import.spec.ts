import { expect, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * ローマ字配列の画面で定義ファイルを取り込む操作のE2E。段の形への変換はunit testが持つので、
 * ここでは画面の配線を見る: 取り込むと保存していない新しい配列として開く、保存すると対象の選択に並ぶ、
 * 取り込めない箇所の注意が出る、取り込めないファイルは取り込まずにその旨が出る。
 */

const STORAGE_KEY = 'keydist:user-layouts';

const vial = (combos: string[][]) =>
  JSON.stringify({
    layout: [
      [
        ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_ENTER'],
        ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
        ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCOLON', 'KC_QUOTE'],
        ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
      ],
    ],
    macro: [[['text', 'desu']], [['tap', 'KC_K', 'KC_A']]],
    combo: combos,
  });

const DESU = ['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0'];
const KA = ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'M1'];
const DOT_ON_KA = ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'KC_DOT'];
const MOMENTARY = ['MO(1)', 'KC_A', 'KC_NO', 'KC_NO', 'KC_B'];

const VIAL = vial([DESU, KA, MOMENTARY]);

const ROMAJI_DVORAKJ = [
  '-option-input[',
  '  {S} | +shift',
  ']',
  '[',
  '  |||',
  '  k|a|t|',
  '  s|i|u|',
  '  |||',
  ']',
  '({S}[',
  '  |||',
  '  g|z|d|',
  '  |||',
  '  |||',
  ']',
].join('\n');

const ROMAJI_BENIZARA = ['[ローマ字シフト無し]', 'a,b,・,d', 'e,f,g,h', 'i,j,k,l', 'm,n,o,p'].join('\n');

const KANA_DVORAKJ = ['[', '  |||', '  き|く|け|', '  あ|い|う|', '  |||', ']'].join('\n');

const file = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf-8') });

test('Vialの定義を取り込むと新しい配列の下書きで開き、注意が出る。保存すると対象の選択に並ぶ', async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);

  await page.locator('[data-layout-import-file]').setInputFiles(file('私のVial.vil', VIAL));
  await expect(page.locator('[data-layout-file-import="ok"]')).toBeVisible();
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('私のVial');
  await expect(page.locator('[data-layout-imported-row="1"]')).toHaveText('qwertyuiop[]');
  await expect(page.locator('[data-layout-imported-summary]')).toContainText('同時押しなどで出す出力が2件');
  await expect(page.locator('[data-layout-file-warnings]')).toContainText('MO(1)');

  // 保存するまでは資産に入らない
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(await stored()).toBeNull();

  await page.locator('[data-layout-submit]').click();
  await expect(page.locator('[data-layout-pick]')).toHaveValue(/^user-/);
  await expect.poll(stored).toContain('"desu"');

  const id = await page.locator('[data-layout-pick]').inputValue();
  await page.goto('/');
  await waitForHydration(page);
  await page
    .locator('.hero')
    .getByRole('button', { name: /^対象: / })
    .click();
  await expect(page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${id}"]`)).toHaveCount(1);
});

test('同じキーの同時押しが2つの出力になるVialの定義は、組み立てられない旨が出て保存できない', async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);
  await page.locator('[data-layout-import-file]').setInputFiles(file('conflict.vil', vial([DESU, DOT_ON_KA, KA, MOMENTARY])));
  await expect(page.locator('[data-layout-file-import="ok"]')).toBeVisible();
  await expect(page.locator('[data-layout-problem="error"]')).toContainText('配列として組み立てられません');
  await expect(page.locator('[data-layout-submit]')).toBeDisabled();
});

test('かなを含まないDvorakJの定義と、中黒を出す紅皿の定義を取り込める', async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);
  const input = page.locator('[data-layout-import-file]');

  await input.setInputFiles(file('romaji.txt', ROMAJI_DVORAKJ));
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('romaji');
  await expect(page.locator('[data-layout-imported-summary]')).toContainText('同時押しなどで出す出力が3件');

  await input.setInputFiles(file('benizara.bnz', ROMAJI_BENIZARA));
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('benizara');
  await expect(page.locator('[data-layout-imported-row="0"]')).toContainText('ab・d');
  await page.locator('[data-layout-submit]').click();
  await expect(page.locator('[data-layout-pick]')).toHaveValue(/^user-/);
});

test('取り込めないファイルは取り込まずにその旨が出る。かなの定義にはかな配列の画面へのリンクが付く', async ({ page }) => {
  await page.goto('/romaji-layout');
  await waitForHydration(page);
  const input = page.locator('[data-layout-import-file]');

  await page.getByLabel('名前', { exact: true }).fill('下書きのまま');
  await input.setInputFiles(file('layout.csv', 'a,b'));
  await expect(page.locator('[data-layout-file-import="error"]')).toContainText('取り込める形式ではありません');
  await input.setInputFiles(file('かな.txt', KANA_DVORAKJ));
  await expect(page.locator('[data-layout-file-import="error"]')).toContainText('かなを直接打つ定義');
  const kanaVial = VIAL.replace('"desu"', '"です"');
  await input.setInputFiles(file('kana.vil', kanaVial));
  await expect(page.locator('[data-layout-file-import="error"]')).toContainText('かなを出力するVial');
  await expect(page.locator('[data-layout-file-import="error"] a')).toHaveCount(0);
  // 取り込めなかった間、今の下書きは替わらない
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('下書きのまま');

  await input.setInputFiles(file('かな.txt', KANA_DVORAKJ));
  await page.locator('[data-layout-file-import="error"] a').click();
  await expect(page).toHaveURL(/\/kana-layout$/);
});

test('かな配列の画面でかなを含まない定義を選ぶと、ローマ字配列の画面へのリンクが付く', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);
  await page.locator('[data-kana-import-file]').setInputFiles(file('romaji.txt', ROMAJI_DVORAKJ));
  await expect(page.locator('[data-kana-file-import="error"]')).toContainText('かな配列ではない');
  await page.locator('[data-kana-file-import="error"] a').click();
  await expect(page).toHaveURL(/\/romaji-layout$/);
});

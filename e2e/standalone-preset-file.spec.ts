import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * プリセットの書き出し・読み込み（条件のモーダル）のE2E。
 * 書き出したファイルを読み込み直す往復と、壊れたファイルの文言、読み込んだだけでは条件が変わらないことを見る。
 * 保存・流し込みなど節そのものは`standalone-condition-presets.spec.ts`が見る。
 */

/**
 * アンカーに指定したファイル名を控える。LANG未設定（C/POSIX）のLinuxのChromiumは、日本語のファイル名を
 * ダウンロードイベントの`suggestedFilename()`で「download」にする（名前をUTF-8へ変換できないため）。
 * 実行環境のロケールに左右されないよう、こちらで名前を確かめる。
 */
async function recordDownloadNames(page: Page) {
  await page.addInitScript(() => {
    const names: string[] = [];
    (window as unknown as { __downloadNames: string[] }).__downloadNames = names;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download !== '') names.push(this.download);
      click.call(this);
    };
  });
}

const downloadNames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __downloadNames: string[] }).__downloadNames);

async function openPresets(page: Page): Promise<{ modal: Locator; section: Locator }> {
  await recordDownloadNames(page);
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await page.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  const section = modal.locator('[data-condition-presets]');
  await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
  return { modal, section };
}

async function savePreset(section: Locator, name: string) {
  await section.getByLabel('プリセットの名前').fill(name);
  await section.getByRole('button', { name: '今の全体の値を保存' }).click();
}

async function importText(section: Locator, content: string | Buffer, name = 'presets.json') {
  await section.getByLabel('読み込むプリセットのファイル').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
}

const result = (section: Locator) => section.locator('[data-preset-result]');

test('書き出したファイルを読み込み直すと、同名は番号付きで追加され、条件は変わらない。元に戻せる', async ({ page }) => {
  const { modal, section } = await openPresets(page);
  const up = modal.getByRole('button', { name: '先読みNを1増やす' });
  await up.click();
  await up.click();
  await savePreset(section, '自分用メモ');
  await savePreset(section, '比較用（N=5）');
  await modal.getByRole('button', { name: 'すべて既定値に戻す' }).click();
  await expect(modal.locator('[data-changed]')).toHaveCount(0);

  const downloading = page.waitForEvent('download');
  await section.getByRole('button', { name: 'すべて書き出す' }).click();
  const download = await downloading;
  expect((await downloadNames(page))[0]).toMatch(/^keydist-プリセット-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, 'utf8');
  const file = JSON.parse(text);
  expect(file).toMatchObject({ format: 'keydist-presets', version: 1 });
  expect(file.presets.map((preset: { name: string }) => preset.name)).toEqual(['自分用メモ', '比較用（N=5）']);
  await expect(result(section)).toContainText('2件のプリセットを書き出した');

  await importText(section, text);
  // 同じファイルを続けて選べるよう、読み込みの後に選択を空へ戻している
  await expect(section.getByLabel('読み込むプリセットのファイル')).toHaveValue('');
  await expect(result(section)).toContainText('2件のプリセットを読み込んだ');
  await expect(section.locator('summary')).toHaveText('プリセット（4）');
  await expect(section.locator('.condition-preset-name')).toHaveText(['自分用メモ', '比較用（N=5）', '自分用メモ 2', '比較用（N=5） 2']);
  // 読み込んだだけでは条件は変わらない
  await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('3');
  await expect(modal.locator('[data-changed]')).toHaveCount(0);

  // 同じファイルをもう一度選んでも読み込める。結果の行から元に戻すと、その読み込みだけが消える
  await importText(section, text);
  await expect(section.locator('summary')).toHaveText('プリセット（6）');
  await result(section).getByRole('button', { name: '元に戻す' }).click();
  await expect(section.locator('summary')).toHaveText('プリセット（4）');

  // 読み込んだプリセットは、流し込んで初めて条件になる
  await section.locator('.condition-preset-row').filter({ hasText: '自分用メモ 2' }).getByRole('button', { name: /を流し込む$/ }).click();
  await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('5');
});

test('1件だけ書き出せる。ファイル名にプリセット名が入る', async ({ page }) => {
  const { section } = await openPresets(page);
  await savePreset(section, '自分用メモ');
  await savePreset(section, '比較用（N=5）');

  const downloading = page.waitForEvent('download');
  await section.locator('.condition-preset-row').filter({ hasText: '比較用' }).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: '書き出す' }).click();
  const download = await downloading;
  expect(await downloadNames(page)).toEqual(['keydist-プリセット-比較用（N=5）.json']);
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(file.presets.map((preset: { name: string }) => preset.name)).toEqual(['比較用（N=5）']);
  await expect(result(section)).toContainText('「比較用（N=5）」を書き出した');
});

test('読み込めないファイルは、理由を文で伝え、プリセットを変えない', async ({ page }) => {
  const { section } = await openPresets(page);
  await savePreset(section, '自分用メモ');
  const cases: readonly [string, string | Buffer, string][] = [
    ['壊れたJSON', '{ 壊れた', '条件ファイルとして読めませんでした'],
    ['印が無い', '{"version":1,"presets":[]}', 'keydist の条件ファイルではありません'],
    ['旧画面の形式', '{"version":4,"conditions":{"defaults":{}}}', '旧画面の条件ファイルは読み込めません'],
    ['新しい版', '{"format":"keydist-presets","version":2,"presets":[]}', '新しい形式のファイルです。keydist を更新してから読み込んでください'],
    ['形が正しくない', '{"format":"keydist-presets","presets":[]}', 'ファイルの形式が正しくありません'],
    ['大きすぎる', Buffer.alloc(1024 * 1024 + 1, 32), 'ファイルが大きすぎます'],
  ];
  for (const [label, content, message] of cases) {
    await importText(section, content);
    await expect(result(section), label).toContainText(message);
    await expect(result(section).getByRole('button', { name: '元に戻す' }), label).toHaveCount(0);
  }
  await expect(section.locator('summary')).toHaveText('プリセット（1）');
});

test('一部の値だけ読めない時は、読める分を読み込み、項目名で伝える。原文は詳細に入る', async ({ page }) => {
  const { section } = await openPresets(page);
  const file = {
    format: 'keydist-presets',
    version: 1,
    presets: [
      { id: 'x', name: '自分用メモ', values: { windowSize: 4, sfbHomeCost: 'yes', futureItem: 1, fingerAssignmentId: 'from-elsewhere' } },
    ],
  };
  await importText(section, JSON.stringify(file));
  const row = result(section);
  await expect(row).toContainText('1件のプリセットを読み込んだ');
  await expect(row).toContainText('2件の値は読み込めませんでした（同指連続のホーム復帰距離、この版に無い項目 1件）');
  await expect(row).toContainText('「自分用メモ」はこの端末に無い指の割当を使っています。流し込むと既定に戻ります');
  await expect(row).not.toContainText('futureItem');
  const details = section.locator('[data-pane-error-details]');
  await details.locator('summary').click();
  await expect(details).toContainText('futureItem');
  await expect(section.locator('summary').first()).toHaveText('プリセット（1）');
});

test('参照先の注記は、番号が付いた追加分の名前を指す（手元の同名を指さない）', async ({ page }) => {
  const { section } = await openPresets(page);
  await savePreset(section, '比較用（N=5）');
  const file = {
    format: 'keydist-presets',
    version: 1,
    presets: [{ id: 'x', name: '比較用（N=5）', values: { fingerAssignmentId: 'from-elsewhere' } }],
  };
  await importText(section, JSON.stringify(file));
  await expect(result(section)).toContainText('「比較用（N=5） 2」はこの端末に無い指の割当を使っています');
  await expect(result(section)).not.toContainText('「比較用（N=5）」');
});

test.describe('スマホ幅', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('プリセット: 書き出し・読み込みのボタンと結果の行が横にはみ出さない', async ({ page }) => {
    const { modal, section } = await openPresets(page);
    await savePreset(section, 'とても長い名前のプリセットをスマホ幅で並べる');
    await expect(section.getByRole('button', { name: 'すべて書き出す' })).toBeVisible();
    await expect(section.getByRole('button', { name: '読み込む…' })).toBeVisible();
    await importText(section, '{ 壊れた');
    await expect(result(section)).toContainText('条件ファイルとして読めませんでした');
    const overflow = await modal.evaluate((dialog) => {
      const body = dialog.querySelector('.condition-modal-body')!;
      return body.scrollWidth - body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

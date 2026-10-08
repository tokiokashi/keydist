import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 自作の資産の書き出し・読み込みと、削除の確認を閉じた後のフォーカスのE2E。
 * 突き合わせの分岐（中身の比べ方・別名・参照の振り直し）はunit testが持つので、ここでは画面の配線を見る:
 * ファイルが出る、読み込みの結果が画面に出る、保存先に反映される、元に戻せる。
 */

/** 自作の配列2つ・規則1つを保存先へ入れる。最初の1回だけ書く（リロードで巻き戻さない）。 */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded') !== null) return;
    sessionStorage.setItem('seeded', '1');
    const rows = ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
    localStorage.setItem('keydist:user-layouts', JSON.stringify({
      version: 1,
      layouts: [
        { id: 'user-a', name: '自作A', rows, romaji: 'rule-a' },
        { id: 'user-b', name: '自作B', rows, romaji: 'kunrei' },
      ],
    }));
    localStorage.setItem('keydist:user-romaji-rules', JSON.stringify({
      version: 1,
      rules: [{ id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true }],
    }));
  });
}

test('削除の確認を閉じると、フォーカスが開いたボタンへ戻る。削除した時は「元に戻す」へ移る', async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  const layouts = page.locator('[data-user-assets-section="layout"]');
  const deleteA = layouts.getByRole('button', { name: '「自作A」を削除' });

  await deleteA.click();
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(deleteA).toBeFocused();

  await deleteA.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(deleteA).toBeFocused();

  await deleteA.click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeFocused();
});

test('書き出したファイルを読み込むと、同じ中身は足さず、中身が違うものは別名で足し、元に戻せる', async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  const layouts = page.locator('[data-user-assets-section="layout"]');
  const rules = page.locator('[data-user-assets-section="romaji-rule"]');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '書き出す' }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(JSON.parse(text).format).toBe('keydist-user-assets');
  await expect(page.locator('.user-assets-message')).toContainText('書き出した');

  // 同じファイルを読み込むと何も足さない
  const input = page.getByLabel('読み込む自作の資産のファイル');
  await input.setInputFiles({ name: 'assets.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const result = page.locator('[data-user-assets-import-result]');
  await expect(result).toContainText('手元と同じ中身なので、足したものはありません');
  await expect(result).toContainText('配列「自作A」は、手元と同じ中身なので足さなかった');
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);

  // 同じidで中身が違うものは、手元を残して別名で足す
  const changed = JSON.parse(text) as {
    layouts: { id: string; rows: string[] }[];
    romajiRules: { id: string; overrides: Record<string, string> }[];
  };
  changed.layouts[0]!.rows[1] = 'poiuytrewq';
  changed.romajiRules[0]!.overrides = { し: 'si' };
  await input.setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
  await expect(result).toContainText('「自作A (2)」として足した');
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(3);
  await expect(rules.locator('[data-user-asset-row]')).toHaveCount(2);
  await expect(layouts.locator('[data-user-asset-row="user-a"]')).toContainText('推奨のローマ字規則: 自作の規則');
  // 別名で足した配列は、別名で足した規則を推奨にする
  await expect(layouts.locator('.user-assets-row', { hasText: '自作A (2)' })).toContainText('推奨のローマ字規則: 自作の規則 (2)');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('keydist:user-layouts')))
    .toContain('自作A (2)');

  // 元に戻すと読み込む前に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(layouts.locator('[data-user-asset-row]')).toHaveCount(2);
  await expect(rules.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(result).toHaveCount(0);
});

test('読み込めなかった要素の詳細を開いても、狭い幅で横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/assets');
  await waitForHydration(page);
  const longId = 'default-with-a-very-long-identifier-that-has-no-break-opportunities-at-all-0123456789';
  await page.getByLabel('読み込む自作の資産のファイル').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'keydist-user-assets',
      version: 1,
      layouts: [{ id: 'user-a', name: '自作A', rows: ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'], romaji: 'kunrei' }],
      fingerAssignments: [{ id: longId, name: '壊れた指', keyFinger: {}, homeKey: {} }],
    })),
  });
  const result = page.locator('[data-user-assets-import-result]');
  await result.locator('summary').click();
  await expect(result.locator('pre')).toContainText('fingerAssignments[0]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test('自作の資産のファイルでないものを読み込むと、理由が出て何も変わらない', async ({ page }) => {
  await seed(page);
  await page.goto('/assets');
  await waitForHydration(page);
  await page.getByLabel('読み込む自作の資産のファイル').setInputFiles({
    name: 'presets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'keydist-presets', version: 1, presets: [] })),
  });
  await expect(page.locator('[data-user-assets-import-result]')).toContainText('自作の資産のファイルではありません');
  await expect(page.locator('[data-user-assets-section="layout"] [data-user-asset-row]')).toHaveCount(2);
});

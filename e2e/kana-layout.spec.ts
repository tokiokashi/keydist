import { expect, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * かな配列の画面のE2E。検査の分岐と保存の中身はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、図の上でキーを選んで出力を置ける、
 * 切り替えのキー付きの面を足せる、未選択の項目で保存が止まる、保存先に反映される、
 * 対象の選択に並ぶ、貼り付けたJSONの誤りの場所が出て取り込まれない、幅390pxでは図だけが横にスクロールして押せる。
 */

const STORAGE_KEY = 'keydist:user-layouts';

test('図の上で出力と切り替えのキーを決めて保存でき、保存した配列は対象の選択に並ぶ', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: 'かな配列', exact: true }).click();
  await expect(page).toHaveURL(/\/kana-layout$/);

  // 何も入れていない間は保存できない
  const submit = page.locator('[data-kana-submit]');
  await expect(submit).toBeDisabled();
  await page.locator('[data-kana-name]').fill('私のかな配列');

  // 図のキーを押して、そのキーの出力を書く
  const key = (id: string) => page.locator(`[data-kana-figure] [data-key-id="${id}"]`);
  await key('a').click();
  await page.locator('[data-kana-output]').fill('あ');
  await key('s').click();
  await page.locator('[data-kana-output]').fill('か');
  await expect(key('a').locator('.physical-keyboard-legend')).toHaveText('あ');
  await expect(submit).toBeEnabled();

  // 切り替えのキー付きの面を足す。打鍵の順序と持続は選ぶまで保存を止める
  await page.locator('[data-kana-face-add]').click();
  await page.locator('[data-kana-operation="trigger"]').check();
  await key('thumb-l').click();
  await expect(key('thumb-l')).toHaveAttribute('data-trigger', 'true');
  await page.locator('[data-kana-operation="output"]').check();
  // 出力を書けないキー（親指とShift）は、支援技術にも押せないキーとして伝わる。切り替えのキーにした親指は、その旨も添える
  await expect(key('thumb-l')).toHaveAttribute('aria-disabled', 'true');
  await expect(key('thumb-l')).toHaveAttribute('aria-label', /切り替えのキー。出力を書けないキー/);
  await expect(key('shift-l')).toHaveAttribute('aria-label', /出力を書けないキー/);
  await expect(key('a')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-kana-operation="trigger"]').check();
  await expect(key('thumb-l')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-kana-operation="output"]').check();
  await key('a').click();
  await page.locator('[data-kana-output]').fill('ぁ');
  await expect(page.getByRole('alert').filter({ hasText: '打鍵の順序' })).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.locator('[data-kana-face-field="mode"]').selectOption('simultaneous');
  await expect(submit).toBeDisabled();
  await page.locator('[data-kana-face-field="persistence"]').selectOption('single');
  await expect(submit).toBeEnabled();

  // 打てないかなが並ぶ（保存は止めない）
  await expect(page.locator('[data-kana-coverage-result="missing"]')).toBeVisible();
  await expect(page.locator('[data-kana-uncovered="清音"]')).toContainText('き');

  await submit.click();
  await expect(page.locator('[data-kana-pick]')).toHaveValue(/^user-/);
  const stored = () => page.evaluate((storageKey) => localStorage.getItem(storageKey), STORAGE_KEY);
  await expect.poll(stored).toContain('私のかな配列');
  await expect.poll(stored).toContain('"thumb-l"');
  await expect.poll(stored).toContain('"triggerPersistence":"single"');
  await expect(submit).toBeDisabled();

  // 元に戻すで、保存前に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(stored).not.toContain('私のかな配列');
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(stored).toContain('私のかな配列');

  // トップの対象の選択に並ぶ
  const id = await page.locator('[data-kana-pick]').inputValue();
  await page.goto('/');
  await waitForHydration(page);
  await page
    .locator('.hero')
    .getByRole('button', { name: /^対象: / })
    .click();
  await expect(page.getByRole('dialog', { name: '対象の選択' }).locator(`input[value="layout:${id}"]`)).toHaveCount(1);
});

test('貼り付けたJSONの誤りは、どの面のどのキーかが出て、取り込まれない', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);
  await page.locator('[data-kana-name]').fill('下書き');
  await page.locator('[data-kana-json] > summary').click();

  const broken = {
    format: 'keydist-kana-layout',
    version: 1,
    name: '貼り付けた配列',
    faces: [
      { trigger: [], inputRole: 'layer', outputs: { a: 'あ' } },
      { trigger: ['thumb-l'], triggerPersistence: 'single', inputRole: 'layer', outputs: { s: 'い', '1-': 'う' } },
    ],
    composition: { dakuten: false, handakuten: false },
  };
  await page.locator('[data-kana-json-paste]').fill(JSON.stringify(broken));
  await page.locator('[data-kana-json-import]').click();
  await expect(page.locator('[data-kana-import-result="error"]')).toBeVisible();
  const problems = page.locator('[data-kana-problems="error"] [data-kana-problem]');
  await expect(problems.filter({ hasText: '面2は、打鍵の順序' })).toContainText('faces[1].mode');
  await expect(problems.filter({ hasText: '面の上の物理キーの名前ではありません' })).toContainText('faces[1].outputs.1-');
  // 取り込まれていないので、名前は元のまま
  await expect(page.locator('[data-kana-name]')).toHaveValue('下書き');

  // 直した定義は取り込まれ、書き出しに同じ定義が出る
  const fixed = {
    ...broken,
    faces: [broken.faces[0], { ...broken.faces[1], mode: 'prefix', outputs: { s: 'い' } }],
  };
  await page.locator('[data-kana-json-paste]').fill(JSON.stringify(fixed));
  await page.locator('[data-kana-json-import]').click();
  await expect(page.locator('[data-kana-import-result="ok"]')).toBeVisible();
  await expect(page.locator('[data-kana-name]')).toHaveValue('貼り付けた配列');
  await expect(page.locator('[data-kana-face-pick]')).toHaveCount(2);
  const exported = JSON.parse(await page.locator('[data-kana-json-export]').inputValue());
  expect(exported).toEqual(fixed);
});

test('指が担当しないキーをホームキーにすると注意が出て、担当するキーに直すと消える。保存は止まらない', async ({ page }) => {
  await page.goto('/kana-layout');
  await waitForHydration(page);
  await page.locator('[data-kana-name]').fill('ホームキーの確認');
  await page.locator('[data-kana-figure] [data-key-id="a"]').click();
  await page.locator('[data-kana-output]').fill('あ');

  const warning = page.locator('[data-kana-home-warning]');
  await expect(warning).toHaveCount(0);
  await page.locator('[data-kana-home="LI"]').selectOption('h');
  await expect(warning).toHaveCount(1);
  await expect(page.locator('[data-kana-home-warning="LI"]')).toContainText('使われず');
  await expect(page.locator('[data-kana-submit]')).toBeEnabled();

  await page.locator('[data-kana-home="LI"]').selectOption('');
  await page.locator('[data-kana-home="RI"]').selectOption('h');
  await expect(warning).toHaveCount(0);
});

test.describe('幅390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('図は横にスクロールし、ページ全体には横スクロールが出ず、図のキーを押して選べる', async ({ page }) => {
    await page.goto('/kana-layout');
    await waitForHydration(page);

    // ページ全体は画面の幅に収まり、狭い分は図の枠だけがスクロールする
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(390);
    const figureScrolls = await page.locator('[data-kana-figure]').evaluate((figure) => figure.scrollWidth > figure.clientWidth);
    expect(figureScrolls).toBe(true);

    // 図のキーは押せる大きさを保ち（24×24 CSS px 以上）、押すと出力の欄に移る
    const keyA = page.locator('[data-kana-figure] [data-key-id="a"]');
    const keyBox = await keyA.locator('rect').boundingBox();
    expect(keyBox?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(keyBox?.height ?? 0).toBeGreaterThanOrEqual(24);
    await keyA.click();
    await page.locator('[data-kana-output]').fill('あ');
    await expect(keyA.locator('.physical-keyboard-legend')).toHaveText('あ');
  });
});

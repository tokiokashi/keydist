import type { Page } from '@playwright/test';

/**
 * 個別画面のテキストの選択を、漢字を含まない組み込みのテキスト（現代文）から始める。
 * 既定のテキストは漢字を含むので、開くと読みの辞書の取得と、条件の要約への「読みの辞書」の表示が起きる。
 * 読みに関係しない検査は、この関数で漢字を含まないテキストにそろえる。
 * 保存済みの選択があれば上書きしない。
 */
export async function useKanaText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:standalone-text-selection') === null) {
      localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'builtin', id: 'builtin:ja.modern' } }));
    }
  });
}

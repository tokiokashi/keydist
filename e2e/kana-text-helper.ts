import type { Page } from '@playwright/test';

/**
 * 個別画面のテキストの選択を、漢字を含まない組み込みのテキスト（現代文）から始める。
 * 既定のテキストは漢字を含むので、開くと読みの辞書の取得と、条件の要約への「読みの辞書」の表示が起きる。
 * 読みに関係しない検査は、この関数で漢字を含まないテキストにそろえる。
 * 保存済みの選択があれば上書きしない（共通の準備が入れた短い本文を除く）。
 */
export async function useKanaText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 保存済みの選択は上書きしない。ただし、検査の共通の準備（`fixtures.ts`）が入れた短い本文の選択は、漢字を含まない本文に替える
    const stored = localStorage.getItem('keydist:standalone-text-selection');
    if (stored === null || stored === JSON.stringify({ version: 1, ref: { kind: 'user', id: 'short-text' } })) {
      localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'builtin', id: 'builtin:ja.modern' } }));
    }
  });
}

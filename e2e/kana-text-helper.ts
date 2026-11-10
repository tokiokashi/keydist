import type { Page } from '@playwright/test';

/** 漢字を含まない短い本文。読みの辞書を使わずに数値が出る。 */
export const KANA_TEXT = 'あさ、まどをあけると、やわらかなひかりがへやにひろがります。きょうのよていをおもいだしながら、おちゃをのみます。';

const KANA_TEXT_ID = 'kana-text';

/**
 * 個別画面のテキストの選択を、漢字を含まない自作のテキスト（短いかな文）から始める。
 * 既定のテキストは漢字を含むので、開くと読みの辞書の取得と、条件の要約への「読みの辞書」の表示が起きる。
 * 読みに関係しない検査は、この関数で漢字を含まないテキストにそろえる。
 * 保存済みの選択があれば上書きしない（共通の準備が入れた短い本文を除く）。
 */
export async function useKanaText(page: Page): Promise<void> {
  await page.addInitScript(
    ({ id, text }) => {
      // 保存済みの選択は上書きしない。ただし、検査の共通の準備（`fixtures.ts`）が入れた短い本文の選択は、漢字を含まない本文に替える
      const stored = localStorage.getItem('keydist:standalone-text-selection');
      if (stored === null || stored === JSON.stringify({ version: 1, ref: { kind: 'user', id: 'short-text' } })) {
        localStorage.setItem('keydist:text-library', JSON.stringify({ version: 1, texts: [{ id, name: 'かな文', text }] }));
        localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'user', id } }));
      }
    },
    { id: KANA_TEXT_ID, text: KANA_TEXT },
  );
}

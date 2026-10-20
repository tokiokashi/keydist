import type { BrowserContext, Page } from '@playwright/test';

/**
 * 図や見出しの形を見る検査に使う、漢字を含む短い本文（約230字）。
 * 既定のテキスト（約1.2万字）は、Workspaceのペインが数値を出すまでに秒単位でかかり、N感度は20秒前後かかる。
 * 形を見る検査は字数を問わないので、この本文で回す。
 */
export const SHORT_TEXT =
  '吾輩は猫である。名前はまだ無い。\n　どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。この書生というのは時々我々を捕えて煮て食うという話である。しかしその当時は何という考もなかったから別段恐しいとも思わなかった。ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。';

export const SHORT_TEXT_ID = 'short-text';
/** 組み込みの表示名と重ならない名前（テキストの選択欄で選べる）。 */
export const SHORT_TEXT_NAME = '冒頭の一節';
/** Workspaceの保存値に書くテキストの参照。 */
export const SHORT_TEXT_REF = { kind: 'user', id: SHORT_TEXT_ID } as const;

/** 短い本文をテキストの一覧に入れる。保存済みの一覧があれば上書きしない。 */
export async function seedShortTextLibrary(page: Page | BrowserContext): Promise<void> {
  await page.addInitScript(
    ({ id, name, text }) => {
      if (localStorage.getItem('keydist:text-library') === null) {
        localStorage.setItem('keydist:text-library', JSON.stringify({ version: 1, texts: [{ id, name, text }] }));
      }
    },
    { id: SHORT_TEXT_ID, name: SHORT_TEXT_NAME, text: SHORT_TEXT },
  );
}

/** 短い本文を入れ、個別画面のテキストの選択もその本文から始める。保存済みの選択があれば上書きしない。 */
export async function useShortText(page: Page | BrowserContext): Promise<void> {
  await seedShortTextLibrary(page);
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:standalone-text-selection') === null) {
      localStorage.setItem('keydist:standalone-text-selection', JSON.stringify({ version: 1, ref: { kind: 'user', id } }));
    }
  }, SHORT_TEXT_ID);
}

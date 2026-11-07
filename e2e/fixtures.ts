import { expect, test as base } from '@playwright/test';
import { collectBrowserErrors } from './browser-errors-helper.ts';
import { useShortText } from './short-text-helper.ts';

export * from '@playwright/test';

/**
 * ページの本に付けるタグ。`test('名前', { tag: PAGE_TAG }, ...)` の形で付ける。
 * 付けた本は、`playwright.config.ts` の `mobile` でも回り、ブラウザのエラーが空である事を最後に確かめられる。
 */
export const PAGE_TAG = '@page';

/**
 * 既定のテキストは、検査用の短い本文より計算が長く、並行して回る検査の負荷を上げる。
 * 本文を問わない検査が、既定のテキストの長さによらず待ちの上限の近くで揺れないよう、既定では個別画面のテキストを短い本文から始める
 * （保存済みの選択があれば上書きしない）。既定のテキストそのものを見る検査は
 * `test.use({ shortText: false })` で外す。Workspaceの本文は保存値に持つので、検査が自分で決める。
 *
 * タグ `@page` の本は、ブラウザのエラー・警告を集め、本の最後に空である事を確かめる。
 * 本が自分で `collectBrowserErrors` を呼ぶ検査（タグの無い本）には掛けない。
 */
export const test = base.extend<{ shortText: boolean; pageBrowserErrors: undefined }>({
  shortText: [true, { option: true }],
  context: async ({ context, shortText }, use) => {
    if (shortText) await useShortText(context);
    await use(context);
  },
  pageBrowserErrors: [
    async ({ page }, use, testInfo) => {
      if (!testInfo.tags.includes(PAGE_TAG)) {
        await use(undefined);
        return;
      }
      const errors = await collectBrowserErrors(page);
      await use(undefined);
      expect(errors.all(), 'ブラウザのエラー・警告').toEqual([]);
    },
    { auto: true },
  ],
});

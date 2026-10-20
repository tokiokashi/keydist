import { test as base } from '@playwright/test';
import { useShortText } from './short-text-helper.ts';

export * from '@playwright/test';

/**
 * 既定のテキスト（約1.2万字）は、開くたびに数秒の計算が走り、並行して回る検査の負荷を上げる。
 * 本文を問わない検査が待ちの上限の近くで揺れないよう、既定では個別画面のテキストを短い本文から始める
 * （保存済みの選択があれば上書きしない）。既定のテキストそのものを見る検査は
 * `test.use({ shortText: false })` で外す。Workspaceの本文は保存値に持つので、検査が自分で決める。
 */
export const test = base.extend<{ shortText: boolean }>({
  shortText: [true, { option: true }],
  context: async ({ context, shortText }, use) => {
    if (shortText) await useShortText(context);
    await use(context);
  },
});

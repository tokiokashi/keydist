import { expect, type Page } from '@playwright/test';

/**
 * プリレンダーされたページのハイドレーションが始まるまで待つ。
 *
 * ハイドレーション前のHTMLはボタンが見えて押せる（actionabilityも満たす）が、まだハンドラが無いので
 * クリックが失われる（リンクなら全体の読み込みに落ちる）。シェル（サイドバー・開くボタン・テーマ切替）は
 * 解析の画面のような`disabled`の囲い（`fieldset disabled={!assetsReady}`）の外にあり、
 * Playwrightの待ちでは防げない。製品側で読み込みまで無効に見せるかは、この道具の範囲外。
 *
 * 印はReactがDOMへ付ける`__reactProps$…`。`<body>`もReactが描くので、どの画面でも使える。
 * hydrateRootの描画が`<body>`まで済めば付き、それ以降のクリックはReactが受け止める
 * （コミット前に届いた離散イベントは同期的にハイドレーションを済ませてから配られる）。
 * `inert`等の見た目の変化は、固定したパソコン幅のように変化が起きない条件があるので印にしない。
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Object.keys(document.body).some((key) => key.startsWith('__reactProps$'))), {
      message: 'ページのハイドレーションが始まらない',
    })
    .toBe(true);
}

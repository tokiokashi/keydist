import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { expect, type Page } from '@playwright/test';

/**
 * 図のスクリーンショットを撮る前の固定。
 * 基準の画像と比べるのは、基準を作った環境（CIの `browser-e2e` と同じrunner・ブラウザ・`CI=1`・本番ビルド）だけ。
 * ここでは、環境を揃えても残る差の元（フォント・アニメーション・テーマ・画面の大きさ）を固定する。
 */

/** 撮影時の画面の大きさ。図の折り返しや拡縮は幅で決まるので、固定する。 */
export const SCREENSHOT_VIEWPORT = { width: 1280, height: 900 };

const FONT_FAMILY = 'Noto Sans JP Variable';
const FONT_ROUTE = '/__e2e-fonts/';

const fontPackageDir = dirname(createRequire(import.meta.url).resolve('@fontsource-variable/noto-sans-jp/package.json'));

/**
 * 画面の文字を、依存に固定したフォントだけで描く。
 * runnerに入っているフォントに頼ると、runnerのイメージの更新で字形と幅が変わり、基準の画像が全部ずれる。
 * フォントのファイルは `package-lock.json` が版を固定するnpmのパッケージから読み、アプリのサーバーを通らずに配る。
 */
export async function useFixedFont(page: Page): Promise<void> {
  const css = readFileSync(join(fontPackageDir, 'index.css'), 'utf8').replaceAll('url(./files/', `url(${FONT_ROUTE}`);
  await page.route(`**${FONT_ROUTE}*`, async (route) => {
    const name = new URL(route.request().url()).pathname.slice(FONT_ROUTE.length);
    // 想定外のパスでパッケージの外を読まない
    if (!/^[\w.-]+\.woff2$/.test(name)) return route.abort();
    await route.fulfill({ body: readFileSync(join(fontPackageDir, 'files', name)), contentType: 'font/woff2' });
  });
  await page.addInitScript(
    ({ css, family }) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `${css}\n*, *::before, *::after { font-family: '${family}' !important; }`;
        document.head.append(style);
      });
    },
    { css, family: FONT_FAMILY },
  );
}

/** テーマ（ライト）・動きの抑制・画面の大きさを固定する。ページを開く前に呼ぶ。 */
export async function fixScreenshotEnvironment(page: Page): Promise<void> {
  await page.setViewportSize(SCREENSHOT_VIEWPORT);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await useFixedFont(page);
}

/** 使う字形のフォントが読み込み終わるまで待つ。ここを待たないと、代わりのフォントで撮れる。 */
export async function waitForFixedFont(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (family) => {
        await document.fonts.ready;
        return [...document.fonts].some((face) => face.family.includes(family) && face.status === 'loaded');
      }, FONT_FAMILY),
    )
    .toBe(true);
}

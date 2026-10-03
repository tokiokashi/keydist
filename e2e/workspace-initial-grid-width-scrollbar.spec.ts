import { test } from '@playwright/test';
import { checkFirstFrame } from './workspace-initial-grid-width-check.ts';

/**
 * スクロールバーが幅（15px）を取る環境（Windowsなど）の条件。格子を描いてページが伸びるとスクロールバーが出て、
 * 面の幅が変わる。Playwrightは既定でスクロールバーを隠すので、`--hide-scrollbars`を外して作る。
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('開いた直後の最初の描画と落ち着いた後で、ペインの矩形が1px以内で同じ', ({ page }) => checkFirstFrame(page, true));

import { test } from '@playwright/test';
import { checkFirstFrame } from './workspace-initial-grid-width-check.ts';

/** スクロールバーが幅を取らない条件（Playwrightの既定。スクロールバーは隠れる）。 */
test('開いた直後の最初の描画と落ち着いた後で、ペインの矩形が1px以内で同じ', ({ page }) => checkFirstFrame(page, false));

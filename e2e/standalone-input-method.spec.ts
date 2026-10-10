import { expect, test, type Page } from '@playwright/test';

/**
 * 入力方法のE2E。行数や中身はunit test（`layout-breakdown.test.ts`・`key-pattern-selection.test.ts`）で固定しているので、
 * ここでは画面の配線（修飾・コンボの表と配列図・キーを選んで出る文字を調べる図・該当が無い時の文）だけを見る。
 */

async function selectLayout(page: Page, layoutId: string) {
  await page.addInitScript((id) => {
    if (localStorage.getItem('keydist:single-target-selection') === null) {
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: id } }));
    }
  }, layoutId);
}

const feature = (page: Page) => page.locator('[data-react-feature="input-method"]');

test('コンボを持つ配列: コンボ表と配列図が出て、修飾は無いと分かる', async ({ page }) => {
  await selectLayout(page, 'kawasemi-plus');
  await page.goto('/standalone/input-method');
  await expect(page.getByRole('heading', { name: '入力方法', exact: true, level: 1 })).toBeVisible();
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-input-method-table="combo"] tbody tr')).toHaveCount(45);
  await expect(feature(page).locator('[data-input-method-diagram] svg')).toBeVisible();
  await expect(feature(page).getByText('この配列は修飾のレイヤーを持ちません。')).toBeVisible();
});

test('文字キーの同時押しを層に数える配列: コンボ表は無いと分かる', async ({ page }) => {
  await selectLayout(page, 'shin-koume');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).getByText('この打ち方で使えるコンボはありません。')).toBeVisible();
});

test('修飾のレイヤーを持つ配列: 修飾の一覧が出て、コンボは無いと分かる', async ({ page }) => {
  await selectLayout(page, 'naginata-v18');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-input-method-table="modifier"] tbody tr').first()).toBeVisible();
  await expect(feature(page).getByText('この打ち方で使えるコンボはありません。')).toBeVisible();
  await expect(feature(page).locator('[data-input-method-diagram]')).toHaveCount(0);
});

test('キーを選んで出る文字を調べる: キーボードでキーを選ぶと出る文字が候補に出て、Escapeで選択が外れる', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });

  const pattern = feature(page).locator('[data-input-method-pattern]');
  const result = pattern.locator('[data-input-method-pattern-result]');
  await expect(result).toContainText('キーを選ぶと');

  const shift = pattern.locator('[data-key-id="shift-l"]');
  await shift.focus();
  await page.keyboard.press('Enter');
  await expect(shift).toHaveAttribute('aria-pressed', 'true');
  await expect(result).toContainText('青い枠');
  await expect(pattern.locator('[data-key-id="a"] text')).toHaveText('A');

  await page.keyboard.press('Escape');
  await expect(shift).toHaveAttribute('aria-pressed', 'false');
  await expect(result).toContainText('キーを選ぶと');
});

test('トリガーになるキーの色付け: レイヤーとコンボの両方を持つ配列は、何も選ばない間に色付きの破線の枠と凡例が出る', async ({ page }) => {
  await selectLayout(page, 'kawasemi-plus');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const pattern = feature(page).locator('[data-input-method-pattern]');
  await expect(pattern.locator('[data-input-method-trigger-legend]')).toBeVisible();
  await expect(pattern.locator('[data-input-method-trigger-legend] [data-legend-slot]').first()).toBeVisible();
  await expect(pattern.getByText('コンボ', { exact: true })).toBeVisible();
  await expect(pattern.locator('[data-guide="trigger"][data-accent-slot]').first()).toBeVisible();
  await expect(pattern.locator('[data-guide="trigger"]:not([data-accent-slot])').first()).toBeVisible();
});

test('トリガーになるキーの色付け: 1キーでレイヤーに切り替わるキーを選ぶと、選んだ枠がそのレイヤーの色になり、破線の枠は消える', async ({ page }) => {
  await selectLayout(page, 'nicola');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  const pattern = feature(page).locator('[data-input-method-pattern]');
  const first = pattern.locator('[data-guide="trigger"][data-accent-slot]').first();
  await expect(first).toBeVisible();
  const slot = await first.getAttribute('data-accent-slot');
  const trigger = pattern.locator(`[data-key-id="${await first.getAttribute('data-key-id')}"]`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await expect(trigger).toHaveAttribute('data-accent-slot', slot!);
  await expect(pattern.locator('[data-guide="trigger"]')).toHaveCount(0);
});

test('トリガーになるキーの色付け: レイヤーもコンボも持たない配列には凡例が出ない', async ({ page }) => {
  await selectLayout(page, 'qwerty');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-input-method-pattern]')).toBeVisible();
  await expect(feature(page).locator('[data-input-method-trigger-legend]')).toHaveCount(0);
  await expect(feature(page).locator('[data-guide="trigger"]')).toHaveCount(0);
});

test('どちらも持たない配列: 修飾とコンボには無いと分かる', async ({ page }) => {
  await selectLayout(page, 'nicola');
  await page.goto('/standalone/input-method');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).getByText('この配列は修飾のレイヤーを持ちません。')).toBeVisible();
  await expect(feature(page).getByText('この打ち方で使えるコンボはありません。')).toBeVisible();
});

test.describe('幅390pxの画面', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [layoutId, diagram] of [['qwerty', 'pattern'], ['naginata-v18', 'pattern'], ['kawasemi-plus', 'combo']] as const) {
    test(`${layoutId}: ${diagram === 'pattern' ? 'キーを選んで出る文字を調べる' : 'コンボ'}の図が枠の幅に収まり、横スクロールにならない`, async ({ page }) => {
      await selectLayout(page, layoutId);
      await page.goto('/standalone/input-method');
      await expect(feature(page)).toBeVisible({ timeout: 10_000 });

      const frame = feature(page).locator(diagram === 'pattern' ? '[data-input-method-pattern] .physical-keyboard' : '[data-input-method-diagram] .physical-keyboard');
      await expect(frame.locator('svg')).toBeVisible();
      const [frameBox, svgBox] = await Promise.all([frame.boundingBox(), frame.locator('svg').boundingBox()]);
      expect(svgBox!.x + svgBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width + 0.5);
      expect(await frame.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

      if (diagram === 'pattern') {
        const key = frame.locator('[data-key-id="a"]');
        await key.click();
        await expect(key).toHaveAttribute('aria-pressed', 'true');
      }
    });
  }
});

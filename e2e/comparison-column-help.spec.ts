import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 比較表の列の説明: 見出しのⓘ（Analyzerの名前の横）から開くモーダル。
 * 開く・閉じる・Escape・フォーカスの戻り先、全列を読めること、dialog自体はスクロールせず本文だけがスクロールすること。
 * 他のAnalyzerのⓘは今の小窓のまま。
 */

const FORBIDDEN_WORDS = ['Policy', 'fresh', 'Stroke', 'physical', 'mean'];
const COLUMN_LABELS = [
  '動作数', '距離', 'u/打鍵', 'u/文字', '動作数/文字', '押下/文字', '単打面率', '単打率', '1キー率', '同指', '同指率', '指間平均', '指間σ', '右手距離率', '右手押下率',
];

function seedThreeLayouts() {
  localStorage.setItem(
    'keydist:multi-target-selection',
    JSON.stringify({
      version: 1,
      targets: [
        { kind: 'layout', layoutId: 'qwerty' },
        { kind: 'layout', layoutId: 'dvorak' },
        { kind: 'layout', layoutId: 'colemak-dh' },
      ],
      colorSlots: {},
    }),
  );
}

async function openComparison(page: Page): Promise<Locator> {
  await page.addInitScript(seedThreeLayouts);
  await page.goto('/standalone/comparison');
  const table = page.locator('.comparison-table');
  await expect(table.locator('tbody tr[data-comparison-row="ok"]')).toHaveCount(3, { timeout: 15_000 });
  return table;
}

function infoButton(page: Page): Locator {
  return page.getByRole('button', { name: '比較表の説明' });
}

/** dialogと本文のスクロールの量・位置、画面との関係。 */
async function scrollState(dialog: Locator) {
  return dialog.evaluate((el) => {
    const body = el.querySelector<HTMLElement>('.info-modal-body')!;
    const rect = el.getBoundingClientRect();
    return {
      dialogOverflowY: getComputedStyle(el).overflowY,
      dialogScrollable: el.scrollHeight - el.clientHeight,
      bodyScrollable: body.scrollHeight - body.clientHeight,
      bodyScrollTop: body.scrollTop,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
}

test('見出しのⓘでモーダルが開き、比較表の説明・単位・全列の説明を読める。表の下に説明の行は無い', async ({ page }) => {
  const table = await openComparison(page);
  // 表の下の「列の説明」は無い。見出しのセルにもⓘは置かない。
  await expect(page.getByRole('button', { name: '列の説明' })).toHaveCount(0);
  await expect(page.locator('.comparison-feature').getByRole('button')).toHaveCount(15);
  await expect(table.locator('thead .info-button')).toHaveCount(0);

  const info = infoButton(page);
  await expect(info).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await info.click();
  const dialog = page.getByRole('dialog', { name: '比較表' });
  await expect(dialog).toBeVisible();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog).toContainText('同じテキストを打った時の、指の移動距離');
  await expect(dialog).toContainText('距離の単位uは、キーの幅を1とした距離');
  await expect(dialog.getByRole('heading', { name: '列の説明' })).toBeVisible();
  await expect(dialog.locator('dt')).toHaveText(COLUMN_LABELS);
  await expect(dialog.locator('dd')).toHaveCount(15);
  await expect(dialog).toContainText('ホームに置いた時の間隔');
  // dlの直下はdt / ddを包むdivだけ。
  const badChildren = await dialog.locator('dl').evaluateAll((lists) =>
    lists.flatMap((dl) => [...dl.children].filter((child) =>
      !(child.tagName === 'DIV' && [...child.children].every((c) => c.tagName === 'DT' || c.tagName === 'DD'))).map((c) => c.tagName)));
  expect(badChildren).toEqual([]);
  for (const word of FORBIDDEN_WORDS) await expect(dialog).not.toContainText(word);

  // 表示していない列の説明も出る。
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '解析設定', exact: true }).click();
  await page.locator('[data-settings-window="true"]').getByRole('checkbox', { name: '指間σ', exact: true }).uncheck();
  await page.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(table.locator('thead th')).toHaveCount(15);
  await info.click();
  await expect(dialog.locator('dt')).toHaveText(COLUMN_LABELS);
});

test('キーボードで開閉でき、Escape・閉じるボタン・背後を押した時のどれでも、フォーカスがⓘに戻る', async ({ page }) => {
  await openComparison(page);
  const info = infoButton(page);
  const dialog = page.getByRole('dialog', { name: '比較表' });

  await info.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  // 開くとフォーカスはモーダルの中（閉じるボタン）へ移る。
  await expect(dialog.getByRole('button', { name: '閉じる' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(info).toBeFocused();

  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(info).toBeFocused();

  await info.click();
  await expect(dialog).toBeVisible();
  // Tabで本文（スクロールの入れ物）へ移れ、Shift+Tabで閉じるボタンへ戻れる。背後のページの部品には移らない。
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.info-modal-body')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '閉じる' })).toBeFocused();
  // 背後（暗い部分）を押しても閉じる。
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(info).toBeFocused();
});

for (const size of [{ width: 390, height: 600 }, { width: 390, height: 340 }, { width: 1440, height: 900 }]) {
  test(`画面に収まり、dialogは自分ではスクロールせず本文だけがスクロールする。キーボードだけで最後の列まで読める（${size.width}x${size.height}）`, async ({ page }) => {
    await page.setViewportSize(size);
    await openComparison(page);
    await infoButton(page).click();
    const dialog = page.getByRole('dialog', { name: '比較表' });
    await expect(dialog).toBeVisible();

    const before = await scrollState(dialog);
    expect(before.dialogOverflowY).toBe('hidden');
    // 二重スクロールを作らない: dialogにスクロールできる量は無い。
    expect(before.dialogScrollable).toBeLessThanOrEqual(0);
    expect(before.top).toBeGreaterThanOrEqual(0);
    expect(before.bottom).toBeLessThanOrEqual(before.viewportHeight);
    expect(before.left).toBeGreaterThanOrEqual(0);
    expect(before.right).toBeLessThanOrEqual(before.viewportWidth);

    // キーボードだけ: Tabで本文へ移り、Endで末尾へ。
    await page.keyboard.press('Tab');
    await expect(dialog.locator('.info-modal-body')).toBeFocused();
    const last = dialog.locator('.info-modal-item').last();
    if (before.bodyScrollable > 1) {
      await expect(last).not.toBeInViewport({ ratio: 1 });
      await page.keyboard.press('End');
      await expect.poll(async () => (await scrollState(dialog)).bodyScrollTop).toBeGreaterThan(0);
    }
    await expect(last).toBeInViewport({ ratio: 1 });
    await expect(last).toContainText('右手押下率');
    const after = await scrollState(dialog);
    expect(after.dialogScrollable).toBeLessThanOrEqual(0);
    // 最後の項目がdialogの外へはみ出さない。
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(after.bottom);
  });
}

test('他のAnalyzerのⓘは今の小窓のまま（モーダルを開かない）', async ({ page }) => {
  for (const [path, name] of [['/standalone/n-sensitivity', 'N感度'], ['/standalone/bigram-flow', 'Bigram Flow']] as const) {
    await page.goto(path);
    await waitForHydration(page);
    const info = page.getByRole('button', { name: `${name}の説明` });
    await expect(info).toBeVisible({ timeout: 15_000 });
    await expect(info).not.toHaveAttribute('aria-haspopup', /.+/);
    await info.click();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  }
});

test('Workspaceのペインの見出しのⓘでも開け、Escapeでフォーカスがそのⓘに戻る。他のAnalyzerのペインは小窓のまま', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('button', { name: '＋ 新しいWorkspace' }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/?]+$/);
  for (const analyzer of [/比較表/, /N感度/]) {
    await page.getByRole('button', { name: /ペインを追加/ }).click();
    await page.getByRole('menuitem', { name: analyzer }).click();
  }
  await expect(page.locator('.pane-frame')).toHaveCount(2);

  const info = page.getByRole('button', { name: '比較表の説明' });
  await info.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '比較表' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('dt')).toHaveText(COLUMN_LABELS);
  const state = await scrollState(dialog);
  expect(state.dialogOverflowY).toBe('hidden');
  expect(state.dialogScrollable).toBeLessThanOrEqual(0);
  expect(state.left).toBeGreaterThanOrEqual(0);
  expect(state.right).toBeLessThanOrEqual(state.viewportWidth);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(info).toBeFocused();

  const other = page.getByRole('button', { name: 'N感度の説明' });
  await other.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

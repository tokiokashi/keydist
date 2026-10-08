import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { targetButton, toggleTarget } from './pane-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * スマホ幅（〜760px）の文脈バーとペインの見出しは、どちらも1行に収まる。
 * 1行の高さは、チップ・ボタン（2rem）に余白を足した程度。2段になると倍近くになる。
 */
test.use({ viewport: { width: 390, height: 844 } });

const PAGES = ['bigram-flow', 'comparison', 'n-sensitivity'] as const;

async function openReady(page: Page, path: string) {
  await page.goto(`/standalone/${path}`);
  await waitForHydration(page);
  // 資産の読み込みが済むまでバーの操作は効かない。読み込み後にだけ測る／押す。
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
  // 見出しの高さ・位置は、計算が済んで状態のバッジが消えてから測る（計算中の間は点が出て、見出しの並びが変わる）。
  await expect(page.locator('.pane-frame').first()).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('.pane-status-badge')).toHaveCount(0);
}

for (const path of PAGES) {
  test(`スマホ幅の${path}: 文脈バーとペインの見出しが1行に収まり、横にあふれない`, async ({ page }) => {
    await openReady(page, path);

    const bar = await page.locator('.context-bar').boundingBox();
    const header = await page.locator('.pane-frame-header').boundingBox();
    expect(bar?.height).toBeLessThan(56);
    expect(header?.height).toBeLessThan(40);

    // 1行の中に、テキスト・既定の物理配列・共有（文脈バー）と、対象・解析設定（見出し）が並ぶ。
    const barTops = await Promise.all([
      page.locator('.context-bar button.text-chip').boundingBox(),
      page.locator('.context-bar .context-select-chip').boundingBox(),
      page.getByRole('button', { name: '共有', exact: true }).boundingBox(),
    ]);
    for (const box of barTops) expect(Math.abs((box?.y ?? -100) - (barTops[0]?.y ?? 0))).toBeLessThan(8);
    const headerTops = await Promise.all([
      page.locator('.pane-frame-target').boundingBox(),
      page.getByRole('button', { name: '解析設定' }).boundingBox(),
    ]);
    for (const box of headerTops) expect(Math.abs((box?.y ?? -100) - (headerTops[0]?.y ?? 0))).toBeLessThan(20);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('スマホ幅: 物理配列はアイコンだけで、selectを操作して選べる', async ({ page }) => {
  await openReady(page, 'bigram-flow');
  const chip = page.locator('.context-bar .context-select-chip');
  await expect(chip).toHaveAttribute('title', '既定の物理配列: 配列を対象にした時に使う物理配列');
  const box = await chip.boundingBox();
  expect(box?.width).toBeLessThan(48);
  const select = page.getByLabel('既定の物理配列');
  await expect(select).toHaveValue('row-staggered');
  await select.selectOption('ortholinear');
  await expect(select).toHaveValue('ortholinear');
});

test('スマホ幅: テキストのチップは名前が8文字以上読める幅を持つ', async ({ page }) => {
  await openReady(page, 'bigram-flow');
  const visible = await page.evaluate(() => {
    const value = document.querySelector('.text-chip .context-chip-value') as HTMLElement;
    const style = getComputedStyle(value);
    const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const name = value.textContent ?? '';
    let count = 0;
    while (count < name.length && context.measureText(`${name.slice(0, count + 1)}…`).width <= value.clientWidth) count += 1;
    return count;
  });
  expect(visible).toBeGreaterThanOrEqual(8);
});

test('スマホ幅の見出しにAnalyzer名が出ず、対象名が省略されずに見える', async ({ page }) => {
  await openReady(page, 'bigram-flow');
  // 名前は見た目から外れるが、h1・ⓘのラベル・ペインの名前には残る。
  const title = page.getByRole('heading', { name: 'Bigram Flow', level: 1 });
  await expect(title).toHaveCount(1);
  expect((await title.boundingBox())?.width ?? 0).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Bigram Flowの説明' })).toBeVisible();

  await toggleTarget(page, 'layout:nicola');
  await page.keyboard.press('Escape');
  const summary = page.locator('.target-selection-summary');
  await expect(summary).toHaveText('親指シフト（NICOLA）');
  // 計算が終わってバッジが消えてから、対象の欄の全文が入っているかを測る（計算中の間は下のテストで測る）。
  await expect(page.locator('.pane-status-badge')).toHaveCount(0);
  expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

// 英文では親指シフト（NICOLA）が使えないので、対象をNICOLAにすると「失敗」になる。失敗は計算の時間に依らず、
// 依頼を出した時点で決まるので、状態を検査の前提にできる（計算中の「直前の結果を表示」は時間に依るので使わない）。
// `width`を渡すと、その幅で見る。点と文字の境目は幅で決まる（幅は固定なので、判定も決まる）。
async function failWithNicola(page: Page, width?: number): Promise<void> {
  await openReady(page, 'bigram-flow');
  if (width !== undefined) await page.setViewportSize({ width, height: 844 });
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(page.locator('.context-bar button.text-chip')).toContainText('英文');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  await toggleTarget(page, 'layout:nicola');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'failed', { timeout: 10_000 });
}

test('スマホ幅（360px）: 状態のバッジを点で出しても、対象の欄は動かず、対象名は省略されない', async ({ page }) => {
  // 360pxでは「失敗」の文字が名前の欄に入らず、点で出る。文字で出すと対象名が省略される幅（370px以下）。
  await openReady(page, 'bigram-flow');
  await page.setViewportSize({ width: 360, height: 844 });
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  const before = await targetButton(page).boundingBox();
  expect(before).not.toBeNull();

  await toggleTarget(page, 'layout:nicola');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'failed', { timeout: 10_000 });

  // 状態と測った値を、同じ時点（同じ描画）で読む
  const sample = await page.evaluate(() => {
    const frame = document.querySelector('.pane-frame')!;
    const badge = frame.querySelector<HTMLElement>('.pane-status-badge');
    const summary = frame.querySelector<HTMLElement>('.target-selection-summary')!;
    return {
      badgeCount: frame.querySelectorAll('.pane-status-badge').length,
      badgeAsText: badge?.hasAttribute('data-text') ?? null,
      badgeWidth: badge?.getBoundingClientRect().width ?? null,
      badgeTitle: badge?.getAttribute('title') ?? null,
      truncated: summary.scrollWidth > summary.clientWidth,
      summaryText: summary.textContent,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(sample.badgeCount).toBe(1);
  // 点で出す（文字は出さない）。大きさは点の寸法。
  expect(sample.badgeAsText).toBe(false);
  expect(sample.badgeWidth).toBeLessThanOrEqual(10);
  // 点でも状態が分かる。状態の文は読み上げとtitleに残る
  expect(sample.badgeTitle).toBe('失敗');
  expect(sample.truncated).toBe(false);
  expect(sample.summaryText).toBe('親指シフト（NICOLA）');
  expect(sample.overflow).toBeLessThanOrEqual(0);

  // 点の出し入れで、対象ボタンは読み込み前の位置から動かない（点は名前の欄の流れに入らない）
  const after = await targetButton(page).boundingBox();
  expect(Math.abs((after?.x ?? -100) - before!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.y ?? -100) - before!.y)).toBeLessThanOrEqual(1);
});

test('スマホ幅（360px）: 点の形は、計算中（直前の結果を表示）が回る青い輪、失敗が塗りつぶしで分かれる', async ({ page }) => {
  // 計算中（stale）の表示そのもの（回ること・動きの検査）は `status-badge-spinner.spec.ts` で見る。
  // ここでは失敗の点を出した後で状態の属性だけを書き換え、点のCSSの形（輪の切れ目・塗り）が状態で変わることを確かめる
  await failWithNicola(page, 360);
  const badge = page.locator('.pane-frame-name .pane-status-badge');
  const failedFill = await badge.evaluate((element) => getComputedStyle(element).backgroundColor);
  await badge.evaluate((element) => element.setAttribute('data-status', 'stale'));
  const stale = await badge.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    borderStyle: getComputedStyle(element).borderTopStyle,
    borderTop: getComputedStyle(element).borderTopColor,
    borderRight: getComputedStyle(element).borderRightColor,
  }));
  expect(stale.borderStyle).toBe('solid');
  expect(stale.borderTop).toBe('rgba(0, 0, 0, 0)');
  expect(stale.borderRight).not.toBe('rgba(0, 0, 0, 0)');
  expect(stale.background).toBe('rgba(0, 0, 0, 0)');
  expect(failedFill).not.toBe('rgba(0, 0, 0, 0)');
});

test('スマホ幅: 文脈バーの元に戻す・やり直す・共有が直接押せる', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openReady(page, 'bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  const undo = bar.getByRole('button', { name: '元に戻す' });
  const redo = bar.getByRole('button', { name: 'やり直す' });
  const share = bar.getByRole('button', { name: '共有', exact: true });

  await expect(undo).toBeVisible();
  await expect(redo).toBeVisible();
  await expect(undo).toBeDisabled();

  // 共有は文字を省いたアイコンだけのボタン（⋯のメニューは無い）。
  await expect(share).toBeVisible();
  expect((await share.boundingBox())?.width ?? 99).toBeLessThan(40);
  await expect(page.getByRole('button', { name: '画面のメニュー' })).toHaveCount(0);

  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');

  await undo.click();
  await expect(chip).toContainText('吾輩は猫である');
  await redo.click();
  await expect(chip).toContainText('英文');

  await share.click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/standalone/bigram-flow');
});

test.describe('パソコン幅', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('操作は右端に並び、共有は文字付きで出る', async ({ page }) => {
    await openReady(page, 'bigram-flow');
    const bar = page.locator('.context-bar');
    await expect(bar.getByRole('button', { name: '共有', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: '元に戻す' })).toBeVisible();
    await expect(bar.getByRole('button', { name: '共有', exact: true })).toContainText('共有');
    expect((await bar.getByRole('button', { name: '共有', exact: true }).boundingBox())?.width ?? 0).toBeGreaterThan(50);
    const header = await page.locator('.pane-frame-header').boundingBox();
    expect(header?.height).toBeLessThan(40);
    // パソコン幅では、見出しにAnalyzer名を出す。
    expect((await page.getByRole('heading', { name: 'Bigram Flow', level: 1 }).boundingBox())?.width ?? 0).toBeGreaterThan(40);
  });

  // 名前の行に幅がある時は、状態のバッジを文字で出す（点にするのは幅が足りない時だけ）。
  test('個別画面: 状態のバッジは、幅があれば文字で出る', async ({ page }) => {
    await failWithNicola(page);
    const badge = page.locator('.pane-frame .pane-status-badge');
    await expect(badge).toHaveText('失敗');
    await expect(badge).toHaveAttribute('data-text', 'true');
  });
});

for (const path of PAGES) {
  test(`スマホ幅の${path}: 配列の上書きがある時、チップの理由の箱が画面に収まり、横スクロールを増やさない`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'keydist:setup-library',
        JSON.stringify({ version: 1, setups: [], overrides: { layout: { qwerty: { defaultShapeId: 'ortholinear' } } } }),
      );
      localStorage.setItem('keydist:single-target-selection', JSON.stringify({ version: 1, target: { kind: 'layout', layoutId: 'qwerty' } }));
      localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: [{ kind: 'layout', layoutId: 'qwerty' }] }));
    });
    await openReady(page, path);
    await page.getByLabel('既定の物理配列').focus();
    const note = page.locator('[data-default-shape-notice]');
    await expect(note).toBeVisible();
    const box = await note.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

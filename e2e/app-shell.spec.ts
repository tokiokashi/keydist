import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * シェル（サイドバー・文脈バー）のE2E（docs/architecture.md「画面の構成」）。
 */
const PACKAGE_VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

test('サイドバーは区分ごとのナビゲーションと、最下端の版表示・テーマ切替を持つ', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).toBeVisible();

  for (const heading of ['Analyze', 'Workspace']) {
    await expect(sidebar.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByRole('link', { name: 'Bigram Flow', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByText('Analyzerを並べて見る画面。')).toBeVisible();
  await expect(sidebar).toContainText(`v${PACKAGE_VERSION}`);
  await expect(sidebar.getByRole('link', { name: '旧版' })).toHaveCount(0);
  await expect(sidebar.locator('a[href*="classic"]')).toHaveCount(0);

  await sidebar.getByRole('link', { name: '比較表', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/comparison$/);
  await expect(page.getByRole('heading', { name: '比較表', level: 1 })).toBeVisible();

  await sidebar.getByRole('button', { name: '暗', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#app-sidebar').getByRole('button', { name: '暗', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

/** 重ねて出したサイドバーが出切るまで待つ（滑り出しの途中の位置で判定しないため）。 */
async function expectSidebarShown(page: Page): Promise<void> {
  await expect.poll(async () => (await page.locator('#app-sidebar').boundingBox())?.x).toBe(0);
}

test('固定を外すとサイドバーは隠れ、ボタンで重ねて出して離れると引っ込む。固定の状態はリロード後も残る', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  const toggle = page.getByRole('button', { name: 'サイドバーを開く' });
  await expect(toggle).toBeHidden();

  await sidebar.getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  await expect(sidebar).not.toBeInViewport();
  // 隠れたサイドバーからフォーカスが落ちず、開くボタンへ移る。
  await expect(toggle).toBeFocused();

  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  await expect(sidebar).not.toBeInViewport();

  // 文脈バーのボタンで重ねて出す。Escapeで閉じるとフォーカスはボタンへ戻る。
  await expect(page.locator('.context-bar').getByRole('button', { name: 'サイドバーを開く' })).toBeVisible();
  await toggle.click();
  await expectSidebarShown(page);
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toBeInViewport();
  await expect(toggle).toBeFocused();

  // 左端に触れると出て、サイドバーの外へ離れると引っ込む。
  await page.mouse.move(2, 400);
  await expectSidebarShown(page);
  await page.mouse.move(100, 400, { steps: 4 });
  await expect(sidebar).toBeInViewport();
  await page.mouse.move(700, 400, { steps: 8 });
  await expect(sidebar).not.toBeInViewport();

  // 滑り出しの途中で、一度もサイドバーに入らずに離れても引っ込む。
  await page.mouse.move(2, 300);
  await page.mouse.move(700, 300, { steps: 8 });
  await expect(sidebar).not.toBeInViewport();

  // 固定し直す。
  await page.mouse.move(700, 400);
  await toggle.click();
  await expectSidebarShown(page);
  await sidebar.getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-sidebar');
  await expect(sidebar).toBeInViewport();
  await expect(toggle).toBeHidden();
});

test('ボタンで重ねて出している間は、Tabで本体へ抜けない', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({ version: 2, shell: { sidebarPinned: false } }));
  });
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'サイドバーを開く' }).click();
  await expectSidebarShown(page);
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar.getByRole('link', { name: 'Bigram Flow', exact: true })).toBeFocused();
  // サイドバーの端を越えたTabは、ブラウザ自身のUIへ抜けてBODYに見える。それは「本体へ抜けた」ではないので、
  // 端を越えない回数だけ往復し、常にサイドバーの中の要素にあることを見る（BODYは内側とみなさない）。
  const { count, index } = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('#app-sidebar a[href], #app-sidebar button:not([disabled])')];
    return { count: items.length, index: items.indexOf(document.activeElement as HTMLElement) };
  });
  expect(index).toBeGreaterThanOrEqual(0);
  // 端を越えた1回だけは、ブラウザのUIへ抜けてBODYになってよい。本体（.shell-body）へ入っていないことを見る。
  const where = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) return 'body';
      if (document.getElementById('app-sidebar')!.contains(active)) return 'sidebar';
      return document.querySelector('.shell-body')!.contains(active) ? 'main' : 'other';
    });
  for (let i = 0; i < count - 1 - index; i++) {
    await page.keyboard.press('Tab');
    expect(await where(), `Tab ${i + 1}回目でサイドバーの外へ出た`).toBe('sidebar');
  }
  await page.keyboard.press('Tab');
  expect(['sidebar', 'body'], '端を越えたTabが本体へ入った').toContain(await where());
  await page.evaluate(() => {
    const items = document.querySelectorAll<HTMLElement>('#app-sidebar a[href], #app-sidebar button:not([disabled])');
    items[items.length - 1]!.focus();
  });
  for (let i = 0; i < count - 1; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await where(), `Shift+Tab ${i + 1}回目でサイドバーの外へ出た`).toBe('sidebar');
  }
  await page.keyboard.press('Shift+Tab');
  expect(['sidebar', 'body'], '端を越えたShift+Tabが本体へ入った').toContain(await where());
  await expect(sidebar).toBeInViewport();
});

test('スマホ幅で暗幕をタップして閉じると、フォーカスは開くボタンに戻る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForHydration(page);
  const toggle = page.getByRole('button', { name: 'サイドバーを開く' });
  await toggle.click();
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).toBeInViewport();
  await expect(sidebar.getByRole('link').first()).toBeFocused();
  await page.locator('.shell-scrim').click({ position: { x: 370, y: 400 } });
  await expect(sidebar).not.toBeInViewport();
  await expect(toggle).toBeFocused();
});

test('スマホ幅ではサイドバーは引き出しで、リンクを押すと閉じる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForHydration(page);
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).not.toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'サイドバーを固定' })).toBeHidden();

  await page.getByRole('button', { name: 'サイドバーを開く' }).click();
  await expect(sidebar).toBeInViewport();
  await sidebar.getByRole('link', { name: 'N感度', exact: true }).click();
  await expect(page).toHaveURL(/\/standalone\/n-sensitivity$/);
  await expect(sidebar).not.toBeInViewport();
});

test('サイドバー最下端のリンクから旧バージョンへ行ける（パソコン幅）', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  await waitForHydration(page);
  const link = page.locator('#app-sidebar .sidebar-foot').getByRole('link', { name: '旧バージョン', exact: true });
  await expect(link).toHaveAttribute('href', '/analyzer');
  await link.click();
  await expect(page).toHaveURL(/\/analyzer\/?$/);
  await expect(page.locator('#app-sidebar')).toHaveCount(0);
  // 反証: 旧Analyzerの画面が実際に出ている（リンクだけ遷移して空白になっていない）
  await expect(page.locator('main, #root').first()).not.toBeEmpty();
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('サイドバー最下端のリンクから旧バージョンへ行ける（スマホ幅の引き出し）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'サイドバーを開く' }).click();
  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).toBeInViewport();
  const link = sidebar.getByRole('link', { name: '旧バージョン', exact: true });
  await expect(link).toBeInViewport();
  await link.click();
  await expect(page).toHaveURL(/\/analyzer\/?$/);
  await expect(page.locator('#app-sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('文脈バー: テキストのチップは閉じた時1行で、開くと選択・編集が出る。Undo / Redoで選択を戻せる', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });
  await expect(chip).toContainText('吾輩は猫である');
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveCount(0);

  const undo = bar.getByRole('button', { name: '元に戻す' });
  const redo = bar.getByRole('button', { name: 'やり直す' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');

  await undo.click();
  await expect(chip).toContainText('吾輩は猫である');
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(chip).toContainText('英文');

  // 既定の物理配列は文脈バーにある。
  await expect(bar.getByLabel('既定の物理配列')).toBeVisible();
});

test('Undoは待ち中の本文の変更を先に書いてから戻す（その前の操作は戻さない）', async ({ page }) => {
  await page.clock.install();
  await page.goto('/standalone/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  // 先に1手入れて履歴を作る（テキストを英文に切り替える）。
  const panel = await openTextChip(page);
  await panel.getByLabel('テキストを選ぶ', { exact: true }).selectOption({ label: '英文（既定）' });
  await expect(chip).toContainText('英文');
  const textarea = panel.getByLabel('テキスト', { exact: true });
  const englishText = await textarea.inputValue();

  // 時計を止めて打つ。間引きのタイマーは発火しないので、本文の書き込みは待ち中のまま。
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);
  await textarea.fill('すぐに戻す編集');
  expect(await page.evaluate(() => localStorage.getItem('keydist:text-library')) ?? '').not.toContain('すぐに戻す編集');

  // 戻すと、待ち中の本文（組み込みの書き換え＝自作のコピー）だけが戻り、英文の選択は残る。
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(chip).toContainText('英文');
  await openTextChip(page);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(englishText);
  await expect(bar.getByRole('button', { name: 'やり直す' })).toBeEnabled();

  // 時計を進めても、待っていた書き込みが遅れて入ることはない。
  await page.clock.runFor(5_000);
  await expect(page.getByLabel('テキスト', { exact: true })).toHaveValue(englishText);
  await expect(chip).toContainText('英文');
});

test('テキストの名前は、チップの外を押して閉じても書かれ、「元に戻す」はその変更を戻す', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const bar = page.locator('.context-bar');
  const chip = bar.locator('button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  let panel = await openTextChip(page);
  await panel.getByRole('button', { name: '複製', exact: true }).click();
  const name = panel.getByLabel('テキストの名前');
  await expect(name).toBeEnabled();

  // 1回目: 欄に打ってすぐチップの外（ページの見出し）を押す。
  await name.fill('名前その1');
  // サイドバーの何も無い所を押す。項目の数や行の高さに依らないよう、一番下の項目の下端とサイドバーの下端の間を要素の位置から求める。
  const empty = await page.locator('#app-sidebar').evaluate((sidebar) => {
    const box = sidebar.getBoundingClientRect();
    const limit = Math.min(box.bottom, window.innerHeight);
    const bottoms = [...sidebar.querySelectorAll('*')].map((el) => el.getBoundingClientRect()).filter((rect) => rect.height > 0 && rect.bottom <= limit).map((rect) => rect.bottom);
    const bottom = Math.max(box.top, ...bottoms);
    return { x: box.x + box.width / 2, y: (bottom + limit) / 2, gap: limit - bottom };
  });
  expect(empty.gap).toBeGreaterThan(10);
  await page.mouse.click(empty.x, empty.y);
  await expect(panel).toBeHidden();
  await expect(chip).toContainText('名前その1');

  // 2回目: 打ってすぐ「元に戻す」を押す。入力中の名前を確定してから戻すので、1回目の名前に戻る。
  panel = await openTextChip(page);
  await panel.getByLabel('テキストの名前').fill('名前その2');
  await bar.getByRole('button', { name: '元に戻す' }).click();
  await expect(chip).toContainText('名前その1');
  await bar.getByRole('button', { name: 'やり直す' }).click();
  await expect(chip).toContainText('名前その2');

  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('keydist:text-library')))
    .toContain('名前その2');
});

test('トップとTesterもシェルに載り、旧Analyzerは載らない', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await page.goto('/input');
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await expect(page.locator('#app-sidebar').getByRole('link', { name: 'Tester', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goto('/analyzer');
  await expect(page.locator('#app-sidebar')).toHaveCount(0);
});

test('トップは道具の全体像を説明するページで、旧版への導線は無く、旧バージョンへ行ける', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const hero = page.locator('.hero');
  for (const name of ['Analyzer', 'Single と Multi', '始め方', 'Workspace']) {
    await expect(hero.getByRole('heading', { name, level: 2, exact: true })).toBeVisible();
  }
  await expect(hero.getByText('複数の配列を選んで、情報を比較します。')).toBeVisible();
  await expect(hero.locator('a[href*="classic"]')).toHaveCount(0);
  await expect(page.locator('#app-sidebar').locator('a[href*="classic"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '旧版' })).toHaveCount(0);

  await hero.getByRole('link', { name: '旧バージョン', exact: true }).click();
  await expect(page).toHaveURL(/\/analyzer\/?$/);
});

test('トップの画面の名前から各画面に行ける（見本が出るスマホ幅）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const targets = [
    ['Bigram Flow', /\/standalone\/bigram-flow$/],
    ['比較表', /\/standalone\/comparison$/],
    ['N感度', /\/standalone\/n-sensitivity$/],
  ] as const;
  for (const [name, url] of targets) {
    await page.goto('/');
    await waitForHydration(page);
    await page.locator('.hero').getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
  }
});

test('トップのサイドバーの見本は、サイドバーが引き出しになるスマホ幅でだけ出る', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await waitForHydration(page);
  const sample = page.getByRole('group', { name: 'サイドバーの見本' });
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await expect(sample).toBeHidden();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(sample).toBeVisible();
  await expect(sample.getByRole('link', { name: 'Bigram Flow', exact: true })).toBeVisible();
});

test('テキストのチップは文字数を出し、本文を編集すると追従する', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const chip = page.locator('.context-bar button.text-chip');
  await expect(chip).toBeEnabled({ timeout: 10_000 });

  const panel = await openTextChip(page);
  await panel.getByLabel('テキスト', { exact: true }).fill('あいうえお');
  await expect(chip.locator('.text-chip-count')).toHaveText('5字', { timeout: 10_000 });
});

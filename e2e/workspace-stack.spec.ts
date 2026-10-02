import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * スマホ幅（760px以下）のWorkspaceは、Dockviewを使わずペインを縦に積み、ページを縦にスクロールして見る（#763）。
 * 文脈バーは2段になり、テキストのチップが24px以上の幅を保つ。境目をまたいでも、Dockviewの並び・大きさは資産に残る。
 */

const WORKSPACES_KEY = 'keydist:workspaces';
const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const group = (id: string, weight = 1) => ({ kind: 'group', paneIds: [id], weight });
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const comparison = {
  id: 'c',
  analyzerId: 'comparison',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }] } } },
};
const sensitivity = { id: 'n', analyzerId: 'n-sensitivity', binding: { mode: 'follow' } };
/** 対象を持つN感度（本体の領域が出る）。 */
const sensitivityWithTarget = {
  id: 'n',
  analyzerId: 'n-sensitivity',
  binding: { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY, { kind: 'layout', layoutId: 'dvorak' }] } } },
};
/** 左にBigram Flow、右に上から比較表・N感度。重みは既定の等分から外しておく（戻した時に大きさが残るかを見る）。 */
const LAYOUT = {
  kind: 'split',
  direction: 'row',
  weight: 1,
  children: [
    group('f', 0.35),
    { kind: 'split', direction: 'column', weight: 0.65, children: [group('c', 0.3), group('n', 0.7)] },
  ],
};

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function openWorkspace(page: Page, size: { width: number; height: number }, name = '新しいWorkspace', withTarget = false) {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, { id: 'stack', name, text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } }, panes: [flow, comparison, withTarget ? sensitivityWithTarget : sensitivity], layout: LAYOUT });
  await page.goto('/workspace/stack');
  await waitForHydration(page);
  await expect(page.locator('.pane-frame')).toHaveCount(3);
}

const storedLayout = async (page: Page) => page.evaluate(
  (key) => JSON.stringify(JSON.parse(localStorage.getItem(key) ?? '{}').workspaces?.[0]?.layout),
  WORKSPACES_KEY,
);

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('要素が見えていない');
  return rect;
};

for (const size of [PHONE, { width: 360, height: 780 }]) {
  test(`${size.width}px: Dockviewを使わずペインを配置の読み順に縦に積み、ページが縦にスクロールする`, async ({ page }) => {
    await openWorkspace(page, size, '新しいWorkspace', true);
    await expect(page.locator('[data-workspace-stack="true"]')).toBeVisible();
    await expect(page.locator('[data-react-feature="bigram-flow"] [data-flow-edge="true"]').first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('.dv-dockview, .dv-groupview, .dockview-theme-light-spaced')).toHaveCount(0);
    expect(await page.locator('.workspace-stack-pane').evaluateAll((els) => els.map((el) => el.getAttribute('data-pane-id')))).toEqual(['f', 'c', 'n']);
    await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', '比較表', 'N感度']);

    // 縦に積む（上から順に、重ならない）
    const frames = page.locator('.workspace-stack-pane');
    const boxes = [await box(frames.nth(0)), await box(frames.nth(1)), await box(frames.nth(2))];
    expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(boxes[1]!.y + 1);
    expect(boxes[1]!.y + boxes[1]!.height).toBeLessThanOrEqual(boxes[2]!.y + 1);

    // ページが縦にスクロールし、横にははみ出さない
    const scroll = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.innerHeight * 1.5);
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    // 文脈バーは上に貼り付いたまま残る
    expect((await box(page.locator('.context-bar'))).y).toBeLessThanOrEqual(1);
  });
}

test('積んだペインの本体は高さ0に潰れず、幅だけを測るcontainerのまま（高さで描き分ける規則は効かない）', async ({ page }) => {
  await openWorkspace(page, PHONE, '新しいWorkspace', true);
  await expect(page.locator('[data-react-feature="bigram-flow"] [data-flow-edge="true"]').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.workspace-stack-pane .pane-body')).toHaveCount(3, { timeout: 15_000 });
  const bodies = await page.locator('.workspace-stack-pane .pane-body').evaluateAll((els) => els.map((el) => {
    const style = getComputedStyle(el);
    return { type: style.containerType, name: style.containerName, height: el.getBoundingClientRect().height };
  }));
  expect(bodies).toHaveLength(3);
  for (const body of bodies) {
    expect(body.name).toBe('pane-body');
    expect(body.type).toBe('inline-size');
    expect(body.height).toBeGreaterThan(40);
  }
  // Bigram Flowの図も、領域の高さに縮められずに個別画面と同じ大きさで出る
  const keyboard = await box(page.locator('[data-react-feature="bigram-flow"] .flow-keyboard-svg'));
  expect(keyboard.height).toBeGreaterThan(100);
  expect(keyboard.width).toBeGreaterThan(200);
});

test('パソコン幅では本体は幅と高さのcontainerで、縦に積まない', async ({ page }) => {
  await openWorkspace(page, DESKTOP, '新しいWorkspace', true);
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
  await expect(page.locator('[data-workspace-stack="true"]')).toHaveCount(0);
  await expect(page.locator('.workspace-pane .pane-body')).toHaveCount(3, { timeout: 15_000 });
  const types = await page.locator('.workspace-pane .pane-body').evaluateAll((els) => els.map((el) => getComputedStyle(el).containerType));
  expect(types).toEqual(['size', 'size', 'size']);
});

for (const [width, name] of [[390, '新しいWorkspace'], [360, '新しいWorkspace'], [390, 'とても長いWorkspaceの名前'.repeat(5)]] as const) {
  test(`${width}px・名前${name.length}文字: 文脈バーは2段で、テキストのチップが24px以上あり▾が見える`, async ({ page }) => {
    await openWorkspace(page, { width, height: 844 }, name);
    const bar = page.locator('.context-bar');
    const chip = bar.locator('button.text-chip');
    const chevron = chip.locator('.context-chip-chevron');
    await expect(chip).toBeVisible();
    const chipBox = await box(chip);
    expect(chipBox.width).toBeGreaterThanOrEqual(24);
    expect(chipBox.height).toBeGreaterThanOrEqual(24);
    // ▾が見え、チップの中に収まっている。文字（テキストの名前）も省略されながら見えている
    const chevronBox = await box(chevron);
    expect(chevronBox.width).toBeGreaterThan(0);
    expect(chevronBox.x).toBeGreaterThanOrEqual(chipBox.x);
    expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width + 0.5);
    expect(await chip.locator('.context-chip-value').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(60);

    // 並び: 1段目に☰・名前・⋯・元に戻す・やり直す、2段目にテキストと物理配列のチップ
    const nameBox = await box(bar.locator('.workspace-name'));
    const menuBox = await box(bar.getByRole('button', { name: 'Workspaceの操作' }));
    const undoBox = await box(bar.getByRole('button', { name: '元に戻す' }));
    const redoBox = await box(bar.getByRole('button', { name: 'やり直す' }));
    const shapeBox = await box(bar.locator('.context-select-chip'));
    const toggleBox = await box(bar.locator('.shell-sidebar-toggle'));
    for (const first of [nameBox, menuBox, undoBox, redoBox, toggleBox]) {
      expect(Math.abs((first.y + first.height / 2) - (nameBox.y + nameBox.height / 2))).toBeLessThan(6);
      expect(first.y + first.height).toBeLessThanOrEqual(chipBox.y + 1);
    }
    expect(Math.abs(shapeBox.y - chipBox.y)).toBeLessThan(6);
    expect(shapeBox.width).toBeGreaterThanOrEqual(24);
    // 名前が長くても、⋯と元に戻す・やり直すが1段目に収まり、画面の外へ出ない
    expect(menuBox.x).toBeGreaterThan(nameBox.x);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(undoBox.x);
    expect(redoBox.x + redoBox.width).toBeLessThanOrEqual(width);
    // 隣り合うチップは重ならない
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(shapeBox.x);
  });
}

test('文脈バーのテキストのチップを開ける（スマホ幅）', async ({ page }) => {
  await openWorkspace(page, PHONE);
  await page.locator('.context-bar button.text-chip').click();
  const panel = page.getByRole('dialog', { name: 'テキストの選択と編集' });
  await expect(panel).toBeVisible();
  const panelBox = await box(panel);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(PHONE.width);
});

test('境目をまたいで狭めて戻しても、Dockviewの並び・大きさ（資産の配置）は元のまま', async ({ page }) => {
  await openWorkspace(page, DESKTOP);
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
  const rects = () => page.locator('.dv-groupview').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  }));
  const before = await rects();
  const layoutBefore = await storedLayout(page);

  await page.setViewportSize(PHONE);
  await expect(page.locator('[data-workspace-stack="true"]')).toBeVisible();
  await expect(page.locator('.dv-groupview')).toHaveCount(0);
  // 狭い間に、待ち時間（Dockviewの並びを書く間引き）を越えても書き換わらない
  await page.waitForTimeout(600);
  expect(await storedLayout(page)).toBe(layoutBefore);

  await page.setViewportSize(DESKTOP);
  await expect(page.locator('.dv-groupview')).toHaveCount(3);
  await expect(page.locator('[data-workspace-stack="true"]')).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await storedLayout(page)).toBe(layoutBefore);
  const after = await rects();
  for (let n = 0; n < before.length; n += 1) {
    for (let k = 0; k < 4; k += 1) expect(Math.abs(after[n]![k]! - before[n]![k]!)).toBeLessThanOrEqual(3);
  }
  // ペインは1つも失われていない
  await expect(page.locator('.pane-frame h2.pane-frame-title')).toHaveText(['Bigram Flow', '比較表', 'N感度']);
});

test('スマホ幅でも、ペインの追加・複製・閉じる・連動・解析設定が使える', async ({ page }) => {
  await openWorkspace(page, PHONE);
  const titles = page.locator('.pane-frame h2.pane-frame-title');

  // 追加（積んだ末尾に入る）
  await page.getByRole('button', { name: /ペインを追加/ }).click();
  await page.getByRole('menuitem', { name: /Bigram Flow/ }).click();
  await expect(titles).toHaveText(['Bigram Flow', '比較表', 'N感度', 'Bigram Flow']);
  await expect(page.locator('.workspace-stack-pane')).toHaveCount(4);

  // ⋯: 複製（元の隣に入る）
  const comparisonPane = page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: '比較表', exact: true }) });
  await comparisonPane.getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /複製/ }).click();
  await expect(titles).toHaveText(['Bigram Flow', '比較表', '比較表', 'N感度', 'Bigram Flow']);

  // ⋯: 閉じる
  await page.locator('.pane-frame').nth(2).getByRole('button', { name: /の操作$/ }).click();
  await page.getByRole('menuitem', { name: /閉じる/ }).click();
  await expect(titles).toHaveText(['Bigram Flow', '比較表', 'N感度', 'Bigram Flow']);

  // 連動: N感度は連動に従う。固定へ切り替えられる
  const sensitivityPane = page.locator('.pane-frame').filter({ has: page.getByRole('heading', { level: 2, name: 'N感度', exact: true }) });
  const pin = sensitivityPane.locator('.pane-target-binding .pane-menu-button');
  await expect(pin).toHaveAttribute('aria-label', /^連動 1（/);
  await pin.click();
  await page.locator('.pane-menu-item[aria-label^="固定"]').click();
  await expect(pin).toHaveAttribute('aria-label', /^固定（/);

  // 解析設定: 画面に収まって開き、閉じられる
  await comparisonPane.getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = page.locator('[data-settings-window="true"]');
  await expect(settings).toBeVisible();
  const settingsBox = await box(settings);
  expect(settingsBox.x).toBeGreaterThanOrEqual(0);
  expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(PHONE.width + 1);
  await settings.getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(settings).toHaveCount(0);
});

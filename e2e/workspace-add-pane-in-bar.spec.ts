import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 「ペインを追加」は文脈バーの中にある（格子の上に専用の1行を持たない）。
 * 狭い時は文字を省いて＋だけにし、スマホ幅でも1段目に残して押せる。拡大表示の間は操作を届かせない。
 */

const QWERTY = { kind: 'layout', layoutId: 'qwerty' };
const flow = { id: 'f', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: QWERTY } } };
const TEXT = { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } };

async function open(page: Page, size: { width: number; height: number }, panes: readonly unknown[] = [flow], name = '並べて見る'): Promise<void> {
  await page.setViewportSize(size);
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 3, workspaces: [value] }));
    }
  }, {
    id: 'w',
    name,
    text: TEXT,
    panes,
    grid: panes.length === 0 ? [] : [{ id: 'f', x: 0, y: 0, w: 24, h: 16 }],
  });
  await page.goto('/workspace/w');
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
}

const addButton = (page: Page) => page.locator('.workspace-add-pane-button');

test('パソコン幅: 文脈バーの中にあり、格子の上に専用の行が無い。＋だけで、文脈バーは1行', async ({ page }) => {
  await open(page, { width: 1440, height: 900 });
  await expect(page.locator('.context-bar .workspace-add-pane-button')).toBeVisible();
  await expect(page.locator('.workspace-toolbar')).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.context-bar')!.getBoundingClientRect();
    const button = document.querySelector('.workspace-add-pane-button')!.getBoundingClientRect();
    const stage = document.querySelector('.workspace-stage')!.getBoundingClientRect();
    return { barHeight: bar.height, barBottom: bar.bottom, buttonWidth: button.width, stageTop: stage.top };
  });
  expect(layout.barHeight).toBeLessThan(60);
  expect(layout.buttonWidth).toBeLessThanOrEqual(40);
  // バーの直下から格子の面が始まる
  expect(layout.stageTop).toBeLessThanOrEqual(layout.barBottom + 1);
});

test('サイドバーを固定しない広い幅を動かしても、バーは1行で、重ならず、テキストのチップが読める幅を保つ', async ({ page }) => {
  await open(page, { width: 1440, height: 900 });
  await page.locator('#app-sidebar').getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  // バー自身の内幅が53.5rem（856px）以上の範囲（画面幅は余白と☰の分だけ上乗せ）。64remを境に文字が出る
  for (const width of [1440, 1280, 1160, 1100, 1000, 936, 912, 900, 897]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const text = rect('.context-bar button.text-chip');
      const shape = rect('.context-bar .context-select-chip');
      const add = rect('.workspace-add-pane-button');
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const bar = document.querySelector('.context-bar')!;
      return {
        barHeight: rect('.context-bar').height,
        textWidth: text.width,
        addWidth: add.width,
        overlap: hit(text, shape) || hit(text, add) || hit(add, shape),
        // 格子の幅の追従は別の話なので、バー自身が横にあふれないことを見る
        overflow: bar.scrollWidth - bar.clientWidth,
      };
    });
    expect(layout.barHeight, `幅${width}`).toBeLessThan(60);
    expect(layout.overlap, `幅${width}`).toBe(false);
    expect(layout.overflow, `幅${width}`).toBeLessThanOrEqual(0);
    expect(layout.textWidth, `幅${width}`).toBeGreaterThanOrEqual(150);
    // どの幅でも＋だけ（文字が出入りすると名前の幅が増減する）
    expect(layout.addWidth, `幅${width}`).toBeLessThanOrEqual(40);
  }
});

const LONG_NAME = 'とても長いWorkspaceの名前をつけてバーの幅を使い切る場合の確認用';

test('1行の幅で足りない時は、長い名前が先に最小幅まで縮み、その間は物理配列とテキストのチップの幅が変わらない', async ({ page }) => {
  await open(page, { width: 1600, height: 900 }, [flow], LONG_NAME);
  await page.locator('#app-sidebar').getByRole('button', { name: 'サイドバーを固定' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
  const measure = () => page.evaluate(() => {
    const width = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().width;
    return { name: width('.workspace-name'), shape: width('.context-select-chip'), text: width('.context-bar button.text-chip') };
  });
  const reference = await measure();
  let shrunk = 0;
  for (const width of [1500, 1400, 1300, 1200, 1100, 1060, 1030, 1000, 960, 930, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const now = await measure();
    if (now.name > 56 + 1) {
      expect(Math.abs(now.shape - reference.shape), `幅${width}の物理配列のチップ`).toBeLessThanOrEqual(1);
      expect(Math.abs(now.text - reference.text), `幅${width}のテキストのチップ`).toBeLessThanOrEqual(1);
    }
    if (now.name < reference.name - 1) shrunk += 1;
  }
  // 掃引の途中で、名前が実際に縮んでいる（検査が素通りしていない）
  expect(shrunk).toBeGreaterThan(3);
});

for (const [label, name] of [['5文字', '並べて見る'], [`${LONG_NAME.length}文字`, LONG_NAME]] as const) {
  test(`${label}の名前は、画面幅を狭めていく間に単調に縮み、広がり直さない（サイドバー非固定）`, async ({ page }) => {
    await open(page, { width: 1600, height: 900 }, [flow], name);
    await page.locator('#app-sidebar').getByRole('button', { name: 'サイドバーを固定' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'unpinned');
    let previous = Infinity;
    for (let width = 1600; width >= 897; width -= 8) {
      await page.setViewportSize({ width, height: 900 });
      const now = await page.evaluate(() => document.querySelector('.workspace-name')!.getBoundingClientRect().width);
      expect(now, `幅${width}`).toBeLessThanOrEqual(previous + 0.5);
      previous = now;
    }
  });
}

test('1文字の短い名前では、名前のボタンと⋯の間が空かない', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, [flow], 'A');
  const gap = await page.evaluate(() => {
    // 見えている名前のボタンの右端から測る（h1の右端は、中身より広くても⋯との間隔だけになる）
    const name = document.querySelector('.workspace-name-button')!.getBoundingClientRect();
    const menu = document.querySelector('.workspace-menu')!.getBoundingClientRect();
    return menu.left - name.right;
  });
  // 間隔（8px）に、文字数からの見積もりの余り（半角1文字で数px）が載る。直す前は約34pxの余りが出ていた
  expect(gap).toBeLessThan(16);
});

test('サイドバーを固定した画面幅1100でバーが2段になっても、＋は名前と同じ1段目に残る', async ({ page }) => {
  await open(page, { width: 1100, height: 900 });
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return { barWidth: rect('.context-bar').width, addTop: rect('.workspace-add-pane-button').top, nameTop: rect('.workspace-name').top, textTop: rect('.context-bar button.text-chip').top };
  });
  // この幅では、サイドバーの分だけバーが狭く、2段になる
  expect(layout.barWidth).toBeLessThan(856 + 40);
  expect(Math.abs(layout.addTop - layout.nameTop)).toBeLessThan(12);
  expect(layout.textTop).toBeGreaterThan(layout.addTop + 16);
});

test('スマホ幅: 1段目に＋だけで残り、タップの大きさがあり、押すと一覧がバーの幅に収まって開き、選ぶと足せる', async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  const button = page.getByRole('button', { name: 'ペインを追加' });
  await expect(button).toBeVisible();
  const layout = await page.evaluate(() => {
    const button = document.querySelector('.workspace-add-pane-button')!.getBoundingClientRect();
    const name = document.querySelector('.workspace-name')!.getBoundingClientRect();
    const text = document.querySelector('.context-bar button.text-chip')!.getBoundingClientRect();
    const label = document.querySelector('.workspace-add-pane-label')!.getBoundingClientRect();
    return {
      buttonWidth: button.width,
      buttonHeight: button.height,
      buttonTop: button.top,
      buttonBottom: button.bottom,
      nameTop: name.top,
      textTop: text.top,
      textWidth: text.width,
      labelWidth: label.width,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(layout.buttonWidth).toBeGreaterThanOrEqual(24);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(24);
  expect(layout.labelWidth).toBeLessThanOrEqual(1);
  // 名前と同じ1段目にあり、テキストのチップは2段目
  expect(Math.abs(layout.buttonTop - layout.nameTop)).toBeLessThan(12);
  expect(layout.textTop).toBeGreaterThan(layout.buttonBottom - 1);
  expect(layout.textWidth).toBeGreaterThanOrEqual(24);
  expect(layout.overflow).toBeLessThanOrEqual(0);

  await button.click();
  const list = page.getByRole('menu', { name: '追加するペイン' });
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await list.getByRole('menuitem').first().click();
  await expect(page.locator('.workspace-stack-pane')).toHaveCount(2);
});

test('スマホ幅で名前が長くても、＋は1段目に残って画面内に押せる', async ({ page }) => {
  await open(page, { width: 390, height: 844 }, [flow], 'とても長いWorkspaceの名前をつけてバーの幅を使い切る場合');
  const box = (await addButton(page).boundingBox())!;
  const nameBox = (await page.locator('.workspace-name').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(Math.abs(box.y - nameBox.y)).toBeLessThan(12);
  await addButton(page).click();
  await expect(page.getByRole('menu', { name: '追加するペイン' })).toBeVisible();
});

test('空のWorkspaceでは文脈バーに「ペインを追加」を出さず、中央の大きい1つだけにする', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, []);
  await expect(page.locator('.context-bar .workspace-add-pane-button')).toHaveCount(0);
  await expect(page.locator('[data-workspace-empty] .workspace-add-pane-button')).toBeVisible();
  await expect(page.getByRole('button', { name: 'サンプルの並びで始める' })).toBeVisible();
  await page.getByRole('button', { name: 'サンプルの並びで始める' }).click();
  // 並びが入ると、文脈バーに出る
  await expect(page.locator('.context-bar .workspace-add-pane-button')).toBeVisible();
});

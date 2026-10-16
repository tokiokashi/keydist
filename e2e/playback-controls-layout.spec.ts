import { expect, test, type Page } from '@playwright/test';

/**
 * 打鍵再生の操作の行と再生位置の数の配置。再生と一時停止を切り替えても、ボタンの群の折り返しと、
 * 再生位置の数・スライダーの位置が動かないことを確かめる。
 * 幅は、再生の時だけボタンの群が3行に折り返す幅（416px）と、広い幅（1440px）で確かめる。
 */

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const controls = (page: Page) => feature(page).locator('.playback-controls');
const toggle = (page: Page) => feature(page).locator('[data-playback-action="toggle"]');
const seek = (page: Page) => feature(page).locator('[data-playback-seek]');
const position = (page: Page) => feature(page).locator('[data-playback-position]');
const seekLabel = (page: Page) => feature(page).locator('label.playback-seek-label');

/** 操作の群の中の要素の、行の数（縦の位置の種類の数）と、再生と一時停止のボタンの幅 */
async function controlsShape(page: Page) {
  return controls(page).evaluate((element) => {
    const tops = new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top)));
    const button = element.querySelector('[data-playback-action="toggle"]') as HTMLElement;
    return { rows: tops.size, toggleWidth: button.getBoundingClientRect().width };
  });
}

/** 数・スライダーを含む欄・スライダーの位置と大きさ */
async function seekBoxes(page: Page) {
  const box = async (locator: ReturnType<typeof position>) => {
    const { x, y, width, height } = (await locator.boundingBox())!;
    return { x, y, width, height };
  };
  return {
    position: await box(position(page)),
    field: await box(feature(page).locator('.playback-seek')),
    seek: await box(seek(page)),
  };
}

test('数はスライダーのラベルと同じ行にあり、操作の群には無い', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analyzer/playback');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(controls(page).locator('[data-playback-position]')).toHaveCount(0);
  await expect(seekLabel(page)).toHaveText('再生位置');
  const boxes = await seekBoxes(page);
  const label = (await seekLabel(page).boundingBox())!;
  // 数の文字の中心とラベルの文字の中心が同じ行にある
  expect(Math.abs(boxes.position.y + boxes.position.height / 2 - (label.y + label.height / 2))).toBeLessThanOrEqual(3);
});

test('スライダーの読み上げ名は「再生位置」のまま。数が変わっても変わらない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analyzer/playback');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).getByRole('slider', { name: '再生位置', exact: true })).toBeVisible();
  await feature(page).locator('[data-playback-action="forward"]').click();
  await expect(position(page)).toContainText('1 /');
  await expect(feature(page).getByRole('slider', { name: '再生位置', exact: true })).toBeVisible();
});

for (const [name, width] of [
  ['折り返しが状態で変わる幅', 416],
  ['広い幅', 1440],
] as const) {
  test(`${name}（${width}px）で、再生と一時停止を切り替えても、操作の群の折り返しと再生位置の数・スライダーが動かない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/analyzer/playback');
    await expect(feature(page)).toBeVisible({ timeout: 10_000 });
    // 桁数をそろえるため、先に1ステップ進めてから比べる
    await feature(page).locator('[data-playback-action="forward"]').click();
    await expect(position(page)).toContainText('1 /');

    await expect(toggle(page)).toHaveText(/再生/);
    const pausedShape = await controlsShape(page);
    const pausedBoxes = await seekBoxes(page);

    await toggle(page).click();
    await expect(toggle(page)).toHaveText(/一時停止/);
    const playingShape = await controlsShape(page);
    const playingBoxes = await seekBoxes(page);
    await toggle(page).click();
    await expect(toggle(page)).toHaveText(/^.*再生$/);

    expect(playingShape.rows).toBe(pausedShape.rows);
    expect(playingShape.toggleWidth).toBeCloseTo(pausedShape.toggleWidth, 1);
    expect(playingBoxes.position.y).toBeCloseTo(pausedBoxes.position.y, 1);
    expect(playingBoxes.seek).toEqual(pausedBoxes.seek);
    expect(playingBoxes.field).toEqual(pausedBoxes.field);
  });
}

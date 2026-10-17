import { expect, test, type Page } from '@playwright/test';

/**
 * 打鍵再生のシークバーのつまみと、速度グラフの横軸の位置。
 * 再生位置0と最後で、つまみの中心と速度グラフの横軸上の同じ位置が揃うことを、速度グラフの幅の上限が
 * 掛かる幅と掛からない幅で確かめる。間の位置はどちらも再生位置に線形なので、両端が揃えば揃う。
 */

const feature = (page: Page) => page.locator('[data-react-feature="playback"]');
const seek = (page: Page) => feature(page).locator('[data-playback-seek]');

async function openPlayback(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/analyzer/playback');
  await expect(feature(page)).toBeVisible({ timeout: 10_000 });
  await expect(feature(page).locator('[data-playback-rate-cursor-line]')).toBeAttached();
}

/** つまみの中心の横位置。つまみの幅はCSSのカスタムプロパティで決めてあるので、要素の位置と幅から求める。 */
async function thumbCenter(page: Page): Promise<number> {
  return seek(page).evaluate((element) => {
    const input = element as HTMLInputElement;
    const box = input.getBoundingClientRect();
    const thumb = Number.parseFloat(getComputedStyle(input).getPropertyValue('--seek-thumb-size'));
    return box.left + thumb / 2 + (Number(input.value) / Number(input.max)) * (box.width - thumb);
  });
}

for (const [name, width, capped] of [
  ['幅の上限が掛かる', 1440, true],
  ['幅の上限が掛からない', 560, false],
] as const) {
  test(`${name}幅で、つまみの中心が速度グラフの横軸の同じ位置にある`, async ({ page }) => {
    await openPlayback(page, width);
    const total = Number(await seek(page).getAttribute('max'));
    const chartWidth = (await feature(page).locator('[data-playback-rate-chart] svg').boundingBox())!.width;
    if (capped) expect(chartWidth).toBeCloseTo(760, 0);
    else expect(chartWidth).toBeLessThan(760);

    for (const target of [0, total]) {
      await seek(page).fill(String(target));
      await expect(feature(page).locator('[data-playback-position]')).toContainText(`${target} / ${total}`);
      const axis = (await feature(page).locator('[data-playback-rate-cursor-line]').boundingBox())!.x;
      const thumb = await thumbCenter(page);
      console.log(
        `MEASURE viewport=${width} chart=${chartWidth.toFixed(1)} position=${target} thumb=${thumb.toFixed(2)} axis=${axis.toFixed(2)} diff=${(thumb - axis).toFixed(2)}`,
      );
      expect(Math.abs(thumb - axis)).toBeLessThanOrEqual(2);
    }
  });
}

test('速度グラフを押すと、押した位置に最も近い再生位置へ移る', async ({ page }) => {
  await openPlayback(page, 1440);
  const total = Number(await seek(page).getAttribute('max'));
  const hit = (await feature(page).locator('[data-playback-rate-hit]').boundingBox())!;
  const svg = (await feature(page).locator('[data-playback-rate-chart] svg').boundingBox())!;
  // 横軸は、再生位置0が左の余白の右端、最後が右の余白の左端（viewBox 760 のうち 54 と 742）
  const expected = Math.floor(total / 2);
  await page.mouse.click(svg.x + svg.width * ((54 + (expected / total) * 688) / 760), hit.y + hit.height / 2);
  await expect(feature(page).locator('[data-playback-position]')).toContainText(`${expected} / ${total}`);
});

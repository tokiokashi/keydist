import { expect, type Page } from '@playwright/test';

/**
 * 固定を外している時、サイドバーを開くボタンを押す前に、ポインタを左端の帯の外へ動かす部品。
 *
 * ブラウザのマウスは (0,0) から始まり、左端の帯（`.shell-edge`）の上にある。帯はハイドレーションの後に出るので、
 * 出た時点でポインタがそこにあると、重ねて出たサイドバーが開いたままになり、続く開くボタンのクリックが
 * サイドバーに遮られる。ここでは、サイドバーの幅に16pxを足した位置より右へポインタを動かし、サイドバーが隠れるまで待つ。
 * 隠れていれば、ポインタは帯の外にあることが確かめられる。
 */
export async function parkPointerOutsideEdge(page: Page): Promise<void> {
  const sidebar = page.locator('#app-sidebar');
  await expect
    .poll(async () => {
      await page.mouse.move(700, 400);
      // 隠れたサイドバーは右の端が画面の左外へずれているので、右の端が0以下なら隠れている
      return sidebar.evaluate((el) => el.getBoundingClientRect().right <= 0);
    })
    .toBe(true);
}

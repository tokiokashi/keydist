import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * サイドバーのテーマ切替はuseState('system')初期値 -> useEffectで実値読み込み、という
 * 経路だと押下ボタンが一瞬「自動」→実際の値、と切り替わるflickerを起こす。
 * useSyncExternalStoreで外部storeを直接購読させ、マウント後は保存値のまま一度も
 * 変化しないことをMutationObserverで確認する。
 */
test('pressed theme button never flickers through an intermediate value on the sidebar', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'dark' },
    }));
  });

  await page.goto('/input');
  // プリレンダーのHTMLは保存を読めず「自動」を押下状態で描くので、ハイドレーションが済んでから観測を始める。
  await waitForHydration(page);
  await expect(
    page.locator('#app-sidebar [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => {
    (window as any).__pressedSeq = [];
    const readPressed = () => Array.from(document.querySelectorAll('[data-theme-set][aria-pressed="true"]'))
      .map((el) => el.getAttribute('data-theme-set')).join(',');
    const record = () => {
      const val = readPressed();
      const seq = (window as any).__pressedSeq as string[];
      if (val !== '' && seq[seq.length - 1] !== val) seq.push(val);
    };
    record();
    new MutationObserver(record).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-pressed'],
    });
  });

  // 画面遷移でシェルが描き直されても、押下状態は保存値のまま変わらない。
  await page.locator('#app-sidebar a[href="/analyzer/heatmap"]').click();
  await expect(page).toHaveURL(/\/analyzer\/heatmap$/);
  await expect(page.locator('#app-sidebar [data-theme-set="dark"]')).toHaveAttribute('aria-pressed', 'true');

  const pressedSeq = await page.evaluate(() => (window as any).__pressedSeq as string[]);
  expect(pressedSeq).toEqual(['dark']);
});

test('a theme change in another tab syncs the controls via the storage event', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await pageA.goto('/input');
  await pageB.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await pageB.goto('/input');

  await expect(
    pageA.locator('#app-sidebar [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    pageB.locator('#app-sidebar [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await pageA.locator('#app-sidebar [data-theme-set="dark"]').click();

  // pageBはstorage eventを受けてタブを跨いで自動的に追従する。
  await expect(
    pageB.locator('#app-sidebar [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(pageB.locator('html')).toHaveAttribute('data-theme', 'dark');
});

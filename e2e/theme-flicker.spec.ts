import { expect, test } from '@playwright/test';

/**
 * AnalyzerThemeControlsはuseState('system')初期値 -> useEffectで実値読み込み、という
 * 経路だと押下ボタンが一瞬「自動」→実際の値、と切り替わるflickerを起こす（#508レビュー Item A）。
 * useSyncExternalStoreで外部storeを直接購読させ、マウント後は保存値のまま一度も
 * 変化しないことをMutationObserverで確認する。
 */
test('pressed theme button never flickers through an intermediate value on /analyzer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'dark' },
    }));
    (window as any).__pressedSeq = [];
    function readPressed(): string {
      const els = document.querySelectorAll('[data-theme-set][aria-pressed="true"]');
      return Array.from(els).map((el) => el.getAttribute('data-theme-set')).join(',');
    }
    function record(): void {
      const val = readPressed();
      const seq = (window as any).__pressedSeq as string[];
      if (val !== '' && seq[seq.length - 1] !== val) seq.push(val);
    }
    const start = () => {
      record();
      new MutationObserver(record).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-pressed'],
      });
    };
    if (document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
  });

  await page.goto('/analyzer');
  await expect(
    page.locator('[data-react-feature="theme-controls"] [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');

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
  await pageA.goto('/analyzer');
  await pageB.addInitScript(() => {
    localStorage.setItem('keydist:app-state', JSON.stringify({
      version: 2,
      appearance: { theme: 'light' },
    }));
  });
  await pageB.goto('/analyzer');

  await expect(
    pageA.locator('[data-react-feature="theme-controls"] [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    pageB.locator('[data-react-feature="theme-controls"] [data-theme-set="light"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await pageA.locator('[data-react-feature="theme-controls"] [data-theme-set="dark"]').click();

  // pageBはstorage eventを受けてタブを跨いで自動的に追従する。
  await expect(
    pageB.locator('[data-react-feature="theme-controls"] [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(pageB.locator('html')).toHaveAttribute('data-theme', 'dark');
});

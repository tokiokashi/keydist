import type { Page } from '@playwright/test';

/**
 * 解析設定の操作部品について、ページを開いた瞬間からの「操作可能か・表示中の値」の
 * 移り変わりを記録する。保存済みの設定を読み込んだ後、操作可能な間に既定値が
 * 1フレームでも出ていれば、その間の操作が既定値ベースで書き込まれてしまう。
 * 記録は描画のたび（MutationObserver）と毎フレームで取り、同じ状態の連続は1つに畳む。
 */
export async function recordControlStates(
  page: Page,
  seed: { readonly storageKey: string; readonly storageValue: string },
  control: { readonly selector: string; readonly read: 'value' | 'checked' },
): Promise<void> {
  await page.addInitScript(({ seed, control }) => {
    localStorage.setItem(seed.storageKey, seed.storageValue);
    const states: string[] = [];
    (window as unknown as { __controlStates: string[] }).__controlStates = states;
    const record = () => {
      const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(control.selector);
      if (element === null) return;
      const value = control.read === 'checked' ? String((element as HTMLInputElement).checked) : element.value;
      const state = `${element.matches(':disabled') ? 'disabled' : 'enabled'}:${value}`;
      if (states[states.length - 1] !== state) states.push(state);
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const everyFrame = () => {
      record();
      requestAnimationFrame(everyFrame);
    };
    requestAnimationFrame(everyFrame);
  }, { seed, control });
}

/** 記録のうち、操作可能だった間に表示された値だけを順に返す。 */
export async function enabledValues(page: Page): Promise<readonly string[]> {
  const states = await page.evaluate(() => (window as unknown as { __controlStates: string[] }).__controlStates);
  return states.filter((state) => state.startsWith('enabled:')).map((state) => state.slice('enabled:'.length));
}

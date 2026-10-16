export type ThemeChoice = 'light' | 'dark' | 'system';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Client bundleより先にdocument rootへthemeを確定するためのhead script。
 * `keydist:app-state` の `appearance.theme` だけを読む。無効な値や保存の無い時は `system`（属性なし）にする。
 */
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const valid = (value) => value === 'light' || value === 'dark' || value === 'system';
  let theme = 'system';
  try {
    const raw = localStorage.getItem('keydist:app-state');
    const state = raw ? JSON.parse(raw) : null;
    if (valid(state?.appearance?.theme)) theme = state.appearance.theme;
  } catch {}
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
})();`;

/** AppStateで選ばれたテーマをdocument rootへ反映する。 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

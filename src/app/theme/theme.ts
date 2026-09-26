export type ThemeChoice = 'light' | 'dark' | 'system';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Client bundleより先にdocument rootへthemeを確定するためのhead script。
 * AppState appearanceを正とし、移行前データだけread-only fallbackとして参照する。
 */
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const valid = (value) => value === 'light' || value === 'dark' || value === 'system';
  let theme = 'system';
  let found = false;
  // loadAppearancePreferenceと同じ優先順で、候補ごとに個別に検証してfallbackする。
  // 無効値が混ざっていてもそこで止めず次の候補へ進む（旧実装は??で1段しか見ず、
  // 不正値があると本来通るはずのfallbackを塞いでいた）。
  try {
    const raw = localStorage.getItem('keydist:app-state');
    const state = raw ? JSON.parse(raw) : null;
    if (valid(state?.appearance?.theme)) { theme = state.appearance.theme; found = true; }
    else if (valid(state?.analyzer?.theme)) { theme = state.analyzer.theme; found = true; }
  } catch {}
  if (!found) {
    try {
      const legacyRaw = localStorage.getItem('keydist:ui-state');
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      if (valid(legacy?.ui?.theme)) { theme = legacy.ui.theme; found = true; }
    } catch {}
  }
  if (!found) {
    try {
      const legacyTheme = localStorage.getItem('keydist:theme');
      if (valid(legacyTheme)) theme = legacyTheme;
    } catch {}
  }
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
})();`;

/** AppStateで選ばれたテーマをdocument rootへ反映する。 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

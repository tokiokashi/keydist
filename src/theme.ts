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
  try {
    const raw = localStorage.getItem('keydist:app-state');
    const state = raw ? JSON.parse(raw) : null;
    const candidate = state?.appearance?.theme ?? state?.analyzer?.theme;
    if (valid(candidate)) theme = candidate;
    else {
      const legacyRaw = localStorage.getItem('keydist:ui-state');
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      const legacyCandidate = legacy?.ui?.theme ?? localStorage.getItem('keydist:theme');
      if (valid(legacyCandidate)) theme = legacyCandidate;
    }
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

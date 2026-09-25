import type {
  AnalyzerPreferencesV2,
  AppearancePreferencesV1,
  AppStateV2,
} from './app-state.ts';
import {
  loadAppStateDocument,
  patchAppState,
  removeStorageKeys,
  saveAppStateDocument,
} from './persistence/app-state-storage.ts';
import {
  LEGACY_THEME_KEY,
  UI_STATE_STORAGE_KEY,
  type UiStateStorage,
} from './ui-state.ts';
import { isThemeChoice, type ThemeChoice } from './theme.ts';

export const DEFAULT_APPEARANCE: AppearancePreferencesV1 = { theme: 'system' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function themeFromLegacyAnalyzer(appState: AppStateV2): ThemeChoice | undefined {
  const analyzer = appState.analyzer as unknown;
  if (!isRecord(analyzer)) return undefined;
  return isThemeChoice(analyzer.theme) ? analyzer.theme : undefined;
}

function themeFromLegacyUiState(storage: UiStateStorage): ThemeChoice | undefined {
  try {
    const raw = storage.getItem(UI_STATE_STORAGE_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.ui)) return undefined;
    return isThemeChoice(parsed.ui.theme) ? parsed.ui.theme : undefined;
  } catch {
    return undefined;
  }
}

function themeFromLegacyKey(storage: UiStateStorage): ThemeChoice | undefined {
  try {
    const value = storage.getItem(LEGACY_THEME_KEY);
    return isThemeChoice(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function removeLegacyAnalyzerTheme(storage: UiStateStorage): boolean {
  const current = loadAppStateDocument(storage);
  const analyzer = current.analyzer as unknown;
  if (!isRecord(analyzer) || !('theme' in analyzer)) return true;

  const { theme: _theme, ...withoutTheme } = analyzer;
  return saveAppStateDocument(storage, {
    ...current,
    analyzer: withoutTheme as AnalyzerPreferencesV2,
  });
}

function cleanupLegacyAppearanceSources(storage: UiStateStorage): void {
  if (!removeLegacyAnalyzerTheme(storage)) return;
  removeStorageKeys(storage, [LEGACY_THEME_KEY]);
}

/**
 * App-level appearance authority.
 *
 * 既存の AppState.analyzer.theme / UiStateV1 / keydist:theme は read-once source として扱い、
 * appearance 保存成功後に Analyzer slice の theme と旧theme keyを掃除する。
 * keydist:ui-state 自体は Analyzer migration が他fieldを読み終えるまで残す。
 */
export function loadAppearancePreference(
  storage: UiStateStorage,
  fallback: ThemeChoice = DEFAULT_APPEARANCE.theme,
): AppearancePreferencesV1 {
  const current = loadAppStateDocument(storage);
  const storedTheme = current.appearance?.theme;
  if (isThemeChoice(storedTheme)) {
    cleanupLegacyAppearanceSources(storage);
    return { theme: storedTheme };
  }

  const theme = themeFromLegacyAnalyzer(current)
    ?? themeFromLegacyUiState(storage)
    ?? themeFromLegacyKey(storage)
    ?? fallback;

  const appearance = { theme };
  if (patchAppState(storage, { appearance })) cleanupLegacyAppearanceSources(storage);
  return appearance;
}

export function saveAppearancePreference(
  storage: UiStateStorage,
  theme: ThemeChoice,
): boolean {
  const saved = patchAppState(storage, { appearance: { theme } });
  if (saved) cleanupLegacyAppearanceSources(storage);
  return saved;
}

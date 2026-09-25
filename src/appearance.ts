import type {
  AnalyzerPreferencesV2,
  AppearancePreferencesV1,
  AppStateV2,
} from './app-state.ts';
import {
  APP_STATE_STORAGE_KEY,
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
import { applyTheme, isThemeChoice, type ThemeChoice } from './theme.ts';

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

/**
 * Appearance用の外部store。
 *
 * AnalyzerThemeControlsと（将来の共通ヘッダー等の）他のtheme控件が
 * それぞれ独立にstorageを読むと、片方の更新がもう片方に反映されず
 * ボタンの押下状態がズレる。useSyncExternalStoreからこのstoreを購読させることで、
 * どの控件から変更してもsubscribe中の全controlへ同期する。
 */
let currentTheme: ThemeChoice = DEFAULT_APPEARANCE.theme;
let storeInitialized = false;
const appearanceListeners = new Set<() => void>();

function notifyAppearanceListeners(): void {
  for (const listener of appearanceListeners) listener();
}

function handleStorageEvent(event: StorageEvent): void {
  // 他タブでの変更（keyがnullのstorage.clear()も含む）を拾う。
  if (event.key !== null && event.key !== APP_STATE_STORAGE_KEY) return;
  const next = loadAppearancePreference(window.localStorage).theme;
  if (next === currentTheme) return;
  currentTheme = next;
  applyTheme(currentTheme);
  notifyAppearanceListeners();
}

function ensureAppearanceStoreInitialized(): void {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;
  currentTheme = loadAppearancePreference(window.localStorage).theme;
  window.addEventListener('storage', handleStorageEvent);
}

/** SSR/server snapshot用。storageへは一切触れない。 */
export function getServerAppearanceSnapshot(): ThemeChoice {
  return DEFAULT_APPEARANCE.theme;
}

export function getAppearanceSnapshot(): ThemeChoice {
  ensureAppearanceStoreInitialized();
  return currentTheme;
}

export function subscribeAppearance(listener: () => void): () => void {
  ensureAppearanceStoreInitialized();
  appearanceListeners.add(listener);
  return () => { appearanceListeners.delete(listener); };
}

export function setAppearanceTheme(theme: ThemeChoice): void {
  ensureAppearanceStoreInitialized();
  currentTheme = theme;
  applyTheme(theme);
  saveAppearancePreference(window.localStorage, theme);
  notifyAppearanceListeners();
}

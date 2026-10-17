import type { AppearancePreferencesV1 } from '../state/app-state.ts';
import { APP_STATE_STORAGE_KEY, loadAppStateDocument, patchAppState } from '../state/app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { applyTheme, isThemeChoice, type ThemeChoice } from './theme.ts';

export const DEFAULT_APPEARANCE: AppearancePreferencesV1 = { theme: 'system' };

/**
 * 外観の設定の読み書き。保存先は `keydist:app-state` の `appearance` だけで、
 * 保存が無い・値が不正な時は `fallback` を返す（storageには書かない）。
 */
export function loadAppearancePreference(storage: KeyValueStorage, fallback: ThemeChoice = DEFAULT_APPEARANCE.theme): AppearancePreferencesV1 {
  const storedTheme = loadAppStateDocument(storage).appearance?.theme;
  return { theme: isThemeChoice(storedTheme) ? storedTheme : fallback };
}

export function saveAppearancePreference(storage: KeyValueStorage, theme: ThemeChoice): boolean {
  return patchAppState(storage, { appearance: { theme } });
}

/**
 * Appearance用の外部store。
 *
 * サイドバーと（将来の共通ヘッダー等の）他のtheme控件が
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
  return () => {
    appearanceListeners.delete(listener);
  };
}

export function setAppearanceTheme(theme: ThemeChoice): void {
  ensureAppearanceStoreInitialized();
  currentTheme = theme;
  applyTheme(theme);
  saveAppearancePreference(window.localStorage, theme);
  notifyAppearanceListeners();
}

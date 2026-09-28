import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { APP_STATE_STORAGE_KEY, loadAppStateDocument, patchAppState } from '../state/app-state-storage.ts';

/**
 * サイドバーの固定（パソコン幅）をこのブラウザに覚える。
 *
 * 固定しているかは `<html data-sidebar="unpinned">` の有無で見た目に効かせる。
 * Reactの状態から付けるとプリレンダーしたHTMLが一度「固定」で描かれてから引っ込むので、
 * テーマと同じくhead scriptで先に付ける（`SIDEBAR_BOOTSTRAP_SCRIPT`）。
 */
export const DEFAULT_SIDEBAR_PINNED = true;

export function loadSidebarPinned(storage: KeyValueStorage): boolean {
  return loadAppStateDocument(storage).shell?.sidebarPinned !== false;
}

export function saveSidebarPinned(storage: KeyValueStorage, pinned: boolean): boolean {
  return patchAppState(storage, { shell: { sidebarPinned: pinned } });
}

/** `data-sidebar` を付け外しする。固定が既定なので、外した時だけ付ける。 */
export function applySidebarPinned(pinned: boolean): void {
  const root = document.documentElement;
  if (pinned) root.removeAttribute('data-sidebar');
  else root.setAttribute('data-sidebar', 'unpinned');
}

export const SIDEBAR_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const raw = localStorage.getItem('${APP_STATE_STORAGE_KEY}');
    const state = raw ? JSON.parse(raw) : null;
    if (state?.shell?.sidebarPinned === false) document.documentElement.setAttribute('data-sidebar', 'unpinned');
  } catch {}
})();`;

/** localStorageは取り出すだけで例外になる環境がある（保存を拒否した設定・一部のプライベートウィンドウ）。 */
function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

let currentPinned = DEFAULT_SIDEBAR_PINNED;
let storeInitialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== APP_STATE_STORAGE_KEY) return;
  const storage = browserStorage();
  if (storage === undefined) return;
  const next = loadSidebarPinned(storage);
  if (next === currentPinned) return;
  currentPinned = next;
  applySidebarPinned(next);
  notify();
}

function ensureInitialized(): void {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;
  const storage = browserStorage();
  currentPinned = storage === undefined ? DEFAULT_SIDEBAR_PINNED : loadSidebarPinned(storage);
  window.addEventListener('storage', handleStorageEvent);
}

export function getSidebarPinnedSnapshot(): boolean {
  ensureInitialized();
  return currentPinned;
}

export function getServerSidebarPinnedSnapshot(): boolean {
  return DEFAULT_SIDEBAR_PINNED;
}

export function subscribeSidebarPinned(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setSidebarPinned(pinned: boolean): void {
  ensureInitialized();
  currentPinned = pinned;
  applySidebarPinned(pinned);
  const storage = browserStorage();
  if (storage !== undefined) saveSidebarPinned(storage, pinned);
  notify();
}

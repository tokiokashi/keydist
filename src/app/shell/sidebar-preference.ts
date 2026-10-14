import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { APP_STATE_VERSION, type ShellPreferencesV1 } from '../state/app-state.ts';
import { APP_STATE_STORAGE_KEY, loadAppStateDocument, patchAppState } from '../state/app-state-storage.ts';

/**
 * サイドバーの固定（パソコン幅）と、畳んだ見出しのまとまりをこのブラウザに覚える。
 * 2つは `keydist:app-state` の同じ `shell` に置くので、片方を保存してももう片方の値を消さない。
 *
 * 固定しているかは `<html data-sidebar="unpinned">` の有無、畳んだまとまりは
 * `<html data-sidebar-collapsed="analyze about">` のような空白区切りの属性で見た目に効かせる。
 * Reactの状態から付けるとプリレンダーしたHTMLが一度「固定」「全部開いた状態」で描かれてから変わるので、
 * テーマと同じくhead scriptで先に付ける（`SIDEBAR_BOOTSTRAP_SCRIPT`）。
 */
export const DEFAULT_SIDEBAR_PINNED = true;

/** 畳める見出しのまとまり。順序は属性・保存値の並びの正準形になる。 */
export const SIDEBAR_GROUP_IDS = ['analyze', 'workspace', 'assets', 'about'] as const;
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];

const NO_COLLAPSED: readonly SidebarGroupId[] = Object.freeze([]);

/** 保存値から畳んだまとまりを取り出す。配列でない時と知らない識別子は無いものとして、開いた状態にする。 */
function decodeCollapsed(value: unknown): readonly SidebarGroupId[] {
  if (!Array.isArray(value)) return NO_COLLAPSED;
  const collapsed = SIDEBAR_GROUP_IDS.filter((id) => value.includes(id));
  return collapsed.length === 0 ? NO_COLLAPSED : collapsed;
}

function sameCollapsed(a: readonly SidebarGroupId[], b: readonly SidebarGroupId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function loadSidebarPinned(storage: KeyValueStorage): boolean {
  return loadAppStateDocument(storage).shell?.sidebarPinned !== false;
}

export function loadSidebarCollapsed(storage: KeyValueStorage): readonly SidebarGroupId[] {
  return decodeCollapsed(loadAppStateDocument(storage).shell?.sidebarCollapsed);
}

/** `shell` の一部だけを書き換える。書き換えない項目は保存済みの値のまま残す。 */
function patchShell(storage: KeyValueStorage, patch: Partial<ShellPreferencesV1>): boolean {
  const current = loadAppStateDocument(storage).shell;
  return patchAppState(storage, {
    shell: { ...current, sidebarPinned: current?.sidebarPinned !== false, ...patch },
  });
}

export function saveSidebarPinned(storage: KeyValueStorage, pinned: boolean): boolean {
  return patchShell(storage, { sidebarPinned: pinned });
}

export function saveSidebarCollapsed(storage: KeyValueStorage, collapsed: readonly SidebarGroupId[]): boolean {
  return patchShell(storage, { sidebarCollapsed: decodeCollapsed(collapsed) });
}

/** `data-sidebar` を付け外しする。固定が既定なので、外した時だけ付ける。 */
export function applySidebarPinned(pinned: boolean): void {
  const root = document.documentElement;
  if (pinned) root.removeAttribute('data-sidebar');
  else root.setAttribute('data-sidebar', 'unpinned');
}

/** `data-sidebar-collapsed` を付け外しする。全部開いているのが既定なので、畳んだものがある時だけ付ける。 */
export function applySidebarCollapsed(collapsed: readonly SidebarGroupId[]): void {
  const root = document.documentElement;
  if (collapsed.length === 0) root.removeAttribute('data-sidebar-collapsed');
  else root.setAttribute('data-sidebar-collapsed', collapsed.join(' '));
}

export const SIDEBAR_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const raw = localStorage.getItem('${APP_STATE_STORAGE_KEY}');
    const state = raw ? JSON.parse(raw) : null;
    const root = document.documentElement;
    if (state === null || typeof state !== 'object' || state.version !== ${APP_STATE_VERSION}) return;
    if (state?.shell?.sidebarPinned === false) root.setAttribute('data-sidebar', 'unpinned');
    const stored = state?.shell?.sidebarCollapsed;
    if (Array.isArray(stored)) {
      const collapsed = ${JSON.stringify(SIDEBAR_GROUP_IDS)}.filter((id) => stored.includes(id));
      if (collapsed.length > 0) root.setAttribute('data-sidebar-collapsed', collapsed.join(' '));
    }
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
let currentCollapsed: readonly SidebarGroupId[] = NO_COLLAPSED;
let storeInitialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== APP_STATE_STORAGE_KEY) return;
  const storage = browserStorage();
  if (storage === undefined) return;
  const nextPinned = loadSidebarPinned(storage);
  const nextCollapsed = loadSidebarCollapsed(storage);
  if (nextPinned === currentPinned && sameCollapsed(nextCollapsed, currentCollapsed)) return;
  currentPinned = nextPinned;
  currentCollapsed = nextCollapsed;
  applySidebarPinned(nextPinned);
  applySidebarCollapsed(nextCollapsed);
  notify();
}

function ensureInitialized(): void {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;
  const storage = browserStorage();
  currentPinned = storage === undefined ? DEFAULT_SIDEBAR_PINNED : loadSidebarPinned(storage);
  currentCollapsed = storage === undefined ? NO_COLLAPSED : loadSidebarCollapsed(storage);
  window.addEventListener('storage', handleStorageEvent);
}

export function getSidebarPinnedSnapshot(): boolean {
  ensureInitialized();
  return currentPinned;
}

export function getServerSidebarPinnedSnapshot(): boolean {
  return DEFAULT_SIDEBAR_PINNED;
}

export function subscribeSidebarPreferences(listener: () => void): () => void {
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

export function getSidebarCollapsedSnapshot(): readonly SidebarGroupId[] {
  ensureInitialized();
  return currentCollapsed;
}

export function getServerSidebarCollapsedSnapshot(): readonly SidebarGroupId[] {
  return NO_COLLAPSED;
}

/** 見出しのまとまりを畳む・開く。他のまとまりの開閉は変えない。 */
export function setSidebarGroupCollapsed(id: SidebarGroupId, collapsed: boolean): void {
  ensureInitialized();
  const next = decodeCollapsed(collapsed ? [...currentCollapsed, id] : currentCollapsed.filter((current) => current !== id));
  if (sameCollapsed(next, currentCollapsed)) return;
  currentCollapsed = next;
  applySidebarCollapsed(next);
  const storage = browserStorage();
  if (storage !== undefined) saveSidebarCollapsed(storage, next);
  notify();
}

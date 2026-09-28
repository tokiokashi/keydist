import {
  APP_STATE_VERSION,
  type AppStateSliceKey,
  type AppStateV2,
} from './app-state.ts';
import { notifyKeydistStorageChange } from '#platform/browser-storage-events.ts';
import {
  createDebouncedPersistenceScheduler,
  type DebouncedPersistenceScheduler,
} from '#platform/persistence/debounced-scheduler.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';

export const APP_STATE_STORAGE_KEY = 'keydist:app-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeAppStateDocument(raw: string | null): AppStateV2 {
  if (raw === null) return { version: APP_STATE_VERSION };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== APP_STATE_VERSION) {
      return { version: APP_STATE_VERSION };
    }
    return parsed as unknown as AppStateV2;
  } catch {
    return { version: APP_STATE_VERSION };
  }
}

export function loadAppStateDocument(storage: KeyValueStorage): AppStateV2 {
  try {
    return decodeAppStateDocument(storage.getItem(APP_STATE_STORAGE_KEY));
  } catch {
    return { version: APP_STATE_VERSION };
  }
}

export function saveAppStateDocument(storage: KeyValueStorage, state: AppStateV2): boolean {
  try {
    storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
      ...state,
      version: APP_STATE_VERSION,
    }));
    notifyKeydistStorageChange(APP_STATE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function patchAppState(
  storage: KeyValueStorage,
  patch: Partial<Omit<AppStateV2, 'version'>>,
): boolean {
  const current = loadAppStateDocument(storage);
  return saveAppStateDocument(storage, {
    ...current,
    ...structuredClone(patch),
    version: APP_STATE_VERSION,
  });
}

export function patchAppStateSlice<K extends AppStateSliceKey>(
  storage: KeyValueStorage,
  key: K,
  value: NonNullable<AppStateV2[K]>,
): boolean {
  return patchAppState(storage, { [key]: value } as Partial<Omit<AppStateV2, 'version'>>);
}

export function removeStorageKeys(
  storage: KeyValueStorage,
  keys: readonly string[],
): void {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // AppStateの保存が成立していれば旧key cleanup失敗は致命的ではない。
    }
  }
}

export function loadOrMigrateAppStateSlice<K extends AppStateSliceKey>(
  storage: KeyValueStorage,
  key: K,
  options: {
    decode: (value: unknown) => NonNullable<AppStateV2[K]>;
    loadLegacy: () => NonNullable<AppStateV2[K]>;
    legacyKeys: readonly string[];
  },
): NonNullable<AppStateV2[K]> {
  const current = loadAppStateDocument(storage);
  const stored = current[key];
  if (stored !== undefined) {
    const decoded = options.decode(stored);
    removeStorageKeys(storage, options.legacyKeys);
    return decoded;
  }

  const migrated = options.loadLegacy();
  if (patchAppStateSlice(storage, key, migrated)) {
    removeStorageKeys(storage, options.legacyKeys);
  }
  return migrated;
}

export type AppStateSliceScheduler<T> = DebouncedPersistenceScheduler<T>;

export function createAppStateSliceScheduler<K extends AppStateSliceKey>(
  storage: KeyValueStorage,
  key: K,
  serialize: (value: NonNullable<AppStateV2[K]>) => string,
  debounceMs?: number,
): AppStateSliceScheduler<NonNullable<AppStateV2[K]>> {
  return createDebouncedPersistenceScheduler({
    write: (value) => { patchAppStateSlice(storage, key, value); },
    serialize,
    debounceMs,
  });
}

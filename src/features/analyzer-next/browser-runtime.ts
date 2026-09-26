import {
  subscribeKeydistStorageChanges,
} from '#platform/browser-storage-events.ts';
import {
  APP_STATE_STORAGE_KEY,
} from '#app/state/app-state-storage.ts';
import {
  ROMAJI_SETTINGS_STORAGE_KEY,
} from '#platform/assets/romaji-settings-storage.ts';
import {
  USER_GEOMETRIES_STORAGE_KEY,
} from '#platform/assets/user-geometries-storage.ts';
import {
  USER_LAYOUTS_STORAGE_KEY,
} from '#platform/assets/user-layouts-storage.ts';
import {
  analysisDomainCatalogSourceFromRuntimeSource,
  createBrowserAnalysisRuntime,
  loadBrowserAnalysisRuntimeSource,
  type AnalysisRuntime,
} from './runtime.ts';

const DOMAIN_SOURCE_STORAGE_KEYS = [
  APP_STATE_STORAGE_KEY,
  USER_LAYOUTS_STORAGE_KEY,
  USER_GEOMETRIES_STORAGE_KEY,
  ROMAJI_SETTINGS_STORAGE_KEY,
] as const;

let sharedRuntime: AnalysisRuntime | undefined;
let unsubscribeStorage: (() => void) | undefined;

function refreshDomainSource(): void {
  if (!sharedRuntime) return;
  const source = loadBrowserAnalysisRuntimeSource();
  sharedRuntime.catalog.replaceSource(
    analysisDomainCatalogSourceFromRuntimeSource(source),
  );
}

function ensureDomainSourceSubscription(): void {
  unsubscribeStorage ??= subscribeKeydistStorageChanges(
    DOMAIN_SOURCE_STORAGE_KEYS,
    refreshDomainSource,
  );
}

/**
 * Browser-side Analyzer Next composition root shared by standalone Views and the future Workspace.
 *
 * Session/cache lifetime is stable across SPA navigation. Mutable domain assets are refreshed
 * independently, so editing layouts/romaji/geometry never recreates or silently resets Session.
 */
export function getBrowserAnalysisRuntime(): AnalysisRuntime {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserAnalysisRuntime must run in a browser');
  }

  if (!sharedRuntime) {
    sharedRuntime = createBrowserAnalysisRuntime();
    ensureDomainSourceSubscription();
  } else {
    // Also catch writes performed by legacy/direct localStorage callers that predate
    // notifyKeydistStorageChange. replaceSource is a no-op when the source is unchanged.
    refreshDomainSource();
  }
  return sharedRuntime;
}

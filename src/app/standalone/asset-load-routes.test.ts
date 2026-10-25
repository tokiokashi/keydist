import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';
import { dismissAssetLoadNotices, getAssetLoadNoticesSnapshot, resetAssetLoadNoticesForTest } from './asset-load-notice.ts';
import { assetNoticeText } from './asset-load-notice-text.ts';
import type { WorkspaceLibrary } from '#engine/workspace.ts';
import { createAssetStore } from './asset-store.ts';
import { createWorkspaceLibrarySync, loadWorkspaceLibrary } from './workspace-library-sync.ts';

function createFakeStorage() {
  const map = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return { storage, map };
}

function createFakeBus() {
  const listeners = new Set<(key: string) => void>();
  return {
    subscribe: (keys: readonly string[], listener: (key: string) => void) => {
      const watched = new Set(keys);
      const wrapped = (key: string) => {
        if (watched.has(key)) listener(key);
      };
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },
    notify: (key: string) => {
      for (const listener of listeners) listener(key);
    },
  };
}

const WORKSPACES_KEY = ASSET_STORAGE_SPECS.workspaces.storageKey;
const BROKEN = '{壊れたJSON';
const FUTURE = JSON.stringify({ version: ASSET_STORAGE_SPECS.workspaces.codec.currentVersion + 1, 将来: true });
const VALID = JSON.stringify({ version: ASSET_STORAGE_SPECS.workspaces.codec.currentVersion, workspaces: [] });

beforeEach(() => {
  resetAssetLoadNoticesForTest();
});

for (const key of ASSET_KEYS) {
  const storageKey = ASSET_STORAGE_SPECS[key].storageKey;
  for (const [label, raw] of [
    ['JSONとして読めない値', BROKEN],
    ['新しい版の値', JSON.stringify({ version: ASSET_STORAGE_SPECS[key].codec.currentVersion + 1, 将来: true })],
  ] as const) {
    test(`${key}: 別のタブが${label}を書くと、このタブの知らせに出し、手元の値は変えない`, () => {
      const { storage, map } = createFakeStorage();
      const bus = createFakeBus();
      const store = createAssetStore({ storage, subscribe: bus.subscribe, notify: bus.notify });
      store.start();
      assert.deepEqual(getAssetLoadNoticesSnapshot(), []);
      const before = store.getAssets();

      map.set(storageKey, raw);
      bus.notify(storageKey);

      assert.deepEqual(getAssetLoadNoticesSnapshot(), [{ key, kind: 'unreadable-elsewhere', diagnostics: [] }]);
      assert.equal(store.getAssets(), before);
      assert.equal(map.get(storageKey), raw, '知らせるだけで書き戻さない');
    });
  }
}

test('別のタブが読める値を書いた時は知らせない', () => {
  const { storage, map } = createFakeStorage();
  const bus = createFakeBus();
  createAssetStore({ storage, subscribe: bus.subscribe, notify: bus.notify }).start();
  map.set(WORKSPACES_KEY, VALID);
  bus.notify(WORKSPACES_KEY);
  assert.deepEqual(getAssetLoadNoticesSnapshot(), []);
});

test('別のタブが読めない値を書いた時の文は、初期の状態で開いたとは言わない', () => {
  const text = assetNoticeText({ key: 'workspaces', kind: 'unreadable-elsewhere', diagnostics: [] });
  assert.match(text, /^Workspace: 別のタブが読めない保存データを書き込みました/);
  assert.doesNotMatch(text, /初期の状態/);
});

test('Workspaceの読み込み: 保存データが無い・読める時は知らせない', () => {
  const { storage, map } = createFakeStorage();
  const sync = createWorkspaceLibrarySync({ storage, onExternalChange: () => {} });
  assert.deepEqual(loadWorkspaceLibrary(sync), []);
  map.set(WORKSPACES_KEY, VALID);
  assert.deepEqual(loadWorkspaceLibrary(sync), []);
  assert.deepEqual(getAssetLoadNoticesSnapshot(), []);
});

for (const [label, raw, kind] of [
  ['読めない値', BROKEN, 'reset'],
  ['新しい版の値', FUTURE, 'newer-version'],
] as const) {
  test(`Workspaceの読み込み: ${label}は知らせ、無いものとして扱う`, () => {
    const { storage, map } = createFakeStorage();
    map.set(WORKSPACES_KEY, raw);
    const sync = createWorkspaceLibrarySync({ storage, onExternalChange: () => {} });

    assert.deepEqual(loadWorkspaceLibrary(sync), []);
    assert.deepEqual(getAssetLoadNoticesSnapshot(), [{ key: 'workspaces', kind, diagnostics: [] }]);
    assert.equal(map.get(WORKSPACES_KEY), raw, '読むだけで書き戻さない');
  });
}

test('Workspaceの読み込み: 資産のストアが同じ値を知らせた後に読んでも、同じ資産の行は1つ', () => {
  const { storage, map } = createFakeStorage();
  map.set(WORKSPACES_KEY, FUTURE);
  createAssetStore({ storage, notify: () => {} }).start();
  loadWorkspaceLibrary(createWorkspaceLibrarySync({ storage, onExternalChange: () => {} }));
  assert.equal(getAssetLoadNoticesSnapshot().filter((notice) => notice.key === 'workspaces').length, 1);
});

test('Workspaceの読み込み: 資産のストアより先に読んで知らせた後にストアが読んでも、行は1つ', () => {
  const { storage, map } = createFakeStorage();
  map.set(WORKSPACES_KEY, BROKEN);
  loadWorkspaceLibrary(createWorkspaceLibrarySync({ storage, onExternalChange: () => {} }));
  createAssetStore({ storage, notify: () => {} }).start();
  assert.equal(getAssetLoadNoticesSnapshot().filter((notice) => notice.key === 'workspaces').length, 1);
});

test('Workspaceの読み込み: 新しい版の値は、知らせを閉じた後に読み直しても出し直さない', () => {
  const { storage, map } = createFakeStorage();
  map.set(WORKSPACES_KEY, FUTURE);
  const sync = createWorkspaceLibrarySync({ storage, onExternalChange: () => {} });
  loadWorkspaceLibrary(sync);
  dismissAssetLoadNotices();
  loadWorkspaceLibrary(sync);
  assert.deepEqual(getAssetLoadNoticesSnapshot(), []);
});

test('Workspaceの購読: 別のタブが読めない値を書いた時は、別のタブの書き込みとして知らせる', () => {
  const { storage, map } = createFakeStorage();
  const bus = createFakeBus();
  const received: unknown[] = [];
  const sync = createAssetSyncFor(storage, bus, (library) => received.push(library));
  loadWorkspaceLibrary(sync);
  const stop = sync.start();

  map.set(WORKSPACES_KEY, BROKEN);
  bus.notify(WORKSPACES_KEY);

  assert.deepEqual(getAssetLoadNoticesSnapshot(), [{ key: 'workspaces', kind: 'unreadable-elsewhere', diagnostics: [] }]);
  assert.deepEqual(received, []);
  stop();
});

function createAssetSyncFor(storage: KeyValueStorage, bus: ReturnType<typeof createFakeBus>, onExternalChange: (library: WorkspaceLibrary) => void) {
  return createWorkspaceLibrarySync({ storage, subscribe: bus.subscribe, onExternalChange });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_STATE_VERSION, type AppStateV2 } from './app-state.ts';
import {
  APP_STATE_STORAGE_KEY,
  decodeAppStateDocument,
  loadOrMigrateAppStateSlice,
  patchAppState,
  patchAppStateSlice,
} from './app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

test('AppStateV2 rejects malformed and unsupported documents', () => {
  assert.deepEqual(decodeAppStateDocument(null), { version: APP_STATE_VERSION });
  assert.deepEqual(decodeAppStateDocument('{'), { version: APP_STATE_VERSION });
  assert.deepEqual(
    decodeAppStateDocument(JSON.stringify({ version: 1, workspace: {} })),
    { version: APP_STATE_VERSION },
  );
});

test('patchAppStateSlice preserves unrelated slices', () => {
  const storage = new MemoryStorage();
  const initial: AppStateV2 = {
    version: APP_STATE_VERSION,
    appearance: { theme: 'system' },
    shell: { sidebarPinned: true, sidebarCollapsed: ['assets'] },
  };
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(initial));

  const workspace = { version: 1 as const, panels: {}, zOrder: [] };
  assert.equal(patchAppStateSlice(storage, 'workspace', workspace), true);

  const saved = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(saved.workspace, workspace);
  assert.deepEqual(saved.appearance, initial.appearance);
  assert.deepEqual(saved.shell, initial.shell);
});

test('スキーマに無い項目が保存に残っていても、読み込みは失敗せず、他の項目の保存でもそのまま保たれる', () => {
  const storage = new MemoryStorage();
  const extra = { theme: 'dark', input: { mode: 'ja' } };
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
    version: APP_STATE_VERSION,
    appearance: { theme: 'light' },
    analyzer: extra,
  }));

  const decoded = decodeAppStateDocument(storage.getItem(APP_STATE_STORAGE_KEY));
  assert.deepEqual(decoded.appearance, { theme: 'light' });

  assert.equal(patchAppStateSlice(storage, 'shell', { sidebarPinned: false }), true);
  const saved = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(saved.shell, { sidebarPinned: false });
  assert.deepEqual(saved.analyzer, extra);
});

test('slice migration writes AppState before removing the legacy key', () => {
  const storage = new MemoryStorage();
  storage.setItem('legacy-workspace', JSON.stringify({ version: 1, panels: {}, zOrder: [] }));

  const workspace = loadOrMigrateAppStateSlice(storage, 'workspace', {
    decode: (value) => value as { version: 1; panels: {}; zOrder: [] },
    loadLegacy: () => ({ version: 1, panels: {}, zOrder: [] }),
    legacyKeys: ['legacy-workspace'],
  });

  assert.equal(workspace.version, 1);
  assert.equal(storage.getItem('legacy-workspace'), null);
  assert.deepEqual(
    JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).workspace,
    workspace,
  );
});


test('patchAppState updates multiple slices atomically while preserving unrelated slices', () => {
  const storage = new MemoryStorage();
  const workspace = { version: 1 as const, panels: {}, zOrder: [] };
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
    version: APP_STATE_VERSION,
    workspace,
  }));

  assert.equal(patchAppState(storage, {
    appearance: { theme: 'dark' },
    shell: { sidebarPinned: true },
  }), true);

  const saved = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(saved.workspace, workspace);
  assert.equal(saved.appearance.theme, 'dark');
  assert.deepEqual(saved.shell, { sidebarPinned: true });
});

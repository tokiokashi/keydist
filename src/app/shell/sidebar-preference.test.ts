import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { APP_STATE_STORAGE_KEY } from '../state/app-state-storage.ts';
import { loadSidebarPinned, saveSidebarPinned } from './sidebar-preference.ts';

function createFakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

test('サイドバーの固定: 何も覚えていなければ固定', () => {
  assert.equal(loadSidebarPinned(createFakeStorage()), true);
});

test('サイドバーの固定: 外したことを覚え、他の項目を消さない', () => {
  const storage = createFakeStorage({
    [APP_STATE_STORAGE_KEY]: JSON.stringify({ version: 2, appearance: { theme: 'dark' } }),
  });
  assert.equal(saveSidebarPinned(storage, false), true);
  assert.equal(loadSidebarPinned(storage), false);
  const stored = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY) ?? '{}');
  assert.deepEqual(stored.appearance, { theme: 'dark' });

  saveSidebarPinned(storage, true);
  assert.equal(loadSidebarPinned(storage), true);
});

test('サイドバーの固定: storageが例外を投げても固定として読む', () => {
  const storage: KeyValueStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => {},
  };
  assert.equal(loadSidebarPinned(storage), true);
  assert.equal(saveSidebarPinned(storage, false), false);
});

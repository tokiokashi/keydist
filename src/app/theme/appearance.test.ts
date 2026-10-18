import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_STATE_VERSION } from '../state/app-state.ts';
import {
  getAppearanceSnapshot,
  getServerAppearanceSnapshot,
  loadAppearancePreference,
  saveAppearancePreference,
  subscribeAppearance,
} from './appearance.ts';
import { APP_STATE_STORAGE_KEY } from '../state/app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function appState(storage: MemoryStorage) {
  return JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
}

test('外観の保存が無い時は、渡した既定を返してstorageには書かない', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadAppearancePreference(storage), { theme: 'system' });
  assert.deepEqual(loadAppearancePreference(storage, 'dark'), { theme: 'dark' });
  assert.equal(storage.data.size, 0);
});

test('外観の保存が不正な値の時は既定を返す', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    APP_STATE_STORAGE_KEY,
    JSON.stringify({
      version: APP_STATE_VERSION,
      appearance: { theme: 'not-a-real-theme' },
    }),
  );
  assert.deepEqual(loadAppearancePreference(storage), { theme: 'system' });
});

test('保存した外観の設定を読み戻す', () => {
  const storage = new MemoryStorage();
  assert.equal(saveAppearancePreference(storage, 'dark'), true);
  assert.deepEqual(loadAppearancePreference(storage), { theme: 'dark' });
});

test('server snapshot never touches storage and always returns the default theme', () => {
  assert.equal(getServerAppearanceSnapshot(), 'system');
});

test('the appearance store is a no-op outside a browser (window undefined)', () => {
  // node --testにDOMは無いため、windowを触る初期化はここでは走らない前提を確認する。
  // window有無で分岐する実装が壊れていれば、この呼び出し自体が例外を投げる。
  assert.equal(getAppearanceSnapshot(), 'system');
  const unsubscribe = subscribeAppearance(() => {});
  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
});

test('appearance writer updates only its AppState slice', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    APP_STATE_STORAGE_KEY,
    JSON.stringify({
      version: APP_STATE_VERSION,
      workspace: { version: 1, panels: {}, zOrder: [] },
    }),
  );

  assert.equal(saveAppearancePreference(storage, 'dark'), true);
  assert.equal(appState(storage).appearance.theme, 'dark');
  assert.deepEqual(appState(storage).workspace, { version: 1, panels: {}, zOrder: [] });
});

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
import type { UiStateStorage } from '#legacy/ui-state.ts';

class MemoryStorage implements UiStateStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function appState(storage: MemoryStorage) {
  return JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
}

test('appearance migrates AppState analyzer.theme and removes the old field after save', () => {
  const storage = new MemoryStorage();
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
    version: APP_STATE_VERSION,
    analyzer: {
      theme: 'dark',
      input: { mode: 'ja' },
    },
  }));

  assert.deepEqual(loadAppearancePreference(storage), { theme: 'dark' });
  assert.equal(appState(storage).appearance.theme, 'dark');
  assert.equal('theme' in appState(storage).analyzer, false);
  assert.equal(appState(storage).analyzer.input.mode, 'ja');
});

test('appearance can migrate UiStateV1 theme without consuming the analyzer migration document', () => {
  const storage = new MemoryStorage();
  storage.setItem('keydist:ui-state', JSON.stringify({
    version: 1,
    ui: { theme: 'light' },
  }));

  assert.deepEqual(loadAppearancePreference(storage), { theme: 'light' });
  assert.equal(appState(storage).appearance.theme, 'light');
  assert.notEqual(storage.getItem('keydist:ui-state'), null);
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
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
    version: APP_STATE_VERSION,
    workspace: { version: 1, panels: {}, zOrder: [] },
  }));

  assert.equal(saveAppearancePreference(storage, 'dark'), true);
  assert.equal(appState(storage).appearance.theme, 'dark');
  assert.deepEqual(appState(storage).workspace, { version: 1, panels: {}, zOrder: [] });
});

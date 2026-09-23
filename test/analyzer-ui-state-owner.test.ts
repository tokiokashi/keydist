import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalyzerUiStateOwner,
} from '../src/analyzer-ui-state-owner.ts';
import { APP_STATE_STORAGE_KEY } from '../src/persistence/app-state-storage.ts';
import {
  createDefaultUiState,
  UI_STATE_STORAGE_KEY,
  type UiStateChoices,
  type UiStateStorage,
} from '../src/ui-state.ts';

class MemoryStorage implements UiStateStorage {
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

const choices: UiStateChoices = {
  layouts: { en: ['qwerty'], ja: ['qwerty'] },
  samples: { en: ['default'], ja: ['legacy'] },
};

function defaults() {
  return createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: { en: ['qwerty'], ja: ['qwerty'] },
  });
}

function appState(storage: MemoryStorage) {
  return JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
}

test('AnalyzerUiStateOwner owns updates and notifies subscribers', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);
  let notifications = 0;
  const unsubscribe = owner.subscribe(() => notifications++);

  owner.update((draft) => {
    draft.ui.input.mode = 'en';
  });

  assert.equal(owner.getSnapshot().ui.input.mode, 'en');
  assert.equal(appState(storage).analyzer.input.mode, 'en');
  assert.equal(notifications, 1);

  unsubscribe();
  owner.update((draft) => {
    draft.ui.input.mode = 'ja';
  });
  assert.equal(notifications, 1);
});

test('AnalyzerUiStateOwner debounces AppState writes and flush commits latest snapshot', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices, 60_000);
  const before = storage.getItem(APP_STATE_STORAGE_KEY);

  owner.update((draft) => {
    draft.ui.input.customText = 'first';
  }, true);
  owner.update((draft) => {
    draft.ui.input.customText = 'latest';
  }, true);

  assert.equal(storage.getItem(APP_STATE_STORAGE_KEY), before);
  owner.flush();

  assert.equal(appState(storage).analyzer.input.customText, 'latest');
});

test('AnalyzerUiStateOwner migrates UiStateV1 into AppState and removes legacy writer key', () => {
  const storage = new MemoryStorage();
  const legacy = defaults();
  legacy.ui.input.customText = 'legacy analyzer text';
  legacy.conditions.defaults.windowSize = 7;
  storage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(legacy));

  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);

  assert.equal(owner.getSnapshot().ui.input.customText, 'legacy analyzer text');
  assert.equal(storage.getItem(UI_STATE_STORAGE_KEY), null);
  assert.equal(appState(storage).analyzer.input.customText, 'legacy analyzer text');
  assert.equal(appState(storage).conditions.defaults.windowSize, 7);
  assert.ok(appState(storage).playback);
});

test('Analyzer AppState patches preserve unrelated Workspace state', () => {
  const storage = new MemoryStorage();
  const workspace = { version: 1, panels: {}, zOrder: [] };
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
    version: 2,
    workspace,
  }));

  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);
  owner.update((draft) => {
    draft.ui.input.mode = 'en';
  });

  assert.deepEqual(appState(storage).workspace, workspace);
  assert.equal(appState(storage).analyzer.input.mode, 'en');
});

test('AnalyzerUiStateOwner exposes legacy migration metadata', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);

  assert.equal(owner.loadResult.migratedLegacy, false);
  assert.equal(owner.loadResult.migratedArpeggioModel, false);
});

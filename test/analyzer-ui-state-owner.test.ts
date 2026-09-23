import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalyzerUiStateOwner,
} from '../src/analyzer-ui-state-owner.ts';
import {
  createDefaultUiState,
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

test('AnalyzerUiStateOwner owns updates and notifies subscribers', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);
  let notifications = 0;
  const unsubscribe = owner.subscribe(() => notifications++);

  owner.update((draft) => {
    draft.ui.input.mode = 'en';
  });

  assert.equal(owner.getSnapshot().ui.input.mode, 'en');
  assert.equal(notifications, 1);

  unsubscribe();
  owner.update((draft) => {
    draft.ui.input.mode = 'ja';
  });
  assert.equal(notifications, 1);
});

test('AnalyzerUiStateOwner debounces writes and flush commits the latest snapshot', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices, 60_000);

  owner.update((draft) => {
    draft.ui.input.customText = 'first';
  }, true);
  owner.update((draft) => {
    draft.ui.input.customText = 'latest';
  }, true);

  assert.equal(storage.data.size, 0);
  owner.flush();

  const saved = [...storage.data.values()].map((value) => JSON.parse(value));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].ui.input.customText, 'latest');
});

test('AnalyzerUiStateOwner exposes legacy migration metadata', () => {
  const storage = new MemoryStorage();
  const owner = createAnalyzerUiStateOwner(storage, defaults(), choices);

  assert.equal(owner.loadResult.migratedLegacy, false);
  assert.equal(owner.loadResult.migratedArpeggioModel, false);
});

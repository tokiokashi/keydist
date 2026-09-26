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
    analyzer: {
      input: { mode: 'ja', geometry: 'row-staggered', selectedSampleByMode: { en: 'default', ja: 'legacy' } },
      layouts: { selectedByMode: { en: [], ja: [] }, detailByMode: {} },
      comparison: {
        baselineByMode: {},
        chartColumn: 1,
        sort: null,
        matrixSorts: { press: null, finger: null, adjacentMean: null, adjacentStdDev: null },
      },
      sensitivity: { scale: 'relative' },
      layers: { view: 'auto', activeTab: 0, colorScale: 'linear', showLayerDetails: false, keyPatternGuide: true },
      panels: {
        addLayout: false, text: true, sensitivity: false, playback: false,
        playbackRateChart: false, layerStats: false, modifierList: false, comboTable: false,
      },
    },
  };
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(initial));

  const workspace = { version: 1 as const, panels: {}, zOrder: [] };
  assert.equal(patchAppStateSlice(storage, 'workspace', workspace), true);

  const saved = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(saved.workspace, workspace);
  assert.deepEqual(saved.analyzer, initial.analyzer);
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
    analyzer: {
      input: { mode: 'en', geometry: 'row-staggered', selectedSampleByMode: { en: 'default', ja: 'legacy' } },
      layouts: { selectedByMode: { en: [], ja: [] }, detailByMode: {} },
      comparison: {
        baselineByMode: {},
        chartColumn: 1,
        sort: null,
        matrixSorts: { press: null, finger: null, adjacentMean: null, adjacentStdDev: null },
      },
      sensitivity: { scale: 'relative' },
      layers: { view: 'auto', activeTab: 0, colorScale: 'linear', showLayerDetails: false, keyPatternGuide: true },
      panels: {
        addLayout: false, text: true, sensitivity: false, playback: false,
        playbackRateChart: false, layerStats: false, modifierList: false, comboTable: false,
      },
    },
    conditions: undefined,
  }), true);

  const saved = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(saved.workspace, workspace);
  assert.equal(saved.appearance.theme, 'dark');
  assert.equal('theme' in saved.analyzer, false);
});

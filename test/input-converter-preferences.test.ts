import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '../src/persistence/storage.ts';
import {
  createDefaultInputConverterPreferences,
  createInputConverterPreferencesScheduler,
  decodeInputConverterPreferences,
  INPUT_CONVERTER_PREFERENCES_STORAGE_KEY,
  INPUT_CONVERTER_PREFERENCES_VERSION,
  loadInputConverterPreferences,
  saveInputConverterPreferences,
  serializeInputConverterPreferences,
  type InputConverterPreferencesV1,
} from '../src/features/input-converter/input-converter-preferences.ts';

const catalogs = {
  layoutIds: ['naginata-v18', 'shingeta', 'jis-kana'],
  geometryIds: ['row-staggered', 'column-staggered', 'user-custom-1'],
};

const defaults = {
  layoutId: 'naginata-v18',
  geometryId: 'row-staggered',
  showDynamicGuide: true,
  showLayerGuide: true,
  showLayerKeys: true,
  showShiftKeys: false,
};

function memoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

test('decode: empty storage falls back to defaults', () => {
  const result = decodeInputConverterPreferences(null, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: corrupt JSON falls back to defaults without throwing', () => {
  const result = decodeInputConverterPreferences('{not json', catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: unknown version falls back to defaults without throwing', () => {
  const raw = JSON.stringify({ version: 999, layoutId: 'shingeta', geometryId: 'row-staggered' });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: structurally invalid payload (array) falls back to defaults', () => {
  const raw = JSON.stringify([1, 2, 3]);
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: a valid payload round-trips as-is', () => {
  const saved: InputConverterPreferencesV1 = {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId: 'shingeta',
    geometryId: 'column-staggered',
    showDynamicGuide: false,
    showLayerGuide: false,
    showLayerKeys: false,
    showShiftKeys: true,
  };
  const result = decodeInputConverterPreferences(
    serializeInputConverterPreferences(saved),
    catalogs,
    defaults,
  );
  assert.deepEqual(result, saved);
});

test('decode: a custom (user-defined) geometryId in the catalog is accepted', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'naginata-v18',
    geometryId: 'user-custom-1',
    showDynamicGuide: true,
    showLayerGuide: true,
    showLayerKeys: true,
    showShiftKeys: false,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.geometryId, 'user-custom-1');
});

test('decode: layoutId not in the current catalog falls back to default', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'no-such-layout',
    geometryId: 'row-staggered',
    showDynamicGuide: true,
    showLayerGuide: true,
    showLayerKeys: true,
    showShiftKeys: false,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.layoutId, defaults.layoutId);
});

test('decode: geometryId not in the current catalog falls back to default', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'naginata-v18',
    geometryId: 'removed-user-shape',
    showDynamicGuide: true,
    showLayerGuide: true,
    showLayerKeys: true,
    showShiftKeys: false,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.geometryId, defaults.geometryId);
});

test('decode: wrong-typed boolean fields fall back to default per field, other fields survive', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'shingeta',
    geometryId: 'row-staggered',
    showDynamicGuide: 'yes',
    showLayerGuide: 1,
    showLayerKeys: null,
    showShiftKeys: true,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.layoutId, 'shingeta');
  assert.equal(result.showDynamicGuide, defaults.showDynamicGuide);
  assert.equal(result.showLayerGuide, defaults.showLayerGuide);
  assert.equal(result.showLayerKeys, defaults.showLayerKeys);
  assert.equal(result.showShiftKeys, true);
});

test('decode: wrong-typed layoutId/geometryId fall back to default per field', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 42,
    geometryId: { nested: true },
    showDynamicGuide: true,
    showLayerGuide: true,
    showLayerKeys: true,
    showShiftKeys: false,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.layoutId, defaults.layoutId);
  assert.equal(result.geometryId, defaults.geometryId);
});

test('decode: unknown fields on the payload are dropped', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'shingeta',
    geometryId: 'row-staggered',
    showDynamicGuide: true,
    showLayerGuide: true,
    showLayerKeys: true,
    showShiftKeys: false,
    evil: 'inject',
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(Object.keys(result).sort(), [
    'geometryId',
    'layoutId',
    'showDynamicGuide',
    'showLayerGuide',
    'showLayerKeys',
    'showShiftKeys',
    'version',
  ]);
});

test('loadInputConverterPreferences falls back to defaults when storage.getItem throws', () => {
  const throwingStorage: KeyValueStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  const result = loadInputConverterPreferences(throwingStorage, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('saveInputConverterPreferences writes under the documented storage key and round-trips via load', () => {
  const storage = memoryStorage();
  const prefs: InputConverterPreferencesV1 = {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId: 'shingeta',
    geometryId: 'column-staggered',
    showDynamicGuide: false,
    showLayerGuide: true,
    showLayerKeys: false,
    showShiftKeys: true,
  };
  saveInputConverterPreferences(storage, prefs);
  assert.equal(
    storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY),
    serializeInputConverterPreferences(prefs),
  );
  assert.deepEqual(loadInputConverterPreferences(storage, catalogs, defaults), prefs);
});

test('saveInputConverterPreferences swallows a storage.setItem failure', () => {
  const storage: KeyValueStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() =>
    saveInputConverterPreferences(storage, createDefaultInputConverterPreferences(defaults)));
});

test('contract: serialized preferences contain only the allowed keys (no transient state)', () => {
  const prefs = createDefaultInputConverterPreferences(defaults);
  const parsed: unknown = JSON.parse(serializeInputConverterPreferences(prefs));
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
  const allowedKeys = [
    'version',
    'layoutId',
    'geometryId',
    'showDynamicGuide',
    'showLayerGuide',
    'showLayerKeys',
    'showShiftKeys',
  ];
  const disallowedKeys = [
    // 打鍵セッションの一時状態（use-typing-session.tsが持つもの）
    'text',
    'pressedKeys',
    'recognitionKeys',
    'presentation',
    'lastRecognized',
    'active',
    'composing',
    'readyLayoutId',
    // ランダム練習・逆引きの一時状態
    'randomPracticeMode',
    'lookupQuery',
    'lookupStepIndex',
    // IME・打鍵候補・ガイド進捗
    'imeComposition',
    'candidates',
    'guideProgress',
    'guideStepIndex',
  ];
  const actualKeys = Object.keys(parsed as Record<string, unknown>);
  assert.deepEqual(actualKeys.sort(), [...allowedKeys].sort());
  for (const key of disallowedKeys) {
    assert.equal(actualKeys.includes(key), false, `${key} must not be persisted`);
  }
});

test('write coalescing: rapid notify() calls debounce into a single write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createInputConverterPreferencesScheduler({ storage, debounceMs: 300 });

  let prefs = createDefaultInputConverterPreferences(defaults);
  scheduler.notify(prefs);
  t.mock.timers.tick(100);
  prefs = { ...prefs, showDynamicGuide: false };
  scheduler.notify(prefs);
  t.mock.timers.tick(100);
  prefs = { ...prefs, showLayerKeys: false };
  scheduler.notify(prefs);
  assert.equal(writes, 0);

  t.mock.timers.tick(300);
  assert.equal(writes, 1);
  assert.equal(
    storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY),
    serializeInputConverterPreferences(prefs),
  );
});

test('write coalescing: identical serialized value is not written twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createInputConverterPreferencesScheduler({ storage, debounceMs: 50 });
  const prefs = createDefaultInputConverterPreferences(defaults);

  scheduler.notify(prefs);
  t.mock.timers.tick(50);
  assert.equal(writes, 1);

  scheduler.notify({ ...prefs });
  t.mock.timers.tick(50);
  assert.equal(writes, 1);
});

test('write coalescing: flush() writes immediately and cancels the pending timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createInputConverterPreferencesScheduler({ storage, debounceMs: 1000 });
  const prefs = createDefaultInputConverterPreferences(defaults);

  scheduler.notify(prefs);
  scheduler.flush();
  assert.equal(writes, 1);

  t.mock.timers.tick(1000);
  assert.equal(writes, 1);
});

test('write coalescing: cancel() drops the pending write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createInputConverterPreferencesScheduler({ storage, debounceMs: 200 });
  scheduler.notify(createDefaultInputConverterPreferences(defaults));
  scheduler.cancel();
  t.mock.timers.tick(200);
  assert.equal(writes, 0);
});

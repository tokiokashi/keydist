import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_STATE_STORAGE_KEY } from '#app/state/app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import {
  createDefaultInputConverterPreferences,
  createInputConverterPreferencesScheduler,
  decodeInputConverterPreferences,
  inputConverterLayoutPreferences,
  INPUT_CONVERTER_PREFERENCES_STORAGE_KEY,
  INPUT_CONVERTER_PREFERENCES_VERSION,
  loadInputConverterPreferences,
  saveInputConverterPreferences,
  serializeInputConverterPreferences,
  type InputConverterLayoutPreferencesV2,
  type InputConverterPreferencesV2,
} from '#tester/input-converter-preferences.ts';

const catalogs = {
  layoutIds: ['naginata-v18', 'shingeta', 'jis-kana'],
  geometryIds: ['row-staggered', 'column-staggered', 'user-custom-1'],
};

const defaultLayout: InputConverterLayoutPreferencesV2 = {
  showDynamicGuide: true,
  showLayerGuide: true,
  showLayerKeys: true,
  showShiftKeys: false,
  showPracticeAssist: true,
  inputText: '',
  practiceText: '',
  randomPracticeMode: null,
};

const defaults = {
  layoutId: 'naginata-v18',
  geometryId: 'row-staggered',
  layout: defaultLayout,
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

function samplePreferences(): InputConverterPreferencesV2 {
  return {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId: 'shingeta',
    geometryId: 'column-staggered',
    layouts: {
      'naginata-v18': {
        showDynamicGuide: true,
        showLayerGuide: true,
        showLayerKeys: false,
        showShiftKeys: false,
        showPracticeAssist: true,
        inputText: 'かな',
        practiceText: 'ことば',
        randomPracticeMode: null,
      },
      shingeta: {
        showDynamicGuide: false,
        showLayerGuide: false,
        showLayerKeys: true,
        showShiftKeys: true,
        showPracticeAssist: false,
        inputText: 'しんげた',
        practiceText: '文章です',
        randomPracticeMode: 'phrase',
      },
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
  const raw = JSON.stringify({ version: 999, layoutId: 'shingeta' });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: structurally invalid payload (array) falls back to defaults', () => {
  const raw = JSON.stringify([1, 2, 3]);
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(result, createDefaultInputConverterPreferences(defaults));
});

test('decode: a valid V2 payload round-trips as-is', () => {
  const saved = samplePreferences();
  const result = decodeInputConverterPreferences(
    serializeInputConverterPreferences(saved),
    catalogs,
    defaults,
  );
  assert.deepEqual(result, saved);
});

test('decode: V1 migrates its global display state into the selected layout while geometry stays global', () => {
  const raw = JSON.stringify({
    version: 1,
    layoutId: 'shingeta',
    geometryId: 'column-staggered',
    showDynamicGuide: false,
    showLayerGuide: false,
    showLayerKeys: false,
    showShiftKeys: true,
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);

  assert.equal(result.version, 2);
  assert.equal(result.layoutId, 'shingeta');
  assert.equal(result.geometryId, 'column-staggered');
  assert.deepEqual(result.layouts.shingeta, {
    ...defaultLayout,
    showDynamicGuide: false,
    showLayerGuide: false,
    showLayerKeys: false,
    showShiftKeys: true,
  });
});

test('decode: older V2 without showPracticeAssist keeps assist enabled by default', () => {
  const raw = JSON.stringify({
    version: 2,
    layoutId: 'shingeta',
    geometryId: 'row-staggered',
    layouts: {
      shingeta: {
        showDynamicGuide: true,
        showLayerGuide: true,
        showLayerKeys: true,
        showShiftKeys: false,
        inputText: '',
        practiceText: 'かな',
        randomPracticeMode: null,
      },
    },
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.layouts.shingeta.showPracticeAssist, true);
});

test('decode: a custom global geometryId in the catalog is accepted', () => {
  const raw = JSON.stringify({
    ...samplePreferences(),
    geometryId: 'user-custom-1',
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.geometryId, 'user-custom-1');
});

test('decode: invalid global layoutId and geometryId fall back independently', () => {
  const raw = JSON.stringify({
    ...samplePreferences(),
    layoutId: 'no-such-layout',
    geometryId: 'removed-user-shape',
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal(result.layoutId, defaults.layoutId);
  assert.equal(result.geometryId, defaults.geometryId);
});

test('decode: malformed per-layout fields fall back per field and other fields survive', () => {
  const raw = JSON.stringify({
    version: 2,
    layoutId: 'shingeta',
    geometryId: 'row-staggered',
    layouts: {
      shingeta: {
        showDynamicGuide: 'yes',
        showLayerGuide: false,
        showLayerKeys: 1,
        showShiftKeys: true,
        showPracticeAssist: 'yes',
        inputText: 42,
        practiceText: '残す',
        randomPracticeMode: 'invalid',
      },
    },
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.deepEqual(result.layouts.shingeta, {
    showDynamicGuide: defaultLayout.showDynamicGuide,
    showLayerGuide: false,
    showLayerKeys: defaultLayout.showLayerKeys,
    showShiftKeys: true,
    showPracticeAssist: defaultLayout.showPracticeAssist,
    inputText: defaultLayout.inputText,
    practiceText: '残す',
    randomPracticeMode: defaultLayout.randomPracticeMode,
  });
});

test('decode: unknown layout ids are dropped from the per-layout map', () => {
  const raw = JSON.stringify({
    ...samplePreferences(),
    layouts: {
      ...samplePreferences().layouts,
      removed: {
        ...defaultLayout,
        inputText: 'drop me',
      },
    },
  });
  const result = decodeInputConverterPreferences(raw, catalogs, defaults);
  assert.equal('removed' in result.layouts, false);
});

test('layout preferences: missing layout uses defaults without mutating the stored map', () => {
  const prefs = samplePreferences();
  const before = structuredClone(prefs);
  const result = inputConverterLayoutPreferences(prefs, 'jis-kana', defaultLayout);
  assert.deepEqual(result, defaultLayout);
  assert.deepEqual(prefs, before);
});

test('per-layout practice environments stay independent while geometry is a single global field', () => {
  const prefs = samplePreferences();
  assert.equal(prefs.geometryId, 'column-staggered');
  assert.equal('geometryId' in prefs.layouts['naginata-v18'], false);
  assert.equal('geometryId' in prefs.layouts.shingeta, false);
  assert.equal(prefs.layouts['naginata-v18'].inputText, 'かな');
  assert.equal(prefs.layouts.shingeta.inputText, 'しんげた');
  assert.equal(prefs.layouts['naginata-v18'].showLayerKeys, false);
  assert.equal(prefs.layouts.shingeta.showLayerKeys, true);
  assert.equal(prefs.layouts['naginata-v18'].showPracticeAssist, true);
  assert.equal(prefs.layouts.shingeta.showPracticeAssist, false);
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

test('saveInputConverterPreferences writes the Tester slice under AppState and round-trips', () => {
  const storage = memoryStorage();
  const prefs = samplePreferences();
  saveInputConverterPreferences(storage, prefs);
  assert.deepEqual(
    JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).inputConverter,
    prefs,
  );
  assert.equal(storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY), null);
  assert.deepEqual(loadInputConverterPreferences(storage, catalogs, defaults), prefs);
});

test('loadInputConverterPreferences migrates and removes the legacy preference key', () => {
  const storage = memoryStorage();
  const prefs = samplePreferences();
  storage.setItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY, serializeInputConverterPreferences(prefs));
  assert.deepEqual(loadInputConverterPreferences(storage, catalogs, defaults), prefs);
  assert.equal(storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY), null);
  assert.deepEqual(JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).inputConverter, prefs);
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

test('contract: only durable practice state is serialized; interaction transients remain excluded', () => {
  const parsed = JSON.parse(
    serializeInputConverterPreferences(samplePreferences()),
  ) as Record<string, unknown>;

  assert.deepEqual(Object.keys(parsed).sort(), [
    'geometryId',
    'layoutId',
    'layouts',
    'version',
  ]);

  const layouts = parsed.layouts as Record<string, Record<string, unknown>>;
  const allowedLayoutKeys = [
    'showDynamicGuide',
    'showLayerGuide',
    'showLayerKeys',
    'showShiftKeys',
    'showPracticeAssist',
    'inputText',
    'practiceText',
    'randomPracticeMode',
  ];
  for (const layoutState of Object.values(layouts)) {
    assert.deepEqual(Object.keys(layoutState).sort(), [...allowedLayoutKeys].sort());
  }

  const serialized = JSON.stringify(parsed);
  for (const key of [
    'pressedKeys',
    'recognitionKeys',
    'presentation',
    'lastRecognized',
    'active',
    'composing',
    'readyLayoutId',
    'lookupStepIndex',
    'imeComposition',
    'candidates',
    'guideProgress',
    'guideStepIndex',
  ]) {
    assert.equal(serialized.includes(`"${key}"`), false, `${key} must not be persisted`);
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

  let prefs = samplePreferences();
  scheduler.notify(prefs);
  t.mock.timers.tick(100);
  prefs = {
    ...prefs,
    layouts: {
      ...prefs.layouts,
      shingeta: { ...prefs.layouts.shingeta, inputText: 'a' },
    },
  };
  scheduler.notify(prefs);
  t.mock.timers.tick(100);
  prefs = {
    ...prefs,
    layouts: {
      ...prefs.layouts,
      shingeta: { ...prefs.layouts.shingeta, practiceText: 'b' },
    },
  };
  scheduler.notify(prefs);
  assert.equal(writes, 0);

  t.mock.timers.tick(300);
  assert.equal(writes, 1);
  assert.deepEqual(
    JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).inputConverter,
    prefs,
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
  const prefs = samplePreferences();

  scheduler.notify(prefs);
  t.mock.timers.tick(50);
  assert.equal(writes, 1);

  scheduler.notify(structuredClone(prefs));
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
  const prefs = samplePreferences();

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
  scheduler.notify(samplePreferences());
  scheduler.cancel();
  t.mock.timers.tick(200);
  assert.equal(writes, 0);
});

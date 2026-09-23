import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTesterSelection,
  sanitizeTesterSelection,
  saveTesterSelection,
} from '../src/features/input-converter/tester-selection-persistence.ts';

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('tester selection persistence round-trips layout and physical geometry', () => {
  const storage = fakeStorage();
  saveTesterSelection({
    layoutId: 'tsuki-2-263',
    geometryId: 'column-staggered',
  }, storage);

  assert.deepEqual(loadTesterSelection(storage), {
    layoutId: 'tsuki-2-263',
    geometryId: 'column-staggered',
  });
});

test('tester selection sanitizer keeps valid ids independently', () => {
  assert.deepEqual(sanitizeTesterSelection({
    layoutId: '  shingeta  ',
    geometryId: 123,
  }), {
    layoutId: 'shingeta',
    geometryId: undefined,
  });
  assert.deepEqual(sanitizeTesterSelection(null), {});
});

test('tester selection loader falls back on malformed storage', () => {
  const storage = {
    getItem() {
      return '{broken';
    },
  };
  assert.deepEqual(loadTesterSelection(storage), {});
});

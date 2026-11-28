import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THUMB_KEY_BINDINGS,
  assignBrowserKeyCode,
  loadBrowserKeyBindingOverrides,
  saveBrowserKeyBindingOverrides,
  sanitizeBrowserKeyBindingOverrides,
  sanitizeThumbKeyBindings,
  thumbKeyBindingsToOverrides,
  unassignBrowserKeyCode,
} from './browser-keyboard-bindings.ts';

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

test('thumb binding既定値はNonConvert / Space+Convertにする', () => {
  const overrides = thumbKeyBindingsToOverrides(DEFAULT_THUMB_KEY_BINDINGS);
  assert.equal(overrides.NonConvert, 'thumb-l');
  assert.equal(overrides.Space, 'thumb-r');
  assert.equal(overrides.Convert, 'thumb-r');
});

test('thumb binding sanitizeは重複codeを両側へ残さない', () => {
  const sanitized = sanitizeThumbKeyBindings({
    leftCodes: ['Space', 'Space'],
    rightCodes: ['Space', 'Convert'],
  });
  assert.deepEqual(sanitized, {
    leftCodes: ['Space'],
    rightCodes: ['Convert'],
  });
});

test('general browser bindingは任意physical keyへcodeを移動し解除できる', () => {
  const assigned = assignBrowserKeyCode({}, 'f', 'KeyQ');
  assert.equal(assigned.KeyQ, 'f');

  const moved = assignBrowserKeyCode(assigned, 'thumb-l', 'Space');
  assert.equal(moved.Space, 'thumb-l');

  const removed = unassignBrowserKeyCode(moved, 'Space');
  assert.equal(removed.Space, null);
});

test('general browser bindingはstorageへround-tripしlegacy thumb設定も移行する', () => {
  const storage = fakeStorage();
  const custom = sanitizeBrowserKeyBindingOverrides({
    KeyQ: 'f',
    Space: 'thumb-l',
    Invalid: 123,
  });
  saveBrowserKeyBindingOverrides(custom, storage);
  assert.deepEqual(loadBrowserKeyBindingOverrides(storage), {
    KeyQ: 'f',
    Space: 'thumb-l',
  });

  const legacy = fakeStorage();
  legacy.setItem('keydist:input-thumb-key-bindings', JSON.stringify({ leftCodes: ['Space'], rightCodes: ['Convert'] }));
  assert.deepEqual(loadBrowserKeyBindingOverrides(legacy), {
    NonConvert: null,
    Space: 'thumb-l',
    Convert: 'thumb-r',
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THUMB_KEY_BINDINGS,
  assignThumbKeyCode,
  loadThumbKeyBindings,
  removeThumbKeyCode,
  saveThumbKeyBindings,
  sanitizeThumbKeyBindings,
  thumbKeyBindingsToOverrides,
} from '../src/features/input-converter/browser-keyboard-bindings.ts';

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

test('thumb binding既定値は従来のNonConvert / Space+Convertを保持する', () => {
  const overrides = thumbKeyBindingsToOverrides(DEFAULT_THUMB_KEY_BINDINGS);
  assert.equal(overrides.NonConvert, 'thumb-l');
  assert.equal(overrides.Space, 'thumb-r');
  assert.equal(overrides.Convert, 'thumb-r');
});

test('thumb bindingは任意codeを片側へ移動し既定mappingも無効化できる', () => {
  const moved = assignThumbKeyCode(DEFAULT_THUMB_KEY_BINDINGS, 'left', 'Space');
  assert.deepEqual(moved.leftCodes, ['NonConvert', 'Space']);
  assert.deepEqual(moved.rightCodes, ['Convert']);

  const overrides = thumbKeyBindingsToOverrides(moved);
  assert.equal(overrides.Space, 'thumb-l');
  assert.equal(overrides.Convert, 'thumb-r');

  const custom = assignThumbKeyCode(moved, 'right', 'KeyQ');
  assert.equal(thumbKeyBindingsToOverrides(custom).KeyQ, 'thumb-r');

  const removed = removeThumbKeyCode(custom, 'left', 'NonConvert');
  assert.equal(thumbKeyBindingsToOverrides(removed).NonConvert, null);
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

test('thumb bindingはstorageへround-tripする', () => {
  const storage = fakeStorage();
  const settings = {
    leftCodes: ['Space', 'KeyQ'],
    rightCodes: ['Convert'],
  };

  saveThumbKeyBindings(settings, storage);
  assert.deepEqual(loadThumbKeyBindings(storage), settings);
});

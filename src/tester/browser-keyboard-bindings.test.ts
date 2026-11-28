import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignBrowserKeyCode,
  loadBrowserKeyBindingOverrides,
  saveBrowserKeyBindingOverrides,
  sanitizeBrowserKeyBindingOverrides,
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

test('general browser bindingは任意physical keyへcodeを移動し解除できる', () => {
  const assigned = assignBrowserKeyCode({}, 'f', 'KeyQ');
  assert.equal(assigned.KeyQ, 'f');

  const moved = assignBrowserKeyCode(assigned, 'thumb-l', 'Space');
  assert.equal(moved.Space, 'thumb-l');

  const removed = unassignBrowserKeyCode(moved, 'Space');
  assert.equal(removed.Space, null);
});

test('general browser bindingはstorageへround-tripする', () => {
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
});

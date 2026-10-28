import assert from 'node:assert/strict';
import test from 'node:test';
import { browserCodeToPhysicalKey, browserKeyBindingsForShape, JIS_BROWSER_BINDINGS } from './browser-key-codes.ts';

test('標準の対応は、文字キー・数字キーと左端の列のキーを引く', () => {
  assert.equal(browserCodeToPhysicalKey('KeyA'), 'a');
  assert.equal(browserCodeToPhysicalKey('Digit3'), '3');
  assert.equal(browserCodeToPhysicalKey('CapsLock'), 'caps-lock');
  assert.equal(browserCodeToPhysicalKey('Tab'), 'tab');
  assert.equal(browserCodeToPhysicalKey('Backquote'), 'backquote');
  assert.equal(browserCodeToPhysicalKey('Unknown'), undefined);
});

test('利用者の対応は標準の対応より優先され、nullは割り当てなしにする', () => {
  assert.equal(browserCodeToPhysicalKey('CapsLock', { CapsLock: 'a' }), 'a');
  assert.equal(browserCodeToPhysicalKey('CapsLock', { CapsLock: null }), undefined);
});

test('JISの物理配列では、JISの対応の上に利用者の対応を重ねる。JIS以外ではJISの対応を使わない', () => {
  assert.deepEqual(browserKeyBindingsForShape('jis-row-staggered', {}), JIS_BROWSER_BINDINGS);
  assert.equal(browserCodeToPhysicalKey('IntlRo', browserKeyBindingsForShape('jis-row-staggered', {})), 'r3c10');
  assert.equal(browserCodeToPhysicalKey('IntlRo', browserKeyBindingsForShape('jis-row-staggered', { IntlRo: 'caps-lock' })), 'caps-lock');
  assert.deepEqual(browserKeyBindingsForShape('row-staggered', { Backslash: 'caps-lock' }), { Backslash: 'caps-lock' });
  assert.deepEqual(browserKeyBindingsForShape('my-own-shape', {}), {});
});

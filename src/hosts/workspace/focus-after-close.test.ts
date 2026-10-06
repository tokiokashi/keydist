import assert from 'node:assert/strict';
import test from 'node:test';
import { pickAfterClose } from './focus-after-close.ts';

const order = ['a', 'b', 'c', 'd'];

test('pickAfterClose: 読み順で閉じたペインの次の、残るペイン', () => {
  assert.equal(pickAfterClose(order, 'a', ['b', 'c', 'd']), 'b');
  assert.equal(pickAfterClose(order, 'b', ['a', 'c', 'd']), 'c');
});

test('pickAfterClose: 次が無ければ前の、残るペイン', () => {
  assert.equal(pickAfterClose(order, 'd', ['a', 'b', 'c']), 'c');
});

test('pickAfterClose: 同時に消えるペインは候補にしない', () => {
  assert.equal(pickAfterClose(order, 'b', ['a', 'd']), 'd');
  assert.equal(pickAfterClose(order, 'c', ['a']), 'a');
});

test('pickAfterClose: 残るペインが無い・並びに無いペインは undefined', () => {
  assert.equal(pickAfterClose(['a'], 'a', []), undefined);
  assert.equal(pickAfterClose(order, 'x', ['a']), undefined);
});

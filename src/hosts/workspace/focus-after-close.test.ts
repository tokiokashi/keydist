import assert from 'node:assert/strict';
import test from 'node:test';
import { pickGroupAfterClose, type TabSlot } from './focus-after-close.ts';

const slot = (paneId: string, groupId: string): TabSlot => ({ paneId, groupId });
const order = [slot('a', 'g1'), slot('b', 'g1'), slot('c', 'g2'), slot('d', 'g3')];

test('pickGroupAfterClose: 同じ組に残るタブがあれば、その組', () => {
  assert.equal(pickGroupAfterClose(order, 'a', ['b', 'c', 'd']), 'g1');
  assert.equal(pickGroupAfterClose(order, 'b', ['a', 'c', 'd']), 'g1');
});

test('pickGroupAfterClose: 組ごと消えたら、読み順で次のタブの組。次が無ければ前', () => {
  assert.equal(pickGroupAfterClose(order, 'c', ['a', 'b', 'd']), 'g3');
  assert.equal(pickGroupAfterClose(order, 'd', ['a', 'b', 'c']), 'g2');
});

test('pickGroupAfterClose: 同時に消えるペインは候補にしない', () => {
  assert.equal(pickGroupAfterClose(order, 'c', ['a', 'b']), 'g1');
});

test('pickGroupAfterClose: 残るタブが無い・並びに無いペインは undefined', () => {
  assert.equal(pickGroupAfterClose([slot('a', 'g1')], 'a', []), undefined);
  assert.equal(pickGroupAfterClose(order, 'x', ['a']), undefined);
});

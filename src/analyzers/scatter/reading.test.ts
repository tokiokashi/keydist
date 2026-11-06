import assert from 'node:assert/strict';
import test from 'node:test';
import { readingTargets, stillPinned, togglePinned } from './reading.ts';

test('留める: 他の点を押すと移り、同じ点をもう一度押すとやめる', () => {
  assert.equal(togglePinned(undefined, 'a'), 'a');
  assert.equal(togglePinned('a', 'b'), 'b');
  assert.equal(togglePinned('a', 'a'), undefined);
});

test('留める: どの図にも描かれなくなった対象は留めるのをやめる', () => {
  assert.equal(stillPinned('a', new Set(['a', 'b'])), 'a');
  assert.equal(stillPinned('a', new Set(['b'])), undefined);
  assert.equal(stillPinned(undefined, new Set(['b'])), undefined);
});

test('読み取り: 留めた点自身に重ねている間は2点目を出さない', () => {
  assert.deepEqual(readingTargets('a', 'a'), { pinned: 'a', hovered: undefined });
  assert.deepEqual(readingTargets('a', 'b'), { pinned: 'a', hovered: 'b' });
  assert.deepEqual(readingTargets('a', undefined), { pinned: 'a', hovered: undefined });
  assert.deepEqual(readingTargets(undefined, 'b'), { pinned: undefined, hovered: 'b' });
});

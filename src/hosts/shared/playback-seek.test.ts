import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackSeekStore, playbackSeekDeliveryFor } from './playback-seek.ts';

test('操作は番号が進み、宛先の対象のペインにだけ文字位置が届く', () => {
  const store = createPlaybackSeekStore();
  assert.deepEqual(playbackSeekDeliveryFor(store.command(), 'layout:a'), { revision: 0, charPosition: undefined });
  store.seek('layout:a', 42);
  assert.equal(store.command().revision, 1);
  assert.deepEqual(playbackSeekDeliveryFor(store.command(), 'layout:a'), { revision: 1, charPosition: 42 });
  assert.deepEqual(playbackSeekDeliveryFor(store.command(), 'layout:b'), { revision: 1, charPosition: undefined });
});

test('操作が起きると購読者に知らせる', () => {
  const store = createPlaybackSeekStore();
  let notified = 0;
  const unsubscribe = store.subscribe(() => notified++);
  store.seek('layout:a', 1);
  store.seek('layout:a', 1);
  assert.equal(notified, 2);
  unsubscribe();
  store.seek('layout:a', 1);
  assert.equal(notified, 2);
});

test('受け手は対象ごとに数え、同じ対象のペインが全部外れるまで受け手のまま', () => {
  const store = createPlaybackSeekStore();
  const empty = store.receivers();
  assert.equal(empty.size, 0);
  const removeFirst = store.register('layout:a');
  const removeSecond = store.register('layout:a');
  const removeOther = store.register('layout:b');
  assert.deepEqual([...store.receivers()].sort(), ['layout:a', 'layout:b']);
  removeFirst();
  removeFirst();
  assert.ok(store.receivers().has('layout:a'));
  removeSecond();
  assert.ok(!store.receivers().has('layout:a'));
  removeOther();
  assert.equal(store.receivers().size, 0);
});

test('受け手の増減がない間は同じ参照を返す（購読側が描き直さない）', () => {
  const store = createPlaybackSeekStore();
  const remove = store.register('layout:a');
  const before = store.receivers();
  const removeAgain = store.register('layout:a');
  assert.equal(store.receivers(), before);
  removeAgain();
  assert.equal(store.receivers(), before);
  remove();
  assert.notEqual(store.receivers(), before);
});

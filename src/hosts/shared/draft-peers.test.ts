import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftPeers } from './options-write-log.ts';

test('入力は、同じ持ち主の購読のうち自分以外へ伝わる。別の持ち主・購読をやめたものへは伝わらない', () => {
  const peers = createDraftPeers();
  const received: string[] = [];
  const a = (value: unknown) => received.push(`a:${String(value)}`);
  const b = (value: unknown) => received.push(`b:${String(value)}`);
  const other = (value: unknown) => received.push(`other:${String(value)}`);
  const stopB = peers.subscribe('set:x', b);
  peers.subscribe('set:x', a);
  peers.subscribe('set:y', other);

  peers.publish('set:x', 1, a);
  assert.deepEqual(received, ['b:1']);

  stopB();
  peers.publish('set:x', 2, a);
  assert.deepEqual(received, ['b:1']);
});

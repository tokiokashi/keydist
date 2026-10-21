import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalPositionFor } from './use-playback-arrival.ts';

test('リンクの対象が今の対象と同じ時だけ最初の文字位置を使う', () => {
  assert.equal(arrivalPositionFor({ charPosition: 12, targetKey: 'a' }, 'a'), 12);
  assert.equal(arrivalPositionFor({ charPosition: 12, targetKey: 'a' }, 'b'), undefined);
});

test('リンクの対象を解決できず一致を確かめられない時は最初の文字位置を使わない', () => {
  assert.equal(arrivalPositionFor({ charPosition: 12, targetKey: undefined }, 'a'), undefined);
  assert.equal(arrivalPositionFor(undefined, 'a'), undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_SELECTION_CODEC } from './comparison-selection-codec.ts';

test('COMPARISON_SELECTION_CODEC: encode→decodeで往復する', () => {
  const state = { setupIds: ['a', 'b'], baselineSetupId: 'a' };
  const decoded = COMPARISON_SELECTION_CODEC.decode(COMPARISON_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('COMPARISON_SELECTION_CODEC: baselineSetupId無しでも往復する（基準なし）', () => {
  const state = { setupIds: ['a'], baselineSetupId: undefined };
  const decoded = COMPARISON_SELECTION_CODEC.decode(COMPARISON_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('COMPARISON_SELECTION_CODEC: setupIdsが配列でなければ資産全体を既定値へ戻す', () => {
  const decoded = COMPARISON_SELECTION_CODEC.decode({ version: 1, setupIds: 'not-an-array' });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, { setupIds: [], baselineSetupId: undefined });
});

test('COMPARISON_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  const decoded = COMPARISON_SELECTION_CODEC.decode('not-an-object');
  assert.equal(decoded.ok, false);
});

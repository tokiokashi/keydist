import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDALONE_TEXT_CODEC } from './standalone-text-codec.ts';
import { initialStandaloneText } from './standalone-text.ts';

test('STANDALONE_TEXT_CODEC: encode→decodeで往復する', () => {
  const state = { text: 'hello', language: { detected: 'en' as const, override: 'ja' as const } };
  const encoded = STANDALONE_TEXT_CODEC.encode(state);
  const decoded = STANDALONE_TEXT_CODEC.decode(encoded);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('STANDALONE_TEXT_CODEC: overrideが無い場合も往復する', () => {
  const state = { text: '', language: { detected: 'ja' as const } };
  const decoded = STANDALONE_TEXT_CODEC.decode(STANDALONE_TEXT_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('STANDALONE_TEXT_CODEC: 壊れたpayloadは既定値へ戻し、診断を積む', () => {
  const decoded = STANDALONE_TEXT_CODEC.decode({ version: 1, text: 42, language: 'ja' });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, initialStandaloneText());
  assert.ok(decoded.ok && decoded.diagnostics.length > 0);
});

test('STANDALONE_TEXT_CODEC: versionが無ければ失敗', () => {
  const decoded = STANDALONE_TEXT_CODEC.decode({ text: 'x', language: { detected: 'en' } });
  assert.equal(decoded.ok, false);
});

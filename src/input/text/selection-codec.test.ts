import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TEXT_REF } from './selection.ts';
import { STANDALONE_TEXT_SELECTION_CODEC } from './selection-codec.ts';

test('decode: トップレベルがオブジェクトでなければnot-an-objectで失敗する', () => {
  for (const input of [null, 'x', 42, [], true]) {
    const result = STANDALONE_TEXT_SELECTION_CODEC.decode(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason.kind, 'not-an-object');
  }
});

test('decode: 妥当な参照をそのまま読める（組み込み）', () => {
  const result = STANDALONE_TEXT_SELECTION_CODEC.decode({ version: 1, ref: { kind: 'builtin', id: 'builtin:ja.legacy' } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } });
    assert.deepEqual(result.diagnostics, []);
  }
});

test('decode: 妥当な参照をそのまま読める（ユーザーテキスト）', () => {
  const result = STANDALONE_TEXT_SELECTION_CODEC.decode({ version: 1, ref: { kind: 'user', id: 'text-1' } });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { ref: { kind: 'user', id: 'text-1' } });
});

test('decode: refが無ければ既定（DEFAULT_TEXT_REF）へ戻し、診断を積む', () => {
  const result = STANDALONE_TEXT_SELECTION_CODEC.decode({ version: 1 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { ref: DEFAULT_TEXT_REF });
    assert.equal(result.diagnostics.length, 1);
  }
});

test('decode: kindが不正なら既定へ戻す', () => {
  const result = STANDALONE_TEXT_SELECTION_CODEC.decode({ version: 1, ref: { kind: 'ghost', id: 'x' } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { ref: DEFAULT_TEXT_REF });
    assert.equal(result.diagnostics.length, 1);
  }
});

test('encode → decode: 往復して同じ値になる', () => {
  const value = { ref: { kind: 'user' as const, id: 'text-1' } };
  const encoded = STANDALONE_TEXT_SELECTION_CODEC.encode(value);
  const decoded = STANDALONE_TEXT_SELECTION_CODEC.decode(encoded);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.value, value);
});

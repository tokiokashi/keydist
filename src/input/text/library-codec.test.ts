import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEXT_LIBRARY_CODEC } from './library-codec.ts';
import type { UserText } from './library.ts';

const textA: UserText = { id: 't-1', name: 'テストA', text: 'hello' };
const textB: UserText = { id: 't-2', name: 'テストB', text: 'あいうえお', languageOverride: 'ja' };

test('decode: トップレベルがオブジェクトでなければnot-an-objectで失敗する', () => {
  for (const input of [null, 'x', 42, [], true]) {
    const result = TEXT_LIBRARY_CODEC.decode(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason.kind, 'not-an-object');
  }
});

test('decode: textsが配列でなければ空扱いにする（寛容）', () => {
  const result = TEXT_LIBRARY_CODEC.decode({ version: 1, texts: 'not-an-array' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.texts, []);
});

test('decode: 妥当なユーザーテキストの配列をそのまま読める', () => {
  const result = TEXT_LIBRARY_CODEC.decode({ version: 1, texts: [textA, textB] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.texts, [textA, textB]);
    assert.deepEqual(result.diagnostics, []);
  }
});

test('decode: idが無い・空文字のテキストは要素ごと捨てて診断を積む（他は残す）', () => {
  const result = TEXT_LIBRARY_CODEC.decode({
    version: 1,
    texts: [textA, { id: '', name: '壊れたテキスト', text: 'x' }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.texts, [textA]);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('decode: idが重複する要素は後の方を捨てて診断を積む', () => {
  const duplicated: UserText = { id: 't-1', name: '重複したid', text: 'duplicated' };
  const result = TEXT_LIBRARY_CODEC.decode({ version: 1, texts: [textA, duplicated] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.texts, [textA]);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('decode: languageOverrideが不正な要素はそのフィールドだけ捨てて残りを読む', () => {
  const result = TEXT_LIBRARY_CODEC.decode({
    version: 1,
    texts: [{ id: 't-3', name: 'テストC', text: 'x', languageOverride: 'fr' }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    // strictObjectなので不正なフィールドを持つ要素は要素ごと捨てる。
    assert.deepEqual(result.value.texts, []);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('encode → decode: 往復して同じ値になる', () => {
  const value = { texts: [textA, textB] };
  const encoded = TEXT_LIBRARY_CODEC.encode(value);
  const decoded = TEXT_LIBRARY_CODEC.decode(encoded);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.value, value);
});

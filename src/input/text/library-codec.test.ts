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

test('decode: languageOverrideが不正な要素は、そのフィールドだけ落として要素は残す（レビュー指摘: 以前は要素ごと捨てていた）', () => {
  const result = TEXT_LIBRARY_CODEC.decode({
    version: 1,
    texts: [{ id: 't-3', name: 'テストC', text: 'x', languageOverride: 'fr' }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.texts, [{ id: 't-3', name: 'テストC', text: 'x' }]);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('decode: languageOverrideが無い要素は診断を積まない', () => {
  const result = TEXT_LIBRARY_CODEC.decode({ version: 1, texts: [textA] });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.diagnostics, []);
});

test('decode: 未知の項目は捨てて診断を積む（要素は残す）', () => {
  const result = TEXT_LIBRARY_CODEC.decode({ version: 1, texts: [{ id: 'b', name: 'n', text: 't', typo: 1 }] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.texts, [{ id: 'b', name: 'n', text: 't' }]);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.path), ['texts[0].typo']);
  }
});

test('encode → decode: 往復して同じ値になる', () => {
  const value = { texts: [textA, textB] };
  const encoded = TEXT_LIBRARY_CODEC.encode(value);
  const decoded = TEXT_LIBRARY_CODEC.decode(encoded);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.value, value);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEXTS, builtinTextById, DEFAULT_BUILTIN_TEXT_ID, deriveEditedTextName, isBuiltinTextId } from './builtin.ts';

test('BUILTIN_TEXTS: 既存のサンプル（en.default / ja.modern / ja.legacy）が3件揃っている', () => {
  assert.equal(BUILTIN_TEXTS.length, 3);
  const ids = BUILTIN_TEXTS.map((entry) => entry.id).sort();
  assert.deepEqual(ids, ['builtin:en.default', 'builtin:ja.legacy', 'builtin:ja.modern']);
});

test('DEFAULT_BUILTIN_TEXT_ID: ja.legacyを指す', () => {
  assert.equal(DEFAULT_BUILTIN_TEXT_ID, 'builtin:ja.legacy');
  assert.ok(builtinTextById(DEFAULT_BUILTIN_TEXT_ID) !== undefined);
});

test('builtinTextById: 存在しないidはundefined', () => {
  assert.equal(builtinTextById('builtin:no-such-id'), undefined);
});

test('isBuiltinTextId: 組み込みのid形式だけを判定する', () => {
  assert.equal(isBuiltinTextId('builtin:ja.legacy'), true);
  assert.equal(isBuiltinTextId('text-abc123'), false);
});

test('deriveEditedTextName: 「（既定）」注記を落としてから「（編集）」を足す', () => {
  assert.equal(deriveEditedTextName('旧文「吾輩は猫である」（既定）'), '旧文「吾輩は猫である」（編集）');
});

test('deriveEditedTextName: 「（既定）」が無い名前にはそのまま足す', () => {
  assert.equal(deriveEditedTextName('現代文'), '現代文（編集）');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinTextById, DEFAULT_BUILTIN_TEXT_ID, deriveEditedTextName } from './builtin.ts';

test('DEFAULT_BUILTIN_TEXT_ID: ja.legacyを指す', () => {
  assert.equal(DEFAULT_BUILTIN_TEXT_ID, 'builtin:ja.legacy');
  assert.ok(builtinTextById(DEFAULT_BUILTIN_TEXT_ID) !== undefined);
});

test('builtinTextById: 存在しないidはundefined', () => {
  assert.equal(builtinTextById('builtin:no-such-id'), undefined);
});

test('deriveEditedTextName: 「（既定）」注記を落としてから「（編集）」を足す', () => {
  assert.equal(deriveEditedTextName('旧文「吾輩は猫である」（既定）'), '旧文「吾輩は猫である」（編集）');
});

test('deriveEditedTextName: 「（既定）」が無い名前にはそのまま足す', () => {
  assert.equal(deriveEditedTextName('かな文'), 'かな文（編集）');
});

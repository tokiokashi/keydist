import assert from 'node:assert/strict';
import test from 'node:test';
import { countTextCharacters } from './char-count.ts';

test('空の本文は0字', () => {
  assert.equal(countTextCharacters(''), 0);
});

test('空白と改行も評価の対象なので数える', () => {
  assert.equal(countTextCharacters('a b\nc'), 5);
});

test('日本語は1字ずつ数える', () => {
  assert.equal(countTextCharacters('吾輩は猫である'), 7);
});

test('サロゲートペアの1文字は1字と数える（lengthの2にしない）', () => {
  assert.equal('𠮷'.length, 2);
  assert.equal(countTextCharacters('𠮷野家'), 3);
});

test('結合文字は別の字として数える（書記素で数えた1字にはしない）', () => {
  // か + 結合用濁点（U+3099）は書記素では1つだが、評価は2つの入力として扱うので2字。
  assert.equal(countTextCharacters('が'), 2);
});

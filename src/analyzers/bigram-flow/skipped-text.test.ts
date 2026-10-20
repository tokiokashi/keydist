import assert from 'node:assert/strict';
import { test } from 'node:test';
import { skippedCharsText } from './skipped-text.ts';

test('打てずに飛ばした文字が無ければ何も出さない', () => {
  assert.equal(skippedCharsText({ skipped: 0, skippedByKind: { kanji: 0, symbol: 0, other: 0 } }), undefined);
});

test('飛ばした文字を、読みに直せなかった漢字・記号・それ以外の文字に分けて出す', () => {
  assert.equal(
    skippedCharsText({ skipped: 12, skippedByKind: { kanji: 8, symbol: 3, other: 1 } }),
    '打てずに飛ばした文字 12（読みに直せなかった漢字 8・記号 3・それ以外の文字 1）',
  );
});

test('0件の種別は出さない', () => {
  assert.equal(skippedCharsText({ skipped: 2, skippedByKind: { kanji: 0, symbol: 0, other: 2 } }), '打てずに飛ばした文字 2（それ以外の文字 2）');
  assert.equal(skippedCharsText({ skipped: 5, skippedByKind: { kanji: 5, symbol: 0, other: 0 } }), '打てずに飛ばした文字 5（読みに直せなかった漢字 5）');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corpusBodyText } from './corpus-bodies.ts';

test('組み込みの日本語の本文: 空白と改行は取り除き、英数字どうしに挟まれた空白だけを1つ残す', () => {
  assert.equal(corpusBodyText('インターネット（the  Internet）は、\n世界\n中の網。'), 'インターネット（the Internet）は、世界中の網。');
  assert.equal(corpusBodyText('第1\n回\nPS II'), '第1回PS II');
  assert.equal(corpusBodyText('abc\ndef'), 'abcdef');
});

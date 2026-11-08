import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleText } from './visible-text.ts';

test('改行・空白・タブは読める記号になり、ほかの文字は変わらない', () => {
  assert.equal(visibleText('。\nあ'), '。↵あ');
  assert.equal(visibleText('\r\nあ'), '↵あ');
  assert.equal(visibleText('あ い'), 'あ␣い');
  assert.equal(visibleText('あ　い'), 'あ␣い');
  assert.equal(visibleText('\tあ'), '⇥あ');
  assert.equal(visibleText('あいう'), 'あいう');
});

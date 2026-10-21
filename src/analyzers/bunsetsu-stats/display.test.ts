import assert from 'node:assert/strict';
import test from 'node:test';
import { countText, distanceText, EMPTY_CELL_TEXT, percentText, visibleText } from './display.ts';

test('値が決まらないセルは—になり、決まった値は桁をそろえて出す', () => {
  assert.equal(distanceText(undefined), EMPTY_CELL_TEXT);
  assert.equal(distanceText(1.23456), '1.235');
  assert.equal(distanceText(0), '0.000');
  assert.equal(percentText(undefined), EMPTY_CELL_TEXT);
  assert.equal(percentText(0.02432), '2.4%');
  assert.equal(countText(undefined), EMPTY_CELL_TEXT);
  assert.equal(countText(0), '0');
});

test('改行・空白・タブは読める記号になり、ほかの文字は変わらない', () => {
  assert.equal(visibleText('。\nあ'), '。↵あ');
  assert.equal(visibleText('\r\nあ'), '↵あ');
  assert.equal(visibleText('あ い'), 'あ␣い');
  assert.equal(visibleText('あ　い'), 'あ␣い');
  assert.equal(visibleText('\tあ'), '⇥あ');
  assert.equal(visibleText('あいう'), 'あいう');
});

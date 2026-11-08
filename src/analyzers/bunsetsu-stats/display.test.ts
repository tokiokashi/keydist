import assert from 'node:assert/strict';
import test from 'node:test';
import { countText, distanceText, EMPTY_CELL_TEXT, percentText } from './display.ts';

test('値が決まらないセルは—になり、決まった値は桁をそろえて出す', () => {
  assert.equal(distanceText(undefined), EMPTY_CELL_TEXT);
  assert.equal(distanceText(1.23456), '1.235');
  assert.equal(distanceText(0), '0.000');
  assert.equal(percentText(undefined), EMPTY_CELL_TEXT);
  assert.equal(percentText(0.02432), '2.4%');
  assert.equal(countText(undefined), EMPTY_CELL_TEXT);
  assert.equal(countText(0), '0');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Setup } from '#input/setup/index.ts';
import { selectInitialSetupId } from './setup-selection.ts';

function setup(id: string): Setup {
  return { id, layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
}

test('selectInitialSetupId: 手持ちが空ならundefined', () => {
  assert.equal(selectInitialSetupId([]), undefined);
});

test('selectInitialSetupId: preferredIdが無ければ先頭を選ぶ', () => {
  assert.equal(selectInitialSetupId([setup('a'), setup('b')]), 'a');
});

test('selectInitialSetupId: preferredIdが手持ちに残っていればそれを優先する', () => {
  assert.equal(selectInitialSetupId([setup('a'), setup('b')], 'b'), 'b');
});

test('selectInitialSetupId: preferredIdが手持ちから消えていれば先頭へ落ちる', () => {
  assert.equal(selectInitialSetupId([setup('a'), setup('b')], 'deleted'), 'a');
});

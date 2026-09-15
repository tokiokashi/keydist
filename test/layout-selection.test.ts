import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection } from '../src/layout-selection.ts';

test('保存値が無ければ既定値を使う（初回訪問）', () => {
  const set = resolveSelection(undefined, ['qwerty', 'dvorak']);
  assert.deepEqual([...set], ['qwerty', 'dvorak']);
});

test('保存値があればそれをそのまま使い、既定値を混ぜない', () => {
  const set = resolveSelection(['qwerty'], ['qwerty', 'dvorak', 'colemak']);
  assert.deepEqual([...set], ['qwerty']);
});

test('保存値が空配列なら「全部オフ」を尊重し、既定値に戻さない', () => {
  const set = resolveSelection([], ['qwerty', 'dvorak']);
  assert.equal(set.size, 0);
});

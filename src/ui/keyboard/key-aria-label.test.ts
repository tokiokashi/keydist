import assert from 'node:assert/strict';
import test from 'node:test';
import { keyAriaLabel } from './key-aria-label.ts';

test('刻まれた出力が空でも、説明は読み上げの名前に入る', () => {
  assert.equal(keyAriaLabel('左親指', '', '切り替えのキー。出力を書けないキー'), '左親指（切り替えのキー。出力を書けないキー）');
});

test('刻まれた出力が空で説明も無ければ、キーの名前だけ', () => {
  assert.equal(keyAriaLabel('左Shift', '', undefined), '左Shift');
});

test('刻まれた出力があれば、出力の後ろに説明を添える', () => {
  assert.equal(keyAriaLabel('A', 'あ', undefined), 'A（あ）');
  assert.equal(keyAriaLabel('A', 'あ', '基本の指は左小指'), 'A（あ。基本の指は左小指）');
});

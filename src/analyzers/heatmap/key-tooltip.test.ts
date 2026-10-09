import assert from 'node:assert/strict';
import test from 'node:test';
import { keyTooltipText } from './key-tooltip.ts';

test('刻印が無い、または物理キーの名前と同じ時は、物理キーの名前だけを出す', () => {
  assert.equal(keyTooltipText('q', undefined, 3), 'Q: 3打');
  assert.equal(keyTooltipText('q', '', 3), 'Q: 3打');
  // 大文字と小文字は区別しない
  assert.equal(keyTooltipText('q', 'q', 3), 'Q: 3打');
  assert.equal(keyTooltipText('q', 'Q', 3), 'Q: 3打');
  assert.equal(keyTooltipText('shift-r', '右Shift', 0), '右Shift: 0打');
});

test('刻印が物理キーの名前と違う時は、刻印を先に出して物理キーの名前を添える', () => {
  assert.equal(keyTooltipText('q', 'あ', 5), 'あ（Q）: 5打');
  assert.equal(keyTooltipText('thumb-l', '変換', 2), '変換（左親指）: 2打');
  assert.equal(keyTooltipText('shift-l', 'Shift', 1), 'Shift（左Shift）: 1打');
});

test('複数の刻印を結合したものも、同じ規則で物理キーの名前と比べる', () => {
  assert.equal(keyTooltipText('a', 'a / A', 4), 'A: 4打');
  assert.equal(keyTooltipText('a', 'あ / ぁ', 4), 'あ / ぁ（A）: 4打');
  assert.equal(keyTooltipText('a', 'a / ぁ', 4), 'a / ぁ（A）: 4打');
});

test('物理配列の規格に応じた物理キーの名前を出す', () => {
  assert.equal(keyTooltipText('backquote', undefined, 1, 'jis'), '半角/全角: 1打');
  assert.equal(keyTooltipText('backquote', undefined, 1, 'ansi'), '`: 1打');
  assert.equal(keyTooltipText('[', 'ろ', 1, 'jis'), 'ろ（@）: 1打');
});

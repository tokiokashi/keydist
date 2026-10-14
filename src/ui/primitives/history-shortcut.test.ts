import assert from 'node:assert/strict';
import test from 'node:test';
import { historyShortcutOf, isTextEntryTarget, type ShortcutKeyEvent } from './history-shortcut.ts';

function key(key: string, modifiers: Partial<Omit<ShortcutKeyEvent, 'key'>> = {}): ShortcutKeyEvent {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

test('Ctrl+Zで元に戻す、Ctrl+Shift+ZとCtrl+Yでやり直す', () => {
  assert.equal(historyShortcutOf(key('z', { ctrlKey: true }), false), 'undo');
  assert.equal(historyShortcutOf(key('Z', { ctrlKey: true, shiftKey: true }), false), 'redo');
  assert.equal(historyShortcutOf(key('y', { ctrlKey: true }), false), 'redo');
});

test('macOSは⌘Zで元に戻し、⌘⇧Zでやり直す。Ctrlの組み合わせは使わない', () => {
  assert.equal(historyShortcutOf(key('z', { metaKey: true }), true), 'undo');
  assert.equal(historyShortcutOf(key('Z', { metaKey: true, shiftKey: true }), true), 'redo');
  assert.equal(historyShortcutOf(key('z', { ctrlKey: true }), true), undefined);
  assert.equal(historyShortcutOf(key('y', { metaKey: true }), true), undefined);
});

test('macOS以外では⌘Zを使わない', () => {
  assert.equal(historyShortcutOf(key('z', { metaKey: true }), false), undefined);
});

test('修飾キーが無い・Altが一緒・Ctrl+Shift+Yは対象外', () => {
  assert.equal(historyShortcutOf(key('z'), false), undefined);
  assert.equal(historyShortcutOf(key('z', { ctrlKey: true, altKey: true }), false), undefined);
  assert.equal(historyShortcutOf(key('y', { ctrlKey: true, shiftKey: true }), false), undefined);
  assert.equal(historyShortcutOf(key('x', { ctrlKey: true }), false), undefined);
  assert.equal(historyShortcutOf(key('z', { ctrlKey: true, metaKey: true }), false), undefined);
});

test('文字を入力する欄: 文字を入れる種類のinput・textarea・contenteditable', () => {
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'number' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('文字を入力する欄ではない: チェックボックス・スライダー・ラジオボタン・選択欄・ボタン・本体', () => {
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'range' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'radio' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'BODY' }), false);
  assert.equal(isTextEntryTarget(null), false);
});

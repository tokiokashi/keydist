import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserCodeToPhysicalKey,
  browserKeyboardEventToPhysicalKeyEvent,
} from '../src/features/input-converter/browser-keyboard-adapter.ts';

test('browser adapterはKeyboardEvent.codeをQWERTY物理keyへ変換する', () => {
  assert.equal(browserCodeToPhysicalKey('KeyA'), 'a');
  assert.equal(browserCodeToPhysicalKey('Digit1'), '1');
  assert.equal(browserCodeToPhysicalKey('BracketLeft'), '[');
  assert.equal(browserCodeToPhysicalKey('Space'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('Convert'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('NonConvert'), 'thumb-l');
  assert.equal(browserCodeToPhysicalKey('ArrowLeft'), undefined);
});

test('browser adapterはrepeat / composition / OS shortcutをcoreへ渡さない', () => {
  assert.equal(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keydown',
    code: 'KeyA',
    repeat: true,
  }), undefined);
  assert.equal(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keydown',
    code: 'KeyA',
    isComposing: true,
  }), undefined);
  assert.equal(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keydown',
    code: 'KeyA',
    ctrlKey: true,
  }), undefined);

  assert.deepEqual(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keyup',
    code: 'KeyA',
    repeat: true,
  }), { type: 'up', key: 'a' });
});

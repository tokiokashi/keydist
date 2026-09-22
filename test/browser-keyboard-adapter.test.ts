import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserCodeToPhysicalKey,
  browserKeyboardEventToPhysicalKeyEvent,
  shouldCaptureBrowserKeyDown,
} from '../src/features/input-converter/browser-keyboard-adapter.ts';

test('browser adapterはKeyboardEvent.codeをQWERTY物理keyへ変換する', () => {
  assert.equal(browserCodeToPhysicalKey('KeyA'), 'a');
  assert.equal(browserCodeToPhysicalKey('Digit1'), '1');
  assert.equal(browserCodeToPhysicalKey('BracketLeft'), '[');
  assert.equal(browserCodeToPhysicalKey('Space'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('Convert'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('NonConvert'), 'thumb-l');
  assert.equal(browserCodeToPhysicalKey('ShiftLeft'), 'shift-l');
  assert.equal(browserCodeToPhysicalKey('ShiftRight'), 'shift-r');
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
  assert.deepEqual(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keyup',
    code: 'KeyH',
    ctrlKey: true,
  }), { type: 'up', key: 'h' });
  assert.deepEqual(browserKeyboardEventToPhysicalKeyEvent({
    type: 'keyup',
    code: 'KeyH',
    metaKey: true,
  }), { type: 'up', key: 'h' });
});


test('layout所有Tabはrepeatでもbrowser既定動作をcaptureし、domain eventにはrepeatを流さない', () => {
  const owned = new Set(['tab']);

  const repeatTab = {
    type: 'keydown',
    code: 'Tab',
    repeat: true,
  } as const;

  assert.equal(shouldCaptureBrowserKeyDown(repeatTab, owned), true);
  assert.equal(browserKeyboardEventToPhysicalKeyEvent(repeatTab), undefined);

  assert.equal(shouldCaptureBrowserKeyDown({
    type: 'keydown',
    code: 'Tab',
    ctrlKey: true,
  }, owned), false);
  assert.equal(shouldCaptureBrowserKeyDown({
    type: 'keydown',
    code: 'Tab',
    isComposing: true,
  }, owned), false);
  assert.equal(shouldCaptureBrowserKeyDown({
    type: 'keydown',
    code: 'Tab',
  }, new Set()), false);
});

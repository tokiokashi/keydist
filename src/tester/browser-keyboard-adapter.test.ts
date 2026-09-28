import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserCodeToPhysicalKey,
  browserKeyboardEventToPhysicalKeyEvent,
  isBrowserTextInputCode,
  shouldCaptureBrowserKeyDown,
} from './browser-keyboard-adapter.ts';

test('browser adapterはKeyboardEvent.codeをQWERTY物理keyへ変換する', () => {
  assert.equal(browserCodeToPhysicalKey('KeyA'), 'a');
  assert.equal(browserCodeToPhysicalKey('Digit1'), '1');
  assert.equal(browserCodeToPhysicalKey('BracketLeft'), '[');
  assert.equal(browserCodeToPhysicalKey('Backslash'), 'backslash');
  assert.equal(browserCodeToPhysicalKey('IntlYen'), undefined);
  assert.equal(browserCodeToPhysicalKey('IntlRo'), undefined);
  assert.equal(browserCodeToPhysicalKey('Space'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('Convert'), 'thumb-r');
  assert.equal(browserCodeToPhysicalKey('NonConvert'), 'thumb-l');
  assert.equal(browserCodeToPhysicalKey('ShiftLeft'), 'shift-l');
  assert.equal(browserCodeToPhysicalKey('ShiftRight'), 'shift-r');
  assert.equal(browserCodeToPhysicalKey('ArrowLeft'), undefined);
});

test('browser adapterはJIS tester overrideで追加3キーをgrid位置へ割り当てられる', () => {
  const overrides = {
    Backslash: 'r2c11',
    IntlYen: 'r0c12',
    IntlRo: 'r3c10',
  } as const;
  assert.equal(browserCodeToPhysicalKey('Backslash', overrides), 'r2c11');
  assert.equal(browserCodeToPhysicalKey('IntlYen', overrides), 'r0c12');
  assert.equal(browserCodeToPhysicalKey('IntlRo', overrides), 'r3c10');

  for (const code of ['Backslash', 'IntlYen', 'IntlRo']) {
    assert.equal(
      shouldCaptureBrowserKeyDown({ type: 'keydown', code }, new Set(), overrides),
      true,
      code,
    );
  }
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


test('layout所有Spaceはrepeatでもbrowser scrollをcaptureする', () => {
  const owned = new Set(['thumb-r']);
  const repeatSpace = {
    type: 'keydown',
    code: 'Space',
    repeat: true,
  } as const;

  assert.equal(shouldCaptureBrowserKeyDown(repeatSpace, owned), true);
  assert.equal(browserKeyboardEventToPhysicalKeyEvent(repeatSpace), undefined);
});


test('未所有の標準文字keyはbrowser文字入力をcaptureし、navigation keyは残す', () => {
  const owned = new Set<string>();

  for (const code of ['KeyQ', 'Digit1', 'Minus', 'Backquote', 'Backslash']) {
    assert.equal(isBrowserTextInputCode(code), true, code);
    assert.equal(shouldCaptureBrowserKeyDown({
      type: 'keydown',
      code,
    }, owned), true, code);
  }

  for (const code of ['Tab', 'Escape', 'CapsLock', 'Space']) {
    assert.equal(isBrowserTextInputCode(code), false, code);
    assert.equal(shouldCaptureBrowserKeyDown({
      type: 'keydown',
      code,
    }, owned), false, code);
  }

  assert.equal(shouldCaptureBrowserKeyDown({
    type: 'keydown',
    code: 'KeyQ',
    ctrlKey: true,
  }, owned), false);
});


test('browser adapterは任意code overrideで通常keyを親指physical keyへ再割当できる', () => {
  const overrides = {
    KeyQ: 'thumb-l',
    Space: null,
  } as const;

  assert.equal(browserCodeToPhysicalKey('KeyQ', overrides), 'thumb-l');
  assert.equal(browserCodeToPhysicalKey('Space', overrides), undefined);
  assert.equal(
    shouldCaptureBrowserKeyDown(
      { type: 'keydown', code: 'KeyQ' },
      new Set(['thumb-l']),
      overrides,
    ),
    true,
  );
  assert.deepEqual(
    browserKeyboardEventToPhysicalKeyEvent(
      { type: 'keydown', code: 'KeyQ' },
      overrides,
    ),
    { type: 'down', key: 'thumb-l' },
  );
});

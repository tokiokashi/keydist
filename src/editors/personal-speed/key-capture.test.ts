import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCalibrationKeys, isCalibrationKeyPress, isTypingTarget, type KeyEventSource, type PressLike } from './key-capture.ts';

function press(key: string, overrides: Partial<PressLike> = {}): PressLike {
  return { key, repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides };
}

/** 登録と解除の数を数える、`document`の代わり。 */
function fakeSource() {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const captures: boolean[] = [];
  const source: KeyEventSource = {
    addEventListener: (_type, listener, capture) => { listeners.add(listener); captures.push(capture); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  const dispatch = (event: Partial<KeyboardEvent> & PressLike) => {
    for (const listener of [...listeners]) listener(event as KeyboardEvent);
  };
  return { source, listeners, captures, dispatch };
}

test('1文字のキーだけを測定の打鍵として扱う', () => {
  for (const key of ['f', 'J', ';', ',', '.', '/', 'ん', '、', ':']) {
    assert.equal(isCalibrationKeyPress(press(key)), true, key);
  }
});

test('文書全体のキー操作に使うキーは測定の打鍵として扱わない', () => {
  for (const key of ['Escape', 'Tab', 'Enter', 'Backspace', 'ArrowLeft', 'Shift', 'Control', 'Process', ' ']) {
    assert.equal(isCalibrationKeyPress(press(key)), false, JSON.stringify(key));
  }
});

test('修飾キーつき・押しっぱなし・変換中の押下は測定の打鍵として扱わない', () => {
  assert.equal(isCalibrationKeyPress(press('f', { ctrlKey: true })), false);
  assert.equal(isCalibrationKeyPress(press('f', { metaKey: true })), false);
  assert.equal(isCalibrationKeyPress(press('f', { altKey: true })), false);
  assert.equal(isCalibrationKeyPress(press('f', { repeat: true })), false);
  assert.equal(isCalibrationKeyPress(press('f', { isComposing: true })), false);
});

test('入力欄にフォーカスがある押下は取らない', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget), false);
  assert.equal(isTypingTarget(null), false);
});

test('取得の開始前は何も登録せず、開始から停止までの間だけ登録される', () => {
  const { source, listeners, captures } = fakeSource();
  assert.equal(listeners.size, 0);
  const stop = captureCalibrationKeys(source, () => {});
  assert.equal(listeners.size, 1);
  assert.deepEqual(captures, [true]);
  stop();
  assert.equal(listeners.size, 0);
});

test('取得の間は測定の打鍵だけが渡り、停止後は何も渡らない', () => {
  const { source, dispatch } = fakeSource();
  const received: string[] = [];
  const stop = captureCalibrationKeys(source, (event) => { received.push(event.key); });
  for (const key of ['f', 'Escape', ' ', 'Tab', 'j']) dispatch({ ...press(key), target: null });
  dispatch({ ...press('k'), target: { tagName: 'INPUT' } as unknown as EventTarget });
  dispatch({ ...press('l', { ctrlKey: true }), target: null });
  assert.deepEqual(received, ['f', 'j']);
  stop();
  dispatch({ ...press('f'), target: null });
  assert.deepEqual(received, ['f', 'j']);
});

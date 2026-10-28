import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCalibrationKeys, isCalibrationKeyPress, leftColumnKeyOf, isTypingTarget, type KeyEventSource, type PressLike } from './key-capture.ts';

function press(key: string, overrides: Partial<PressLike> = {}): PressLike {
  return { key, repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides };
}

/** 登録と解除の数を数える、`document`の代わり。 */
function fakeSource() {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const captures: boolean[] = [];
  const source: KeyEventSource = {
    addEventListener: (_type, listener, capture) => {
      listeners.add(listener);
      captures.push(capture);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
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
  assert.equal(listeners.size, 2);
  assert.deepEqual(captures, [true, true]);
  stop();
  assert.equal(listeners.size, 0);
});

test('取得の間は測定の打鍵だけが渡り、停止後は何も渡らない', () => {
  const { source, dispatch } = fakeSource();
  const received: string[] = [];
  const stop = captureCalibrationKeys(source, (event) => {
    received.push(event.key);
  });
  for (const key of ['f', 'Escape', ' ', 'Tab', 'j']) dispatch({ ...press(key), target: null });
  dispatch({ ...press('k'), target: { tagName: 'INPUT' } as unknown as EventTarget });
  dispatch({ ...press('l', { ctrlKey: true }), target: null });
  assert.deepEqual(received, ['f', 'j']);
  stop();
  dispatch({ ...press('f'), target: null });
  assert.deepEqual(received, ['f', 'j']);
});

/** キーの種類ごとに登録を持ち、`preventDefault`と`stopPropagation`の呼び出しを数える、`document`の代わり。 */
function typedSource() {
  const listeners: Record<'keydown' | 'keyup', Set<(event: KeyboardEvent) => void>> = { keydown: new Set(), keyup: new Set() };
  const source: KeyEventSource = {
    addEventListener: (type, listener) => {
      listeners[type].add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners[type].delete(listener);
    },
  };
  const dispatch = (type: 'keydown' | 'keyup', overrides: Partial<PressLike> = {}) => {
    const calls = { prevented: 0, stopped: 0 };
    const event = {
      ...press(' ', { code: 'Space', ...overrides }),
      target: null,
      preventDefault: () => {
        calls.prevented += 1;
      },
      stopPropagation: () => {
        calls.stopped += 1;
      },
    };
    for (const listener of [...listeners[type]]) listener(event as unknown as KeyboardEvent);
    return calls;
  };
  return { source, listeners, dispatch };
}

test('Spaceを受け付ける間だけ、Spaceの押下を渡し、押下と繰り返しと離しをブラウザの働きへ渡さない', () => {
  const { source, dispatch } = typedSource();
  let accepts = false;
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.key);
    },
    { acceptsSpace: () => accepts },
  );
  assert.deepEqual(dispatch('keydown'), { prevented: 0, stopped: 0 });
  assert.deepEqual(dispatch('keyup'), { prevented: 0, stopped: 0 });
  assert.deepEqual(received, []);
  accepts = true;
  assert.deepEqual(dispatch('keydown'), { prevented: 1, stopped: 1 });
  // 押し続けて起こる繰り返しは、打鍵として渡さずブラウザの働きだけを止める
  assert.deepEqual(dispatch('keydown', { repeat: true }), { prevented: 1, stopped: 1 });
  assert.deepEqual(dispatch('keyup'), { prevented: 1, stopped: 1 });
  assert.deepEqual(received, [' ']);
});

test('Spaceを受け付ける間も、修飾キーつきのSpaceは取らない', () => {
  const { source, dispatch } = typedSource();
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.key);
    },
    { acceptsSpace: () => true },
  );
  assert.deepEqual(dispatch('keydown', { ctrlKey: true }), { prevented: 0, stopped: 0 });
  assert.deepEqual(received, []);
});

test('Spaceを押したまま止めると、離した時の操作を1回だけ渡さず、その後は渡す', () => {
  const { source, listeners, dispatch } = typedSource();
  const stop = captureCalibrationKeys(source, () => {}, { acceptsSpace: () => true });
  dispatch('keydown');
  stop();
  assert.equal(listeners.keydown.size, 0);
  assert.deepEqual(dispatch('keyup'), { prevented: 1, stopped: 1 });
  assert.equal(listeners.keyup.size, 0);
  assert.deepEqual(dispatch('keyup'), { prevented: 0, stopped: 0 });
});

test('Spaceを押していない時に止めても、離しの登録は残らない', () => {
  const { source, listeners } = typedSource();
  const stop = captureCalibrationKeys(source, () => {}, { acceptsSpace: () => true });
  stop();
  assert.equal(listeners.keydown.size + listeners.keyup.size, 0);
});

test('左端の列のキーの押下は、受け付ける時だけ測定の打鍵として扱う', () => {
  const capsLock = press('CapsLock', { code: 'CapsLock' });
  const tab = press('Tab', { code: 'Tab' });
  const backquote = press('Zenkakuhankaku', { code: 'Backquote' });
  for (const event of [capsLock, tab, backquote]) {
    assert.equal(isCalibrationKeyPress(event), false, event.key);
    assert.equal(
      isCalibrationKeyPress(event, {}, () => true),
      true,
      event.key,
    );
  }
  assert.equal(
    isCalibrationKeyPress(tab, {}, (keyId) => keyId === 'caps-lock'),
    false,
  );
});

test('利用者がcodeを別のキーに割り当てていれば、左端の列のキーとして扱わない', () => {
  assert.equal(leftColumnKeyOf({ code: 'CapsLock' }), 'caps-lock');
  assert.equal(leftColumnKeyOf({ code: 'CapsLock' }, { CapsLock: 'a' }), undefined);
  assert.equal(leftColumnKeyOf({ code: 'CapsLock' }, { CapsLock: null }), undefined);
  assert.equal(leftColumnKeyOf({ code: 'IntlRo' }, { IntlRo: 'caps-lock' }), 'caps-lock');
});

test('次に打つキーがtabの時のTabの押下だけを取り、tabでない時のTabは取らない', () => {
  const { source, dispatch } = typedSource();
  let next = 'a';
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.code);
      // 打つキーだった押下だけが、ブラウザの働きを止める（`use-sentence-run.ts`と同じ）
      event.preventDefault();
    },
    { acceptsLeftColumnKey: (keyId) => keyId === next },
  );
  assert.deepEqual(dispatch('keydown', { key: 'Tab', code: 'Tab' }), { prevented: 0, stopped: 0 });
  assert.deepEqual(received, []);
  next = 'tab';
  assert.deepEqual(dispatch('keydown', { key: 'Tab', code: 'Tab' }), { prevented: 1, stopped: 0 });
  assert.deepEqual(received, ['Tab']);
});

test('CapsLockのkeydownが無いまま届いたkeyupは押下として扱い、keydownと対のkeyupは扱わない', () => {
  const { source, dispatch } = typedSource();
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.code);
    },
    { acceptsLeftColumnKey: (keyId) => keyId === 'caps-lock' },
  );
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.deepEqual(received, ['CapsLock']);
  dispatch('keydown', { key: 'CapsLock', code: 'CapsLock' });
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.deepEqual(received, ['CapsLock', 'CapsLock']);
  // 次に離しだけが届く押下は、再び押下として扱う
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.deepEqual(received, ['CapsLock', 'CapsLock', 'CapsLock']);
});

test('CapsLock以外のkeyupは押下として扱わない', () => {
  const { source, dispatch } = typedSource();
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.code);
    },
    { acceptsLeftColumnKey: () => true },
  );
  dispatch('keyup', { key: 'Tab', code: 'Tab' });
  dispatch('keyup', { key: 'f', code: 'KeyF' });
  assert.deepEqual(received, []);
});

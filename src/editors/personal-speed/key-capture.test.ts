import assert from 'node:assert/strict';
import test from 'node:test';
import { pressSentenceSessionKey, startSentenceSession, stepsSentencePlan, type SentenceStep } from '#interpretation/timing/sentence-session.ts';
import {
  captureCalibrationKeys,
  matchableKeyEvent,
  isCalibrationKeyPress,
  isTypingTarget,
  swallowsPress,
  type KeyEventSource,
  type PressLike,
} from './key-capture.ts';

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

test('CapsLock・Tab・Backquoteの押下は、文章を打つ測定の指定がある時だけ、対応がキーのidを返すなら扱う', () => {
  const capsLock = press('CapsLock', { code: 'CapsLock' });
  const tab = press('Tab', { code: 'Tab' });
  const backquote = press('Zenkakuhankaku', { code: 'Backquote' });
  for (const event of [capsLock, tab, backquote]) {
    assert.equal(isCalibrationKeyPress(event), false, event.key);
    assert.equal(isCalibrationKeyPress(event, {}, true), true, event.key);
  }
  // 割り当て先は左端の列のキーに限らない。割り当てなし（null）にすると扱わない
  assert.equal(isCalibrationKeyPress(capsLock, { CapsLock: 'a' }, true), true);
  assert.equal(isCalibrationKeyPress(capsLock, { CapsLock: null }, true), false);
  // 3つ以外のcodeは広げない
  assert.equal(isCalibrationKeyPress(press('Enter', { code: 'Enter' }), {}, true), false);
  assert.equal(isCalibrationKeyPress(press('Escape', { code: 'Escape' }), {}, true), false);
  // 1文字のキーは、指定が無くても扱う
  assert.equal(isCalibrationKeyPress(press('`', { code: 'Backquote' })), true);
  assert.equal(isCalibrationKeyPress(press('\\', { code: 'IntlRo' })), true);
  // 修飾キーつきと変換中は扱わない
  assert.equal(isCalibrationKeyPress(press('Tab', { code: 'Tab', ctrlKey: true }), {}, true), false);
  assert.equal(isCalibrationKeyPress(press('Tab', { code: 'Tab', isComposing: true }), {}, true), false);
});

test('Tabの押下は取って受け取る側へ渡し、取り込み自身はpreventDefaultを呼ばない', () => {
  const { source, dispatch } = typedSource();
  let next = 'a';
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.code);
      if (next === 'tab') event.preventDefault();
    },
    { withLeftColumnCodes: true },
  );
  assert.deepEqual(dispatch('keydown', { key: 'Tab', code: 'Tab' }), { prevented: 0, stopped: 0 });
  assert.deepEqual(received, ['Tab']);
  next = 'tab';
  assert.deepEqual(dispatch('keydown', { key: 'Tab', code: 'Tab' }), { prevented: 1, stopped: 0 });
  assert.deepEqual(received, ['Tab', 'Tab']);
});

test('指定が無い取得（指の移動などを測る他の測定）は、Tab・CapsLockを今までどおり取らない', () => {
  const { source, dispatch } = typedSource();
  const received: string[] = [];
  captureCalibrationKeys(source, (event) => {
    received.push(event.code);
  });
  dispatch('keydown', { key: 'Tab', code: 'Tab' });
  dispatch('keydown', { key: 'CapsLock', code: 'CapsLock' });
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.deepEqual(received, []);
});

test('CapsLockのkeydownが無いまま届いたkeyupは押下として扱い、keydownと対のkeyupは扱わない', () => {
  const { source, dispatch } = typedSource();
  const received: string[] = [];
  captureCalibrationKeys(
    source,
    (event) => {
      received.push(event.code);
    },
    { withLeftColumnCodes: true },
  );
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.equal(received.length, 1);
  dispatch('keydown', { key: 'CapsLock', code: 'CapsLock' });
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.equal(received.length, 2);
  // 対のkeyupを処理した後に届くkeyupは、再び押下として扱う
  dispatch('keyup', { key: 'CapsLock', code: 'CapsLock' });
  assert.equal(received.length, 3);
});

test('ふつうの環境のkeydown・keyup・keydown・keyupの並びは、2回の押下になる', () => {
  const { source, dispatch } = typedSource();
  let presses = 0;
  captureCalibrationKeys(
    source,
    () => {
      presses += 1;
    },
    { withLeftColumnCodes: true },
  );
  for (const type of ['keydown', 'keyup', 'keydown', 'keyup'] as const) dispatch(type, { key: 'CapsLock', code: 'CapsLock' });
  assert.equal(presses, 2);
});

test('CapsLock以外のkeyupは押下として扱わない', () => {
  const { source, dispatch } = typedSource();
  let presses = 0;
  captureCalibrationKeys(
    source,
    () => {
      presses += 1;
    },
    { withLeftColumnCodes: true },
  );
  dispatch('keyup', { key: 'Tab', code: 'Tab' });
  dispatch('keyup', { key: 'f', code: 'KeyF' });
  assert.equal(presses, 0);
});

test('文章を打つ測定の進行を通すと、次に打つキーがtabの時のTabだけがブラウザの働きへ渡らない', () => {
  const step = (keys: string[], inputIndex: number): SentenceStep => ({ keys, inputIndex, inputChar: String(inputIndex) });
  const plan = stepsSentencePlan([step(['tab'], 0), step(['a'], 1)], () => undefined);
  const label = (id: string) => id;
  const tab = matchableKeyEvent({ key: 'Tab', code: 'Tab' }, {});
  const a = matchableKeyEvent({ key: 'a', code: 'KeyA' }, {});
  // 次に打つキーがtab: 打鍵になり、渡さない
  const session = startSentenceSession([plan]);
  const hit = pressSentenceSessionKey(session, tab, 100, label);
  assert.notEqual(hit.outcome.kind, 'wrong-key');
  assert.equal(swallowsPress(hit.outcome.kind), true);
  // 次に打つキーがa: Tabは違うキーの押下になり、渡す（フォーカス移動を止めない）
  const afterTab = pressSentenceSessionKey(hit.session, tab, 200, label);
  assert.equal(afterTab.outcome.kind, 'wrong-key');
  assert.equal(swallowsPress(afterTab.outcome.kind), false);
  // 次に打つキーがaの時のaは、渡さない
  assert.equal(swallowsPress(pressSentenceSessionKey(hit.session, a, 300, label).outcome.kind), true);
});

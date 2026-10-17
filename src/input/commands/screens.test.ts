import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCommandInScreen,
  applyExternalChangeToScreens,
  arrayItemScope,
  discardScreenHistory,
  emptyScreenHistories,
  recordItemScope,
  stepInScreen,
  type Command,
  type ItemScopes,
  type ScreenHistories,
} from './index.ts';

interface Item {
  readonly id: string;
  readonly value: number;
}

interface Assets {
  readonly counter: number;
  readonly mark: { readonly text: string };
  readonly items: readonly Item[];
  readonly options: Readonly<Record<string, unknown>>;
}

const SCOPES: ItemScopes<Assets> = {
  items: arrayItemScope<Item>((item) => item.id),
  options: recordItemScope<Readonly<Record<string, unknown>>>(),
};

const INITIAL: Assets = {
  counter: 0,
  mark: { text: '初期' },
  items: [
    { id: 'a', value: 1 },
    { id: 'b', value: 1 },
  ],
  options: { x: { n: 1 }, y: { n: 1 } },
};

const increment: Command<Assets> = (current) => ({ kind: 'applied', label: '増やす', changes: { counter: current.counter + 1 } });

function setItem(id: string, value: number): Command<Assets> {
  return (current) => ({
    kind: 'applied',
    label: `${id}を変える`,
    changes: { items: current.items.map((item) => (item.id === id ? { ...item, value } : item)) },
  });
}

function addItem(id: string): Command<Assets> {
  return (current) => ({ kind: 'applied', label: `${id}を足す`, changes: { items: [...current.items, { id, value: 1 }] } });
}

function setOption(id: string, n: number): Command<Assets> {
  return (current) => ({ kind: 'applied', label: `${id}の設定`, changes: { options: { ...current.options, [id]: { n } } } });
}

/** 件の中身と別の資産を同時に変える。 */
function setItemAndCounter(id: string, value: number): Command<Assets> {
  return (current) => ({
    kind: 'applied',
    label: '同時に変える',
    changes: {
      items: current.items.map((item) => (item.id === id ? { ...item, value } : item)),
      counter: current.counter + 1,
    },
  });
}

/** 履歴に積まない変換。末尾に「!」が無ければ付ける（付いていれば同じ参照を返す）。 */
const markBang: Command<Assets> = () => ({
  kind: 'quiet',
  label: '印を付ける',
  transforms: { mark: (mark) => (mark.text.endsWith('!') ? mark : { text: `${mark.text}!` }) },
});

function setMark(text: string): Command<Assets> {
  return () => ({ kind: 'applied', label: `印を${text}にする`, changes: { mark: { text } } });
}

interface State {
  readonly assets: Assets;
  readonly histories: ScreenHistories<Assets>;
}

/** 画面ごとの履歴を持つ状態の上で、コマンドと戻す・やり直すを順に当てる小さな道具。 */
function session() {
  let state: State = { assets: INITIAL, histories: emptyScreenHistories() };
  return {
    get assets() {
      return state.assets;
    },
    get histories() {
      return state.histories;
    },
    dispatch(screen: string | undefined, command: Command<Assets>) {
      const result = applyCommandInScreen(state.assets, state.histories, screen, command);
      state = { assets: result.assets, histories: result.histories };
      return result.outcome;
    },
    step(screen: string, direction: 'undo' | 'redo') {
      const result = stepInScreen(state.assets, state.histories, screen, direction, SCOPES);
      state = { assets: result.assets, histories: result.histories };
      return result.outcome;
    },
    stack(screen: string, which: 'undoStack' | 'redoStack') {
      return state.histories.get(screen)?.[which].map((entry) => entry.label) ?? [];
    },
  };
}

test('画面ごとの履歴: ある画面でした変更は、別の画面の元に戻すでは動かない', () => {
  const s = session();
  s.dispatch('/a', increment);
  assert.deepEqual(s.stack('/a', 'undoStack'), ['増やす']);
  assert.deepEqual(s.stack('/b', 'undoStack'), []);
  assert.equal(s.step('/b', 'undo').kind, 'no-op');
  assert.equal(s.assets.counter, 1);
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.counter, 0);
});

test('画面ごとの履歴: 離れた画面の履歴は残り、戻ってから元に戻す・やり直すができる', () => {
  const s = session();
  s.dispatch('/a', increment);
  s.dispatch('/b', setMark('b'));
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.counter, 0);
  assert.equal(s.assets.mark.text, 'b');
  assert.equal(s.step('/a', 'redo').kind, 'applied');
  assert.equal(s.assets.counter, 1);
});

test('別の画面で同じ資産が書き換わっていたら戻さず、その項目を捨て、次はその下の項目を戻す', () => {
  const s = session();
  s.dispatch('/a', setMark('a1'));
  s.dispatch('/a', increment);
  s.dispatch('/a', setMark('a2'));
  s.dispatch('/b', setMark('b'));
  const before = s.assets;

  const outcome = s.step('/a', 'undo');
  assert.deepEqual(outcome, { kind: 'conflict', label: '印をa2にする' });
  assert.equal(s.assets, before, '値は変えない');
  assert.deepEqual(s.stack('/a', 'undoStack'), ['印をa1にする', '増やす']);
  assert.deepEqual(s.stack('/a', 'redoStack'), [], '捨てた項目はやり直しに移さない');

  // 次の元に戻すは、その下の項目（触れていない資産）を戻す
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.counter, 0);
  assert.equal(s.assets.mark.text, 'b');
});

test('やり直す時は、変更前の値と照らし合わせる', () => {
  const s = session();
  s.dispatch('/a', increment);
  s.step('/a', 'undo');
  s.dispatch('/b', increment);
  const outcome = s.step('/a', 'redo');
  assert.equal(outcome.kind, 'conflict');
  assert.equal(s.assets.counter, 1);
  assert.deepEqual(s.stack('/a', 'redoStack'), []);
  assert.deepEqual(s.stack('/a', 'undoStack'), []);
});

test('同じ参照に書き戻されていれば、別の画面を経由していても戻せる', () => {
  const s = session();
  s.dispatch('/a', setMark('a'));
  const mark = s.assets.mark;
  s.dispatch('/b', setMark('b'));
  s.step('/b', 'undo');
  // Bの元に戻すは、Bの項目の変更前の値（Aが書いた値の参照）を書き戻す
  assert.equal(s.assets.mark, mark);
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.mark.text, '初期');
});

test('項目が触れた資産のうち1つでも合わなければ、全部戻さない', () => {
  const s = session();
  s.dispatch('/a', (current) => ({
    kind: 'applied',
    label: '2つ変える',
    changes: { counter: current.counter + 1, mark: { text: 'a' } },
  }));
  s.dispatch('/b', increment);
  const before = s.assets;
  assert.equal(s.step('/a', 'undo').kind, 'conflict');
  assert.equal(s.assets, before);
  assert.equal(s.assets.mark.text, 'a');
});

test('配列の件: 別の件を別の画面で変えても、自分の件の変更を戻せる', () => {
  const s = session();
  s.dispatch('/workspace/a', setItem('a', 5));
  s.dispatch('/workspace/b', setItem('b', 7));

  assert.equal(s.step('/workspace/a', 'undo').kind, 'applied');
  assert.deepEqual(s.assets.items, [
    { id: 'a', value: 1 },
    { id: 'b', value: 7 },
  ]);
  assert.equal(s.step('/workspace/a', 'redo').kind, 'applied');
  assert.deepEqual(s.assets.items, [
    { id: 'a', value: 5 },
    { id: 'b', value: 7 },
  ]);
});

test('配列の件: 同じ件が別の画面で書き換わっていたら戻さない', () => {
  const s = session();
  s.dispatch('/workspace/a', setItem('a', 5));
  s.dispatch('/other', setItem('a', 9));
  assert.equal(s.step('/workspace/a', 'undo').kind, 'conflict');
  assert.deepEqual(s.assets.items, [
    { id: 'a', value: 9 },
    { id: 'b', value: 1 },
  ]);
});

test('配列の件: 件が別の画面で削除されていたら戻さない', () => {
  const s = session();
  s.dispatch('/workspace/a', setItem('a', 5));
  s.dispatch('/other', (current) => ({ kind: 'applied', label: '消す', changes: { items: current.items.filter((item) => item.id !== 'a') } }));
  assert.equal(s.step('/workspace/a', 'undo').kind, 'conflict');
});

test('配列の件: 件を足した項目は、別の件が変わっていたら戻さない', () => {
  const s = session();
  s.dispatch('/a', addItem('c'));
  s.dispatch('/b', setItem('b', 7));
  assert.equal(s.step('/a', 'undo').kind, 'conflict');
  assert.equal(s.assets.items.length, 3);
});

test('配列の件: 件を足した項目は、他に変わりが無ければ戻せる', () => {
  const s = session();
  s.dispatch('/a', addItem('c'));
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.deepEqual(
    s.assets.items.map((item) => item.id),
    ['a', 'b'],
  );
});

test('配列の件: 別の画面で並びが入れ替わっていても、idで引いて戻せる', () => {
  const s = session();
  s.dispatch('/a', setItem('a', 5));
  s.dispatch('/b', (current) => ({ kind: 'applied', label: '逆順', changes: { items: [...current.items].reverse() } }));
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.deepEqual(
    s.assets.items.map((item) => item.id),
    ['b', 'a'],
  );
  assert.equal(s.assets.items.find((item) => item.id === 'a')?.value, 1);
});

test('配列の件: 件の中身と他の資産を同時に変えた項目は、他の資産が合わなければ戻さない', () => {
  const s = session();
  s.dispatch('/a', setItemAndCounter('a', 5));
  s.dispatch('/b', increment);
  assert.equal(s.step('/a', 'undo').kind, 'conflict');
  assert.equal(s.assets.items[0]!.value, 5);
});

test('配列の件: 件の中身と他の資産を同時に変えた項目は、件の側が別の件の変更だけなら戻せる', () => {
  const s = session();
  s.dispatch('/a', setItemAndCounter('a', 5));
  s.dispatch('/b', setItem('b', 7));
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.counter, 0);
  assert.deepEqual(s.assets.items, [
    { id: 'a', value: 1 },
    { id: 'b', value: 7 },
  ]);
});

test('recordの件: 別のidの設定を変えても、自分のidの設定を戻せる', () => {
  const s = session();
  s.dispatch('/x', setOption('x', 5));
  s.dispatch('/y', setOption('y', 7));
  assert.equal(s.step('/x', 'undo').kind, 'applied');
  assert.deepEqual(s.assets.options, { x: { n: 1 }, y: { n: 7 } });
  assert.equal(s.step('/x', 'redo').kind, 'applied');
  assert.deepEqual(s.assets.options, { x: { n: 5 }, y: { n: 7 } });
});

test('recordの件: 初めて書いたidも、別のidが後から増えていても戻せて、そのidだけが外れる', () => {
  const s = session();
  s.dispatch('/x', setOption('z', 5));
  s.dispatch('/y', setOption('y', 7));
  assert.equal(s.step('/x', 'undo').kind, 'applied');
  assert.deepEqual(s.assets.options, { x: { n: 1 }, y: { n: 7 } });
  assert.equal(s.step('/x', 'redo').kind, 'applied');
  assert.deepEqual(s.assets.options, { x: { n: 1 }, y: { n: 7 }, z: { n: 5 } });
});

test('recordの件: 同じidが別の画面で書き換わっていたら戻さない', () => {
  const s = session();
  s.dispatch('/x', setOption('x', 5));
  s.dispatch('/y', setOption('x', 9));
  assert.equal(s.step('/x', 'undo').kind, 'conflict');
  assert.deepEqual(s.assets.options.x, { n: 9 });
});

test('履歴を持たない画面からの書き込みは、どの履歴にも積まず、触れた資産の項目を戻せなくする', () => {
  const s = session();
  s.dispatch('/a', increment);
  s.dispatch('/a', setMark('a'));
  s.dispatch(undefined, increment);
  assert.deepEqual(s.stack('/a', 'undoStack'), ['増やす', '印をaにする']);
  assert.deepEqual([...s.histories.keys()], ['/a']);
  // 触れていない資産の項目は戻せる
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.mark.text, '初期');
  // 書き換わった資産に触れる項目は戻せない
  assert.equal(s.step('/a', 'undo').kind, 'conflict');
  assert.equal(s.assets.counter, 2);
});

test('履歴に積まない書き込み: 取っておく全部の画面の履歴に同じ変換を掛け、戻すと変換後の値に戻る', () => {
  const s = session();
  s.dispatch('/a', setMark('a'));
  s.dispatch('/b', setMark('b'));
  s.dispatch('/c', increment);
  const outcome = s.dispatch('/c', markBang);
  assert.equal(outcome.kind, 'applied');
  assert.equal(s.assets.mark.text, 'b!');
  assert.deepEqual(s.stack('/c', 'undoStack'), ['増やす'], '履歴には積まない');

  assert.equal(s.step('/b', 'undo').kind, 'applied');
  assert.equal(s.assets.mark.text, 'a!');
  assert.equal(s.step('/a', 'undo').kind, 'applied');
  assert.equal(s.assets.mark.text, '初期!');
});

test('履歴に積まない書き込み: 変換前が同じ参照の値は、同じ変換後の参照になる', () => {
  const s = session();
  s.dispatch('/a', setMark('a'));
  s.dispatch('/b', setMark('b'));
  s.dispatch(undefined, markBang);
  const bEntry = s.histories.get('/b')!.undoStack[0]!;
  const aEntry = s.histories.get('/a')!.undoStack[0]!;
  // /aの変更後の値と/bの変更前の値は、変換前に同じ参照だった
  assert.equal(aEntry.after.mark, bEntry.before.mark);
});

test('履歴に積まない書き込み: 変換で変わらなければ何もしない', () => {
  const s = session();
  s.dispatch('/a', setMark('a!'));
  const histories = s.histories;
  assert.equal(s.dispatch('/a', markBang).kind, 'no-op');
  assert.equal(s.histories, histories);
});

test('別のタブでの変更: その資産に触れる項目を、取っておく全部の画面の履歴から捨てる', () => {
  const s = session();
  s.dispatch('/a', increment);
  s.dispatch('/a', setMark('a'));
  s.dispatch('/b', increment);
  const result = applyExternalChangeToScreens(s.assets, s.histories, 'counter', 10);
  assert.equal(result.assets.counter, 10);
  assert.deepEqual(
    result.histories.get('/a')!.undoStack.map((entry) => entry.label),
    ['印をaにする'],
  );
  assert.deepEqual(result.histories.get('/b')!.undoStack, []);
});

test('画面の履歴を捨てる: 他の画面の履歴は残る', () => {
  const s = session();
  s.dispatch('/a', increment);
  s.dispatch('/b', setMark('b'));
  const next = discardScreenHistory(s.histories, '/a');
  assert.deepEqual([...next.keys()], ['/b']);
  assert.equal(discardScreenHistory(next, '/none'), next);
});

test('履歴の上限は画面ごと: 超えた分は古い方から捨てる', () => {
  let state: State = { assets: INITIAL, histories: emptyScreenHistories() };
  for (let index = 0; index < 5; index += 1) {
    const result = applyCommandInScreen(state.assets, state.histories, '/a', increment, 3);
    state = { assets: result.assets, histories: result.histories };
  }
  const other = applyCommandInScreen(state.assets, state.histories, '/b', setMark('b'), 3);
  assert.equal(other.histories.get('/a')!.undoStack.length, 3);
  assert.equal(other.histories.get('/b')!.undoStack.length, 1);
});

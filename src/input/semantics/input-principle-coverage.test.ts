import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '#tester/engine/index.ts';
import { fromKana } from '../layouts/index.ts';

type KeyEvent = { type: 'down' | 'up'; key: string };

const recognizeAll = (engine: TypingInputEngine, events: readonly KeyEvent[]) => events.flatMap((event) => engine.handle(event).recognized);

const downs = (keys: readonly string[]): KeyEvent[] => keys.map((key) => ({ type: 'down', key }));
const ups = (keys: readonly string[]): KeyEvent[] => [...keys].reverse().map((key) => ({ type: 'up', key }));
const tap = (key: string): KeyEvent[] => [...downs([key]), ...ups([key])];

/**
 * メジロ式速記のうち、規則で生成する部分の入力原理:
 * 1ストロークで押す5キーの同時打鍵が、押す順に依らず1つの出力になる。
 * 略語を辞書で引く部分は扱わない。
 */
test('5キーの同時打鍵を、押す順に依らず1つの出力として認識する', () => {
  const layout = fromKana('five-key-stroke-principle', 'Five key stroke principle', [
    ['か', [['f']]],
    ['き', [['f', 'j']]],
    ['きょう', [['f', 'j', 'k', 'l', 'thumb-r']]],
  ]);

  for (const order of [
    ['f', 'j', 'k', 'l', 'thumb-r'],
    ['thumb-r', 'l', 'k', 'j', 'f'],
    ['k', 'thumb-r', 'f', 'l', 'j'],
  ]) {
    const engine = new TypingInputEngine(layout.canonicalInputs);
    const recognized = recognizeAll(engine, [...downs(order), ...ups(order)]);
    assert.deepEqual(
      recognized.map((entry) => entry.output),
      ['きょう'],
      order.join('+'),
    );
    assert.equal(recognized[0].actions.length, 1, order.join('+'));
  }
});

/**
 * 行と段を順に打つ方式で、拗音を「行・スペース・段」の3打で出す原理（つばめ配列の説明どおり）。
 * 具体のキー割り当ては出典から確かめていないので、ここでは仮のキーを使う。
 * 途中の打鍵では出力せず、最後の打鍵で1つの出力になる。2打のかなと同じ行キーで始まっても取り違えない。
 */
test('行・スペース・段の3打を、途中の出力なしで最後の打鍵まで認識する', () => {
  const layout = fromKana('row-space-column-principle', 'Row space column principle', [
    ['か', [['f'], ['a']]],
    ['き', [['f'], ['s']]],
    ['きゃ', [['f'], ['thumb-r'], ['a']]],
  ]);

  const two = new TypingInputEngine(layout.canonicalInputs);
  assert.deepEqual(recognizeAll(two, [...tap('f')]), []);
  assert.deepEqual(
    recognizeAll(two, tap('a')).map((entry) => entry.output),
    ['か'],
  );

  const three = new TypingInputEngine(layout.canonicalInputs);
  assert.deepEqual(recognizeAll(three, [...tap('f'), ...tap('thumb-r')]), []);
  const kya = recognizeAll(three, tap('a'));
  assert.deepEqual(
    kya.map((entry) => entry.output),
    ['きゃ'],
  );
  assert.equal(kya[0].replacePreviousText, undefined);
  assert.deepEqual(
    kya[0].actions.map((action) => action.keys),
    [['f'], ['thumb-r'], ['a']],
  );
});

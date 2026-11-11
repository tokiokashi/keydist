import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '#tester/engine/index.ts';
import { applyRecognizedTypingInputs } from '#tester/typing-session-command.ts';
import { fromKana } from '../layouts/index.ts';

type KeyEvent = { type: 'down' | 'up'; key: string };

const recognizeAll = (engine: TypingInputEngine, events: readonly KeyEvent[]) => events.flatMap((event) => engine.handle(event).recognized);

const downs = (keys: readonly string[]): KeyEvent[] => keys.map((key) => ({ type: 'down', key }));
const ups = (keys: readonly string[]): KeyEvent[] => [...keys].reverse().map((key) => ({ type: 'up', key }));

/**
 * 姫踊子草・シン蜂蜜小梅の入力原理:
 * - 親指キー + 文字キーの2キー同時打鍵
 * - 文字キーどうしの2キー同時打鍵
 * - 親指キー + 文字キーどうしの3キー同時打鍵
 * 親指キーと文字キーを区別せず、同時に押したキーの集合として認識できることを確かめる。
 */
test('親指と文字キーが混ざる2キー・3キーの同時打鍵を、押す順に依らず認識する', () => {
  const layout = fromKana('thumb-letter-chord-principle', 'Thumb letter chord principle', [
    ['あ', [['f']]],
    ['い', [['j']]],
    ['か', [['thumb-r', 'f']]],
    ['さ', [['f', 'j']]],
    ['た', [['thumb-r', 'f', 'j']]],
  ]);

  for (const order of [
    ['thumb-r', 'f', 'j'],
    ['f', 'j', 'thumb-r'],
    ['j', 'thumb-r', 'f'],
  ]) {
    const engine = new TypingInputEngine(layout.canonicalInputs);
    const recognized = recognizeAll(engine, [...downs(order), ...ups(order)]);
    assert.deepEqual(
      recognized.map((entry) => entry.output),
      ['た'],
      order.join('+'),
    );
    assert.deepEqual(
      recognized[0].actions.map((action) => [...action.keys].sort()),
      [['f', 'j', 'thumb-r']],
      order.join('+'),
    );
  }

  const thumbLetter = new TypingInputEngine(layout.canonicalInputs);
  const ka = recognizeAll(thumbLetter, [...downs(['thumb-r', 'f']), ...ups(['thumb-r', 'f'])]);
  assert.deepEqual(
    ka.map((entry) => entry.output),
    ['か'],
  );

  const letterLetter = new TypingInputEngine(layout.canonicalInputs);
  const sa = recognizeAll(letterLetter, [...downs(['f', 'j']), ...ups(['f', 'j'])]);
  assert.deepEqual(
    sa.map((entry) => entry.output),
    ['さ'],
  );
});

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
 * つばめ配列の入力原理:
 * 中段のキーだけで、1打目で行、2打目で段を指定する。拗音は3打。
 * 行キーの単打は出力を持たず、2打目で出力し、3打目はその出力を置き換える。
 */
test('行・段・拗音の順次打鍵を認識し、3打目は直前の出力を置き換える', () => {
  const layout = fromKana('gyoudan-principle', 'Gyoudan principle', [
    ['か', [['f'], ['a']]],
    ['き', [['f'], ['s']]],
    ['きゃ', [['f'], ['s'], ['j']]],
  ]);

  const two = new TypingInputEngine(layout.canonicalInputs);
  assert.deepEqual(recognizeAll(two, [...downs(['f']), ...ups(['f'])]), []);
  const ka = recognizeAll(two, [...downs(['a']), ...ups(['a'])]);
  assert.deepEqual(
    ka.map((entry) => entry.output),
    ['か'],
  );

  const three = new TypingInputEngine(layout.canonicalInputs);
  assert.deepEqual(
    recognizeAll(three, [...downs(['f']), ...ups(['f']), ...downs(['s']), ...ups(['s'])]).map((entry) => entry.output),
    ['き'],
  );
  const kya = recognizeAll(three, [...downs(['j']), ...ups(['j'])]);
  assert.deepEqual(
    kya.map((entry) => entry.output),
    ['きゃ'],
  );
  assert.equal(kya[0].replacePreviousText, 'き');
  assert.deepEqual(
    kya[0].actions.map((action) => action.keys),
    [['f'], ['s'], ['j']],
  );
});

/**
 * New Stickneyの小書き化キーとベルダ配列の濁点キーの入力原理:
 * かなを打った後に印のキーを打つと、直前のかなを小書き・濁音へ置き換える。
 */
test('後置の印のキーは、直前に出力したかなを置き換える', () => {
  const layout = fromKana('post-mark-principle', 'Post mark principle', [
    ['や', [['f']]],
    ['ゃ', [['f'], ['j']]],
    ['か', [['d']]],
    ['が', [['d'], ['j']]],
  ]);
  const engine = new TypingInputEngine(layout.canonicalInputs);
  let text = '';
  const press = (key: string) => {
    const recognized = recognizeAll(engine, [
      { type: 'down', key },
      { type: 'up', key },
    ]);
    for (const entry of recognized) text = applyRecognizedTypingInputs(text, [entry]);
    return recognized;
  };

  assert.equal(press('f')[0].output, 'や');
  const small = press('j')[0];
  assert.equal(small.output, 'ゃ');
  assert.equal(small.replacePreviousText, 'や');
  assert.equal(text, 'ゃ');

  assert.equal(press('d')[0].output, 'か');
  assert.equal(text, 'ゃか');
  const voiced = press('j')[0];
  assert.equal(voiced.output, 'が');
  assert.equal(voiced.replacePreviousText, 'か');
  assert.equal(text, 'ゃが');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { rangeBoundsOf, sentenceEnds, textRangeBounds, textRangeCount } from './display-ranges.ts';

test('範囲の数は、評価に渡す字数を1000で割って四捨五入した数で、1を下回らない', () => {
  assert.deepEqual([0, 1, 499, 1247, 1499, 1500, 9999, 10000, 10499].map(textRangeCount), [1, 1, 1, 1, 1, 2, 10, 10, 10]);
});

test('文末は、文を終える文字の直後の閉じ括弧と空白を含めた位置になる', () => {
  assert.deepEqual(sentenceEnds('あ。い。」\n　う'), [2, 7]);
  assert.deepEqual(sentenceEnds('Hi. 3.14 is pi! ok'), [4, 16]);
  assert.deepEqual(sentenceEnds('おわり。'), []);
});

/** 長さの違う文を並べた、約10000字のテキスト。 */
function longText(): string {
  let text = '';
  for (let length = 5; text.length < 10000; length = ((length * 7 + 3) % 61) + 5) text += `${'あ'.repeat(length)}。`;
  return text;
}

test('境目は、等分した位置に最も近い文末に置き、範囲は全体を隙間なく分ける', () => {
  const text = longText();
  const chars = [...text].length;
  const ends = sentenceEnds(text);
  const bounds = textRangeBounds(text);
  assert.equal(bounds.length - 1, textRangeCount(chars));
  assert.equal(bounds[0], 0);
  assert.equal(bounds.at(-1), chars);
  for (let index = 1; index < bounds.length - 1; index++) {
    const bound = bounds[index]!;
    assert.ok(ends.includes(bound), `境目${bound}は文末`);
    const target = (index * chars) / (bounds.length - 1);
    const nearest = Math.min(...ends.map((end) => Math.abs(end - target)));
    assert.equal(Math.abs(bound - target), nearest, `境目${bound}は等分した位置${target}に最も近い文末`);
  }
});

test('文末が無ければ等分した位置に置き、1つの文が複数の境目にまたがれば境目をまとめる', () => {
  assert.deepEqual(rangeBoundsOf(3000, []), [0, 1000, 2000, 3000]);
  // 文末が1つだけ（1500）。3つの範囲の境目はどちらも1500が最も近いので、範囲は2つになる
  assert.deepEqual(rangeBoundsOf(3000, [1500]), [0, 1500, 3000]);
});

test('1500字未満のテキストは、字数を1000で割って四捨五入すると1になるので範囲が1つ', () => {
  assert.deepEqual(textRangeBounds('あ。'.repeat(600)), [0, 1200]);
});

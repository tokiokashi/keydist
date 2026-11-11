import assert from 'node:assert/strict';
import test from 'node:test';
import { comboBarriersInReading } from './combo-barriers.ts';
import type { ReadingToken } from './reading.ts';

const bytes = (text: string) => new TextEncoder().encode(text).length;

/** `tokens` を原文の先頭から隙間なく並べた語の列にする。 */
function line(parts: readonly (readonly [string, string | null, number | undefined])[]): { text: string; tokens: ReadingToken[] } {
  let position = 0;
  const tokens = parts.map(([surface, reading, stemLength]): ReadingToken => {
    const token = {
      surface,
      byteStart: position,
      byteEnd: position + bytes(surface),
      reading,
      isUnknown: false,
      ...(stemLength === undefined ? {} : { stemLength }),
    };
    position = token.byteEnd;
    return token;
  });
  return { text: parts.map(([surface]) => surface).join(''), tokens };
}

test('漢字を読みに直した位置へ、語幹と活用語尾の間の境を写す。語どうしの境には置かない', () => {
  const { text, tokens } = line([
    ['今日', 'キョウ', undefined],
    ['は', 'ハ', undefined],
    ['嬉しかっ', 'ウレシカッ', 2],
    ['た', 'タ', undefined],
  ]);
  // きょうは|うれし|かっ|た → うれし(3字)の後ろ。きょうは は4字
  assert.deepEqual(comboBarriersInReading(text, tokens), [7]);
});

test('かなで書かれた活用語（読みに直さない語）にも境を置く', () => {
  const { text, tokens } = line([
    ['雨', 'アメ', undefined],
    ['うれしかっ', 'ウレシカッ', 3],
  ]);
  assert.deepEqual(comboBarriersInReading(text, tokens), [2 + 3]);
});

test('語の間の空白は原文のまま数える', () => {
  const tokens: ReadingToken[] = [
    { surface: '早く', byteStart: 0, byteEnd: 6, reading: 'ハヤク', isUnknown: false, stemLength: 1 },
    { surface: '行か', byteStart: 7, byteEnd: 13, reading: 'イカ', isUnknown: false, stemLength: 1 },
  ];
  // はやく(3字)+空白+いか → 境は2と3+1+1
  assert.deepEqual(comboBarriersInReading('早く 行か', tokens), [2, 5]);
});

test('語ごとの直しと表記ごとの直しで読みの長さが変わっても、語尾の手前に置く', () => {
  const { text, tokens } = line([
    ['今日', 'キョウ', undefined],
    ['早く', 'ハヤク', 1],
  ]);
  assert.deepEqual(comboBarriersInReading(text, tokens, { 今日: 'こんにち' }), [4 + 2]);
  assert.deepEqual(comboBarriersInReading(text, tokens, {}, new Map([[1, 'はやーく']])), [3 + 3]);
  assert.deepEqual(comboBarriersInReading(text, tokens, { 早く: 'はやい' }), []);
});

test('語幹を持たない語だけのテキストでは境が無い', () => {
  const { text, tokens } = line([['入力', 'ニュウリョク', undefined]]);
  assert.deepEqual(comboBarriersInReading(text, tokens), []);
});

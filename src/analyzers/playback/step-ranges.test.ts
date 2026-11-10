import assert from 'node:assert/strict';
import test from 'node:test';
import { playbackRangeAt, playbackRangeCount, playbackRangesOf, playbackShownRange } from './step-ranges.ts';

/** 1文字を2ステップで打つ打鍵の列（文字位置`i`のステップは`2i`と`2i + 1`）。 */
const strokes = Array.from({ length: 20 }, (_, index) => ({ kanaStart: Math.floor(index / 2) }));

test('文字位置の境目を、その文字の最初のステップの再生位置に直す', () => {
  const ranges = playbackRangesOf(strokes, [0, 4, 10]);
  assert.deepEqual(ranges.bounds, [0, 8, 20]);
  assert.deepEqual(ranges.chars, [
    { start: 0, end: 4 },
    { start: 4, end: 10 },
  ]);
});

test('ステップを含まない範囲は作らず、その文字は隣の範囲に含める', () => {
  // 文字位置4〜5は打鍵が無い
  const sparse = strokes.map((stroke) => ({ kanaStart: stroke.kanaStart >= 4 ? stroke.kanaStart + 2 : stroke.kanaStart }));
  const ranges = playbackRangesOf(sparse, [0, 4, 6, 12]);
  assert.deepEqual(ranges.bounds, [0, 8, 20]);
  assert.deepEqual(ranges.chars, [
    { start: 0, end: 4 },
    { start: 4, end: 12 },
  ]);
  assert.deepEqual(playbackRangesOf([], [0, 5]).bounds, [0, 0]);
});

test('範囲の番号: 境目は後ろの範囲に数え、最後の位置は最後の範囲に数える', () => {
  const ranges = playbackRangesOf(strokes, [0, 4, 10]);
  assert.equal(playbackRangeCount(ranges), 2);
  assert.deepEqual(
    [0, 7, 8, 19, 20].map((cursor) => playbackRangeAt(ranges, cursor)),
    [0, 0, 1, 1, 1],
  );
});

test('出す範囲: 選んだ範囲が再生位置を境目も含めて含む間は替えず、含まなくなったら再生位置を含む範囲に替える', () => {
  const ranges = playbackRangesOf(strokes, [0, 4, 10]);
  assert.equal(playbackShownRange(ranges, 0, 8), 0);
  assert.equal(playbackShownRange(ranges, 1, 8), 1);
  assert.equal(playbackShownRange(ranges, 0, 9), 1);
  assert.equal(playbackShownRange(ranges, 1, 3), 0);
  // 範囲の数を超えた番号は最後の範囲に丸める
  assert.equal(playbackShownRange(ranges, 5, 20), 1);
});

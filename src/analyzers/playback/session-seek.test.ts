import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { createPlaybackState } from '#interpretation/timing/playback.ts';
import { generateTrace } from '#trace/generate.ts';
import { playbackCursorAtChar, seekPlaybackToChar } from './session.ts';

const geometry = buildGeometry('row-staggered');

test('文字位置を含む最初のステップまで進んだ位置を返す', () => {
  // 「き」「ょ」「う」: ローマ字は1文字が複数ステップになる
  const trace = generateTrace('きょう', LAYOUT_BY_ID.get('qwerty')!, geometry, { windowSize: 3, sfbHomeCost: true });
  for (let position = 0; position < trace.inputChars; position++) {
    const cursor = playbackCursorAtChar(trace.strokes, position);
    const stroke = trace.strokes[cursor - 1]!;
    assert.ok(stroke.kanaStart <= position && position <= stroke.kanaEnd, `位置${position}`);
    // それより前のステップは、その文字位置を含まない
    for (const earlier of trace.strokes.slice(0, cursor - 1)) assert.ok(!(earlier.kanaStart <= position && position <= earlier.kanaEnd));
  }
});

test('打鍵できなかった文字の位置は、その後で終わる最初のステップへ移る。後に無ければ最後', () => {
  const trace = generateTrace('a漢b', LAYOUT_BY_ID.get('qwerty')!, geometry, { windowSize: 3, sfbHomeCost: true });
  assert.equal(playbackCursorAtChar(trace.strokes, 1), 2);
  const tail = generateTrace('ab漢', LAYOUT_BY_ID.get('qwerty')!, geometry, { windowSize: 3, sfbHomeCost: true });
  assert.equal(playbackCursorAtChar(tail.strokes, 2), tail.strokes.length);
  assert.equal(playbackCursorAtChar([], 0), 0);
});

test('文字位置へ移ると、再生中でも一時停止になり、今のステップの経過時間は0に戻る', () => {
  const trace = generateTrace('あいうえお', LAYOUT_BY_ID.get('jis-kana')!, geometry, { windowSize: 3, sfbHomeCost: true });
  const playing = { ...createPlaybackState(6, false, undefined, 1), playing: true, elapsedMs: 120 };
  const moved = seekPlaybackToChar(playing, trace.strokes, 3);
  assert.equal(moved.cursor, 4);
  assert.equal(moved.playing, false);
  assert.equal(moved.elapsedMs, 0);
});

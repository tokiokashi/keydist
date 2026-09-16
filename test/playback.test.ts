import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback,
  clampPlaybackCursor,
  createPlaybackState,
  playbackStrokeAt,
  setPlaybackSpeed,
  stepPlayback,
} from '../src/playback.ts';

const playing = (cursor = 0) => ({
  ...createPlaybackState(),
  cursor,
  playing: true,
});

test('再生カーソルは0から総ステップ数までに収まる', () => {
  assert.equal(clampPlaybackCursor(-1, 3), 0);
  assert.equal(clampPlaybackCursor(1, 3), 1);
  assert.equal(clampPlaybackCursor(9, 3), 3);
});

test('停止・一時停止中のステップ送りは同じ整数カーソルを動かす', () => {
  const stopped = createPlaybackState();
  assert.equal(stepPlayback(stopped, 1, 3).cursor, 1);
  assert.equal(stepPlayback({ ...stopped, cursor: 3 }, -1, 3).cursor, 2);
  assert.equal(stepPlayback(playing(1), 1, 3).cursor, 1);
});

test('経過時間で速度に応じて進み、速度変更ではカーソルを動かさない', () => {
  let state = playing();
  for (let i = 0; i < 7; i++) state = advancePlayback(state, 100, 3);
  assert.equal(state.cursor, 0);
  state = advancePlayback(state, 100, 3);
  assert.equal(state.cursor, 1);

  let fast = setPlaybackSpeed(playing(), 4);
  fast = advancePlayback(fast, 100, 3);
  fast = advancePlayback(fast, 100, 3);
  assert.equal(fast.cursor, 1);
  assert.equal(setPlaybackSpeed({ ...state, cursor: 2 }, 4).cursor, 2);
});

test('末尾では停止し、先頭へループしない', () => {
  const ended = advancePlayback(playing(2), 800, 2);
  assert.equal(ended.cursor, 2);
  assert.equal(ended.playing, false);
  assert.equal(advancePlayback(ended, 800, 2).cursor, 2);
});

test('表示する打鍵はカーソル1から直前のstrokeを返す', () => {
  const strokes = [{ char: 'あ' }, { char: 'い' }] as never[];
  assert.equal(playbackStrokeAt(strokes, 0), undefined);
  assert.equal(playbackStrokeAt(strokes, 1)?.char, 'あ');
  assert.equal(playbackStrokeAt(strokes, 2)?.char, 'い');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback,
  clampPlaybackCursor,
  createPlaybackState,
  playbackCompletedInputs,
  playbackFingerPositionKeys,
  playbackStrokeDisplay,
  playbackStrokeAt,
  setPlaybackSpeed,
  stepPlayback,
} from '../src/playback.ts';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { LAYOUT_BY_ID, withRomaji } from '../src/layouts/index.ts';
import { kunrei } from '../src/romaji/kunrei.ts';

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

test('入力履歴は現在の入力単位を除き、複数ステップを一文字にまとめる', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ' },
    { inputIndex: 1, inputChar: 'が' },
    { inputIndex: 1, inputChar: 'が' },
    { inputIndex: 2, inputChar: 'ぬ' },
    { inputIndex: 3, inputChar: 'あ' },
    { inputIndex: 4, inputChar: 'あ' },
  ] as never[];

  assert.deepEqual(playbackCompletedInputs(strokes, 3), ['あ']);
  assert.deepEqual(playbackCompletedInputs(strokes, 4), ['あ', 'が']);
  assert.deepEqual(playbackCompletedInputs(strokes, 6), ['あ', 'が', 'ぬ', 'あ']);
});

test('ローマ字の入力履歴はかなごとの複数打鍵を重複させない', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = evaluate('なまえは', layout, buildGeometry('row-staggered'));

  assert.deepEqual(playbackCompletedInputs(trace.strokes, trace.strokes.length), ['な', 'ま', 'え']);
});

test('指位置表示はホームと押下キーを指ごとのキー枠に割り当てる', () => {
  const layout = LAYOUT_BY_ID.get('qwerty')!;
  const geometry = buildGeometry('row-staggered');
  const stroke = evaluate('a', layout, geometry).strokes[0];
  const positions = playbackFingerPositionKeys(stroke, geometry);

  assert.equal(positions.get('a'), 'LP');
  assert.equal(positions.get('s'), 'LR');
  assert.equal(positions.get('f'), 'LI');
  assert.equal(positions.get('j'), 'RI');
});

test('レイヤー再生はシフトと出力キーの刻印を現在の面から引く', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const trace = evaluate('ぬ', layout, buildGeometry('row-staggered'));
  const shift = playbackStrokeDisplay(layout, trace.strokes[0]);
  const output = playbackStrokeDisplay(layout, trace.strokes[1]);

  assert.equal(shift.character, undefined);
  assert.equal(shift.keyLabels.get('d'), '⇧');
  assert.equal(shift.keyLabels.get('q'), 'ぁ');
  assert.equal(shift.keyLabels.get('w'), 'ひ');
  assert.equal(output.character, 'ぬ');
  assert.equal(output.keyLabels.get('y'), 'ぬ');
  assert.equal(output.keyLabels.get('q'), 'ぁ');
  assert.equal(output.keyLabels.get('w'), 'ひ');
});

test('左右の同一レイヤーを畳み、反対側シフト由来の刻印も表示する', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const stroke = evaluate('あ', layout, buildGeometry('row-staggered')).strokes[0];
  const display = playbackStrokeDisplay(layout, stroke);

  assert.equal(display.keyLabels.get('d'), '⇧');
  assert.equal(display.keyLabels.get('j'), 'あ');
  assert.equal(display.keyLabels.get('k'), 'れ');
  assert.equal(display.keyLabels.get('l'), 'お');
});

test('薙刀式の濁音はシフトと出力かなを同じステップで表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const stroke = evaluate('が', layout, buildGeometry('row-staggered')).strokes[0];
  const display = playbackStrokeDisplay(layout, stroke);

  assert.equal(display.character, 'が');
  assert.equal(display.keyLabels.get('j'), '⇧');
  assert.equal(display.keyLabels.get('f'), 'が');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback,
  clampPlaybackCursor,
  createPlaybackState,
  playbackCompletedInputs,
  playbackFingerPositionKeys,
  playbackInputPreview,
  playbackPlannedKeys,
  playbackPlannedOrders,
  playbackArpeggioOrders,
  playbackRecentActionsPerSecond,
  playbackOrderLabel,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackRomajiPlan,
  playbackStrokeDisplay,
  playbackStrokeAt,
  playbackStrokeDurationMs,
  playbackHandKeyMotions,
  playbackSameFingerKeyMotions,
  playbackTrailKeys,
  playbackTrailOrders,
  setPlaybackSameFingerDelay,
  setPlaybackStepsPerSecond,
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
const emptyStrokes = (length: number) => Array.from({ length }, () => ({ presses: [] })) as never[];

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

test('経過時間でステップ毎秒に応じて進み、速度変更ではカーソルを動かさない', () => {
  const strokes = emptyStrokes(3);
  let state = playing();
  for (let i = 0; i < 7; i++) state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 0);
  state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 1);

  let fast = setPlaybackStepsPerSecond(playing(), 5);
  fast = advancePlayback(fast, 100, strokes);
  fast = advancePlayback(fast, 100, strokes);
  assert.equal(fast.cursor, 1);
  assert.equal(setPlaybackStepsPerSecond({ ...state, cursor: 2 }, 5).cursor, 2);
});

test('再生速度は固定候補に限らず任意のステップ毎秒を設定できる', () => {
  const strokes = emptyStrokes(3);
  let custom = setPlaybackStepsPerSecond(playing(), 3.2);
  assert.equal(custom.stepsPerSecond, 3.2);
  custom = advancePlayback(custom, 100, strokes);
  custom = advancePlayback(custom, 100, strokes);
  custom = advancePlayback(custom, 100, strokes);
  assert.equal(custom.cursor, 0);
  custom = advancePlayback(custom, 13, strokes);
  assert.equal(custom.cursor, 1);
});

test('同指ディレイは移動距離に応じてステップ間隔を延ばす', () => {
  const strokes = [
    { presses: [{ sfb: true, distance: 2 }] },
    { presses: [] },
  ] as never[];
  assert.equal(playbackStrokeDurationMs(strokes[0], 2), 500);
  assert.equal(playbackStrokeDurationMs(strokes[0], 2, true), 1000);

  let state = setPlaybackStepsPerSecond(setPlaybackSameFingerDelay(playing(), true), 2);
  for (let i = 0; i < 9; i++) state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 0);
  state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 1);
  for (let i = 0; i < 4; i++) state = advancePlayback(state, 100, strokes);
  state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 2);
  assert.ok(Math.abs(playbackRecentActionsPerSecond(strokes, 2, 2, true)! - (4 / 3)) < 1e-9);
});

test('同指連続のキー移動は直前のキーから現在のキーを返す', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 's' }] }] },
  ] as never[];
  assert.deepEqual(playbackSameFingerKeyMotions(strokes, 2), [{
    fromKey: 'a',
    toKeys: ['s'],
    finger: 'LP',
  }]);
});

test('片手連続のキー移動は直前の同じ手のキーから現在のキーを返す', () => {
  const sameHand = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(sameHand, 2), [{
    fromKey: 'a',
    toKeys: ['s'],
    finger: 'LR',
  }]);

  // 手が変われば移動ではない
  const crossHand = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'RI', keys: [{ id: 'j' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(crossHand, 2), []);

  // 同指連打は既定で除外し、includeSameFinger で拾える
  const sameFinger = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 'q' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(sameFinger, 2), []);
  assert.deepEqual(playbackHandKeyMotions(sameFinger, 2, true), [{
    fromKey: 'a',
    toKeys: ['q'],
    finger: 'LP',
  }]);

  // 開始直後は起点が無い
  assert.deepEqual(playbackHandKeyMotions(sameHand, 1), []);
  assert.deepEqual(playbackHandKeyMotions(sameHand, 0), []);
});

test('親指キーはアルペジオに含めない', () => {
  // スペース（親指）だけのステップは手の連続に参加しない
  const withThumb = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'RT', keys: [{ id: 'thumb-r' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(withThumb, 2), []);
  assert.deepEqual(playbackHandKeyMotions(withThumb, 3), []);
  assert.deepEqual([...playbackArpeggioOrders(withThumb, 3)], [['s', 1]]);

  // 親指を伴う同時押しでも、起点・終点には親指キーが混ざらない
  const shifted = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }, { finger: 'RT', keys: [{ id: 'thumb-r' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }, { finger: 'RT', keys: [{ id: 'thumb-r' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(shifted, 2), [{
    fromKey: 'a',
    toKeys: ['s'],
    finger: 'LR',
  }]);
  assert.deepEqual([...playbackArpeggioOrders(shifted, 2)], [['a', 1], ['s', 2]]);
});

test('左右同時押しが混ざっても片手の連続は途切れない', () => {
  // 2打目が左右同時。左手の連続は a → s → d と続く
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }, { finger: 'RI', keys: [{ id: 'j' }] }] },
    { presses: [{ finger: 'LM', keys: [{ id: 'd' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(strokes, 3), [{
    fromKey: 's',
    toKeys: ['d'],
    finger: 'LM',
  }]);
  assert.deepEqual([...playbackArpeggioOrders(strokes, 3)], [['a', 1], ['s', 2], ['d', 3]]);

  // 同時押しのステップ自体では、続いている手それぞれに移動が出る
  const bothContinue = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }, { finger: 'RP', keys: [{ id: 'k' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }, { finger: 'RI', keys: [{ id: 'j' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(bothContinue, 2), [
    { fromKey: 'a', toKeys: ['s'], finger: 'LR' },
    { fromKey: 'k', toKeys: ['j'], finger: 'RI' },
  ]);
});

test('片手連続の打鍵へ順番を付け、同指連打を除外できる', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 's' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 'd' }] }] },
  ] as never[];
  assert.deepEqual([...playbackArpeggioOrders(strokes, 3)], [['d', 1]]);
  assert.deepEqual([...playbackArpeggioOrders(strokes, 3, true)], [['a', 1], ['s', 2], ['d', 3]]);
});

test('末尾では停止し、先頭へループしない', () => {
  const strokes = emptyStrokes(2);
  const ended = advancePlayback(playing(2), 800, strokes);
  assert.equal(ended.cursor, 2);
  assert.equal(ended.playing, false);
  assert.equal(advancePlayback(ended, 800, strokes).cursor, 2);
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

test('TK音直入力法のコンボは入力単位全体を現在文字と履歴に表示する', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('oonishi-custom-combo')!, kunrei());
  const trace = evaluate('わがはいねこ', layout, buildGeometry('row-staggered'));

  assert.equal(trace.strokes[4].inputChar, 'は');
  assert.equal(trace.strokes[5].inputChar, 'はい');
  assert.deepEqual(playbackInputPreview(trace.strokes, 5, 5), [
    { text: 'わ', kind: 'completed' },
    { text: 'が', kind: 'completed' },
    { text: 'はい', kind: 'current' },
    { text: 'ね', kind: 'planned' },
    { text: 'こ', kind: 'planned' },
  ]);
  assert.deepEqual(playbackInputPreview(trace.strokes, 6, 5), [
    { text: 'わ', kind: 'completed' },
    { text: 'が', kind: 'completed' },
    { text: 'はい', kind: 'current' },
    { text: 'ね', kind: 'planned' },
    { text: 'こ', kind: 'planned' },
  ]);
  assert.deepEqual(playbackCompletedInputs(trace.strokes, trace.strokes.length), ['わ', 'が', 'はい', 'ね']);
});

test('入力プレビューは現在の入力を下線対象にし、先読みを後ろへ追加する', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = evaluate('きょうあ', layout, buildGeometry('row-staggered'));

  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 1), [
    { text: 'きょ', kind: 'current' },
  ]);
  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 2), [
    { text: 'きょ', kind: 'current' },
    { text: 'う', kind: 'planned' },
  ]);
  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 3), [
    { text: 'きょ', kind: 'current' },
    { text: 'う', kind: 'planned' },
    { text: 'あ', kind: 'planned' },
  ]);
});

test('ローマ字の現在入力単位に予定綴りと打鍵済み接頭辞を表示できる', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = evaluate('きょ', layout, buildGeometry('row-staggered'));

  assert.deepEqual(playbackRomajiPlan(trace.strokes, 2), { planned: 'kyo', typed: 'ky' });
});

test('予定ローマ字は未入力キーを順番付きの予定キーとして返す', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = evaluate('け', layout, buildGeometry('row-staggered'));

  assert.equal(playbackRomajiPlannedKeys(trace.strokes, 1).get('e'), 1);
  assert.equal(playbackRomajiPlannedOrders(trace.strokes, 1).get('e'), 1);
  assert.equal(playbackRomajiPlannedKeys(trace.strokes, 1).has('k'), false);
  assert.equal(playbackOrderLabel(1), '①');
});

test('予定キーは先読み範囲の近いキーほど緑を濃く表示する', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = evaluate('きょう', layout, buildGeometry('row-staggered'));
  const planned = playbackPlannedKeys(trace.strokes, 0, 3);

  assert.equal(planned.get('k'), 1);
  assert.equal(planned.get('y'), 2 / 3);
  assert.equal(planned.get('o'), 1 / 3);
  assert.equal(planned.has('u'), false);

  const orders = playbackPlannedOrders(trace.strokes, 0, 3);
  assert.equal(orders.get('k'), 1);
  assert.equal(orders.get('y'), 2);
  assert.equal(orders.get('o'), 3);
});

test('押下履歴はtauステップ内で新しいほど濃くなる', () => {
  const strokes = [
    { presses: [{ keys: [{ id: 'a' }] }] },
    { presses: [{ keys: [{ id: 's' }] }] },
    { presses: [{ keys: [{ id: 'd' }] }] },
    { presses: [{ keys: [{ id: 'f' }] }] },
  ] as never[];
  const trail = playbackTrailKeys(strokes, 4, 3);

  assert.equal(trail.has('a'), false);
  assert.equal(trail.get('s'), 1 / 3);
  assert.equal(trail.get('d'), 2 / 3);
  assert.equal(trail.get('f'), 1);

  const orders = playbackTrailOrders(strokes, 4, 3);
  assert.equal(orders.has('a'), false);
  assert.equal(orders.get('s'), 3);
  assert.equal(orders.get('d'), 2);
  assert.equal(orders.get('f'), 1);
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

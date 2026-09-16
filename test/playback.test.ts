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
  playbackChainOrders,
  playbackRecentActionsPerSecond,
  playbackRecentKanaPerSecond,
  playbackRateChartData,
  playbackOrderLabel,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackRomajiPlan,
  playbackStrokeDisplay,
  playbackStrokeAt,
  playbackStrokeDurationMs,
  playbackHandKeyMotions,
  playbackSameFingerKeyMotions,
  playbackRepeatedKeys,
  playbackTrailKeys,
  playbackTrailOrders,
  setPlaybackCalibration,
  setPlaybackSameFingerDelay,
  setPlaybackSpeedMultiplier,
  setPlaybackStepsPerSecond,
  stepPlayback,
} from '../src/playback.ts';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { LAYOUT_BY_ID, withRomaji } from '../src/layouts/index.ts';
import { kunrei } from '../src/romaji/kunrei.ts';
import {
  actionsPerSecondFromIntervals,
  calibrationActionPair,
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  calibrationSameHandPairs,
  fallbackFingerSpeedFromSamples,
  fingerSpeedFromSamples,
  loadPlaybackCalibration,
  PLAYBACK_CALIBRATION_STORAGE_KEY,
  savePlaybackCalibration,
  sameHandFingerPairKey,
} from '../src/playback-calibration.ts';

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

test('再生倍率は基準速度とキャリブレーション後の速度を同じ比率で変える', () => {
  const stroke = { presses: [] } as never;
  assert.equal(playbackStrokeDurationMs(stroke, 2, false, undefined, undefined, 2), 250);
  const calibration = {
    actionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  assert.equal(playbackStrokeDurationMs(stroke, 1, false, calibration, undefined, 2), 125);
  const state = setPlaybackSpeedMultiplier(createPlaybackState(), 1.5);
  assert.equal(state.speedMultiplier, 1.5);
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

test('直近のかな毎秒は入力単位のかな数を同じ実効時間で割る', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ', presses: [] },
    { inputIndex: 1, inputChar: 'はい', presses: [] },
    { inputIndex: 1, inputChar: 'はい', presses: [] },
  ] as never[];
  assert.equal(playbackRecentKanaPerSecond(strokes, 3, 2), 2);
  assert.equal(playbackRecentKanaPerSecond(strokes, 2, 2), 1);
});

test('速度グラフ用データはカーソルごとの集計入力と速度を返す', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ', presses: [] },
    { inputIndex: 1, inputChar: 'はい', presses: [] },
    { inputIndex: 1, inputChar: 'はい', presses: [] },
  ] as never[];
  const points = playbackRateChartData(strokes, 2);
  assert.equal(points.length, 4);
  assert.equal(points[0].inputText, '');
  assert.equal(points[3].inputText, 'あはい');
  assert.equal(points[3].kanaPerSecond, 2);
  assert.equal(points[3].actionsPerSecond, 2);
});

test('個人キャリブレーションは通常打鍵と指移動を別々の速度として再生へ反映する', () => {
  const calibration = {
    actionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    fingerSpeedUnitsPerSecond: { LI: 8 },
    fallbackFingerSpeedUnitsPerSecond: 12,
    measuredAt: 1,
  };
  const stroke = { presses: [{ finger: 'LI', sfb: true, distance: 3 }] } as never;
  assert.equal(playbackStrokeDurationMs(stroke, 1, false, calibration), 250);
  assert.equal(playbackStrokeDurationMs(stroke, 1, true, calibration), 375);
  const state = setPlaybackCalibration(createPlaybackState(), calibration);
  assert.equal(state.calibration?.fingerSpeedUnitsPerSecond.LI, 8);
  const fallbackStroke = { presses: [{ finger: 'RP', sfb: true, distance: 3 }] } as never;
  assert.equal(playbackStrokeDurationMs(fallbackStroke, 1, true, calibration), 250);

  const sameHandPrevious = { presses: [{ finger: 'LM' }] } as never;
  const sameHandStroke = { presses: [{ finger: 'LI', sfb: false, distance: 100 }] } as never;
  assert.equal(playbackStrokeDurationMs(sameHandStroke, 1, false, calibration, sameHandPrevious), 1000 / 3);

  const sameHandFallbackPrevious = { presses: [{ finger: 'LP' }] } as never;
  assert.equal(playbackStrokeDurationMs(sameHandStroke, 1, false, calibration, sameHandFallbackPrevious), 500);

  const crossHandPrevious = { presses: [{ finger: 'RI' }] } as never;
  assert.equal(playbackStrokeDurationMs(sameHandStroke, 1, true, calibration, crossHandPrevious), 250);
});

test('左右交互の打鍵は通常速度の測定値を使う', () => {
  const calibration = {
    actionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  const previous = { presses: [{ finger: 'LI' }] } as never;
  const current = { presses: [{ finger: 'RI' }] } as never;
  assert.equal(playbackStrokeDurationMs(current, 1, false, calibration, previous), 200);
});

test('キャリブレーションの中央値は外れ値を抑えて速度を求める', () => {
  assert.equal(actionsPerSecondFromIntervals([250, 250, 1000, 250]), 4);
  const speeds = fingerSpeedFromSamples([
    { finger: 'LI', distance: 2, durationMs: 250 },
    { finger: 'LI', distance: 2, durationMs: 250 },
    { finger: 'LI', distance: 2, durationMs: 1000 },
    { finger: 'RI', distance: 2, durationMs: 500 },
  ]);
  assert.equal(speeds.get('LI'), 8);
  assert.equal(speeds.get('RI'), 4);
  assert.equal(fallbackFingerSpeedFromSamples([
    { finger: 'LI', distance: 2, durationMs: 250 },
    { finger: 'LI', distance: 2, durationMs: 250 },
    { finger: 'RI', distance: 2, durationMs: 500 },
  ]), 8);
});

test('キャリブレーションの保存値は壊れたJSONを無視する', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
  const calibration = {
    actionsPerSecond: 3.5,
    sameHandDifferentFingerActionsPerSecond: 2.5,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LP:LR': 2 },
    fingerSpeedUnitsPerSecond: { LI: 12 },
    fallbackFingerSpeedUnitsPerSecond: 12,
    measuredAt: 4,
  };
  savePlaybackCalibration(storage, calibration);
  assert.deepEqual(loadPlaybackCalibration(storage), calibration);
  const oldV2 = { ...calibration } as Record<string, unknown>;
  delete oldV2.sameHandDifferentFingerActionsPerSecond;
  delete oldV2.sameHandDifferentFingerActionsPerSecondByPair;
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, JSON.stringify(oldV2));
  assert.equal(loadPlaybackCalibration(storage)?.sameHandDifferentFingerActionsPerSecond, calibration.actionsPerSecond);
  assert.deepEqual(loadPlaybackCalibration(storage)?.sameHandDifferentFingerActionsPerSecondByPair, {});
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, '{broken');
  assert.equal(loadPlaybackCalibration(storage), undefined);
  data.clear();
  data.set('keydist.playback-calibration.v1', JSON.stringify(calibration));
  assert.equal(loadPlaybackCalibration(storage), undefined);
});

test('キャリブレーションの指ペアはホーム段と下段で揃える', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationKeyPairs(geometry);
  assert.equal(pairs.length, 8);
  assert.deepEqual(calibrationActionPair(geometry), ['f', 'j']);
  assert.equal(pairs.find((pair) => pair.finger === 'LI')?.fromKey, 'f');
  assert.equal(pairs.find((pair) => pair.finger === 'LI')?.toKey, 'b');
  assert.equal(pairs.every((pair) => geometry.keys.get(pair.toKey)?.row === 3), true);
});

test('キャリブレーションは選択配列の文字と句読点だけを候補にする', () => {
  const geometry = buildGeometry('row-staggered');
  const legends = new Map([...geometry.keys.values()].map((key) => [key.id, key.id]));
  const eligibleKeyIds = calibrationEligibleKeyIds(geometry, legends);
  const pairs = calibrationKeyPairs(geometry, eligibleKeyIds);
  const sameHandPairs = calibrationSameHandPairs(geometry, eligibleKeyIds);

  assert.equal(pairs.length, 8);
  assert.equal(eligibleKeyIds.has('1'), false);
  assert.equal(eligibleKeyIds.has(';'), true);
  assert.equal(eligibleKeyIds.has(','), true);
  assert.equal(eligibleKeyIds.has('.'), true);
  assert.equal(eligibleKeyIds.has('/'), true);
  assert.equal(pairs.find((pair) => pair.finger === 'RP')?.toKey, '/');
  assert.equal(pairs.every((pair) => eligibleKeyIds.has(pair.fromKey) && eligibleKeyIds.has(pair.toKey)), true);
  assert.deepEqual(sameHandPairs.slice(6), [['j', 'k'], ['j', 'l'], ['j', ';'], ['k', 'l'], ['k', ';'], ['l', ';']]);
});

test('同手の別指測定は隣接以外も含む全組合せのホームキーを使う', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationSameHandPairs(geometry);
  assert.equal(pairs.length, 12);
  assert.deepEqual(pairs.slice(0, 6), [['a', 's'], ['a', 'd'], ['a', 'f'], ['s', 'd'], ['s', 'f'], ['d', 'f']]);
  assert.deepEqual(pairs.slice(6), [['j', 'k'], ['j', 'l'], ['j', ';'], ['k', 'l'], ['k', ';'], ['l', ';']]);
});

test('同手別指の組キーは指順を正規化し、別手や親指を除外する', () => {
  assert.equal(sameHandFingerPairKey('LI', 'LM'), 'LM:LI');
  assert.equal(sameHandFingerPairKey('RM', 'RP'), 'RM:RP');
  assert.equal(sameHandFingerPairKey('LI', 'RI'), undefined);
  assert.equal(sameHandFingerPairKey('LT', 'LI'), undefined);
});

test('キャリブレーションはKeyboardEventの刻印と物理コードを受け付ける', () => {
  assert.equal(calibrationKeyMatches({ key: 'A', code: 'KeyA' } as KeyboardEvent, 'a'), true);
  assert.equal(calibrationKeyMatches({ key: ';', code: 'Semicolon' } as KeyboardEvent, ';'), true);
  assert.equal(calibrationKeyMatches({ key: 'u', code: 'KeyF' } as KeyboardEvent, 'f', 'u'), true);
  assert.equal(calibrationKeyMatches({ key: 'x', code: 'KeyX' } as KeyboardEvent, 'a'), false);
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

test('連打キーは直前と今の両方で押されているキーIDを返す', () => {
  const repeated = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LM', keys: [{ id: 'a' }] }] },
  ] as never[];
  assert.deepEqual([...playbackRepeatedKeys(repeated, 2)], ['a']);

  // 別キーなら連打ではない
  const notRepeated = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LM', keys: [{ id: 's' }] }] },
  ] as never[];
  assert.deepEqual([...playbackRepeatedKeys(notRepeated, 2)], []);

  // 開始直後（直前のステップが無い）は連打として扱わない
  assert.deepEqual([...playbackRepeatedKeys(repeated, 1)], []);
  assert.deepEqual([...playbackRepeatedKeys(repeated, 0)], []);

  // 同時押しの一部だけが連打の場合、その分だけ拾う
  const partial = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }, { finger: 'RI', keys: [{ id: 'j' }] }] },
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }, { finger: 'RM', keys: [{ id: 'k' }] }] },
  ] as never[];
  assert.deepEqual([...playbackRepeatedKeys(partial, 2)], ['a']);

  // 親指キーは連打の対象から除外する（シフトがほぼ毎ステップ入るため）
  const thumb = [
    { presses: [{ finger: 'LT', keys: [{ id: 'space' }] }] },
    { presses: [{ finger: 'RT', keys: [{ id: 'space' }] }] },
  ] as never[];
  assert.deepEqual([...playbackRepeatedKeys(thumb, 2)], []);
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

test('親指キーはチェーンに含めない', () => {
  // スペース（親指）だけのステップは手の連続に参加しない
  const withThumb = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'RT', keys: [{ id: 'thumb-r' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's' }] }] },
  ] as never[];
  assert.deepEqual(playbackHandKeyMotions(withThumb, 2), []);
  assert.deepEqual(playbackHandKeyMotions(withThumb, 3), []);
  assert.deepEqual([...playbackChainOrders(withThumb, 3)], [['s', 1]]);

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
  assert.deepEqual([...playbackChainOrders(shifted, 2)], [['a', 1], ['s', 2]]);
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
  assert.deepEqual([...playbackChainOrders(strokes, 3)], [['a', 1], ['s', 2], ['d', 3]]);

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

test('チェーンの番号は区間の先の打鍵も先読みして出す', () => {
  // 右手で . → k → l と続き、その後に左手へ渡る
  const strokes = [
    { presses: [{ finger: 'RR', keys: [{ id: '.' }] }] },
    { presses: [{ finger: 'RM', keys: [{ id: 'k' }] }] },
    { presses: [{ finger: 'RI', keys: [{ id: 'l' }] }] },
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
  ] as never[];

  // 区間の最初の打鍵の時点で、区間全体の番号が出そろう
  const whole = [['.', 1], ['k', 2], ['l', 3]];
  assert.deepEqual([...playbackChainOrders(strokes, 1)], whole);
  assert.deepEqual([...playbackChainOrders(strokes, 2)], whole);
  assert.deepEqual([...playbackChainOrders(strokes, 3)], whole);
  // 手が変われば次の区間へ
  assert.deepEqual([...playbackChainOrders(strokes, 4)], [['a', 1]]);

  // limit は区間の先頭から数える
  assert.deepEqual([...playbackChainOrders(strokes, 1, false, 2)], [['.', 1], ['k', 2]]);
});

test('チェーンの中で同じキーを何度も踏む時は次に踏む番号を出す', () => {
  // 右手で j → k → l → j と続き、j はチェーンの1打目と4打目に現れる
  const strokes = [
    { presses: [{ finger: 'RI', keys: [{ id: 'j' }] }] },
    { presses: [{ finger: 'RM', keys: [{ id: 'k' }] }] },
    { presses: [{ finger: 'RR', keys: [{ id: 'l' }] }] },
    { presses: [{ finger: 'RI', keys: [{ id: 'j' }] }] },
  ] as never[];

  // 1打目にいる間は 1
  assert.equal(playbackChainOrders(strokes, 1).get('j'), 1);
  // 1打目を通り過ぎたら、次に踏む 4 を出す
  assert.equal(playbackChainOrders(strokes, 2).get('j'), 4);
  assert.equal(playbackChainOrders(strokes, 3).get('j'), 4);
  assert.equal(playbackChainOrders(strokes, 4).get('j'), 4);
  // 一度しか踏まないキーは位置によらず同じ
  for (let cursor = 1; cursor <= 4; cursor++) {
    assert.equal(playbackChainOrders(strokes, cursor).get('k'), 2);
  }
});

test('レイヤーキーをチェーンに含めるか選べる', () => {
  // j が濁音レイヤーのトリガーであり、出力キーとしても押されている
  const strokes = [
    { presses: [{ finger: 'RP', keys: [{ id: ';' }] }], triggerKeys: [] },
    {
      presses: [{ finger: 'RI', keys: [{ id: 'j' }] }, { finger: 'LM', keys: [{ id: 'd' }] }],
      triggerKeys: ['j'],
    },
  ] as never[];

  // 既定は含める。右手は ; → j と続く
  assert.deepEqual([...playbackChainOrders(strokes, 2)], [[';', 1], ['j', 2], ['d', 1]]);
  assert.deepEqual(playbackHandKeyMotions(strokes, 2), [{
    fromKey: ';',
    toKeys: ['j'],
    finger: 'RI',
  }]);

  // 含めない時、トリガーの j は連なりから落ち、右手の連続はそこで終わる
  assert.deepEqual([...playbackChainOrders(strokes, 2, false, 8, false)], [['d', 1]]);
  assert.deepEqual(playbackHandKeyMotions(strokes, 2, false, false), []);
});

test('親指キーはレイヤーキーのオプションに関係なく常に除外される', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }], triggerKeys: [] },
    {
      presses: [{ finger: 'LR', keys: [{ id: 's' }] }, { finger: 'RT', keys: [{ id: 'thumb-r' }] }],
      triggerKeys: ['thumb-r'],
    },
  ] as never[];
  for (const includeLayerKeys of [true, false]) {
    assert.deepEqual(
      [...playbackChainOrders(strokes, 2, false, 8, includeLayerKeys)],
      [['a', 1], ['s', 2]],
    );
    assert.deepEqual(playbackHandKeyMotions(strokes, 2, false, includeLayerKeys), [{
      fromKey: 'a',
      toKeys: ['s'],
      finger: 'LR',
    }]);
  }
});

test('片手連続の打鍵へ順番を付け、同指連打を除外できる', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 's' }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 'd' }] }] },
  ] as never[];
  assert.deepEqual([...playbackChainOrders(strokes, 3)], [['d', 1]]);
  assert.deepEqual([...playbackChainOrders(strokes, 3, true)], [['a', 1], ['s', 2], ['d', 3]]);
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

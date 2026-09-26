import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback as advancePlaybackAnalysis,
  clampPlaybackCursor,
  createPlaybackState,
  playbackCompletedInputs,
  playbackFingerPositionKeys,
  playbackInputPreview,
  playbackPlannedKeys,
  playbackPlannedOrders,
  playbackRecentActionsPerSecond as playbackRecentActionsPerSecondAnalysis,
  playbackRecentKanaPerSecond as playbackRecentKanaPerSecondAnalysis,
  playbackRateChartData as playbackRateChartDataAnalysis,
  playbackOrderLabel,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackRomajiPlan,
  playbackStrokeDisplay,
  playbackStrokeAt,
  playbackStrokeDurationMs,
  playbackSameFingerKeyMotions,
  playbackCursorForEquivalentInputPosition,
  reconcilePlaybackStateAfterAnalysisRefresh,
  playbackTrailKeys,
  playbackTrailOrders,
  setPlaybackCalibration,
  setPlaybackSameFingerDelay,
  setPlaybackSpeedMultiplier,
  setPlaybackStepsPerSecond,
  stepPlayback,
} from './playback.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import {
  faceFromEntries,
  fromFaces,
  LAYOUT_BY_ID,
  withRomaji,
  withThumbShiftAlternatives,
} from '#input/layouts/index.ts';
import { kunrei } from '#input/romaji/kunrei.ts';
import { analyzeStrokeStructure } from '../structure/aggregate.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from '../structure/chain.ts';
import {
  actionsPerSecondFromIntervals,
  clearPlaybackCalibration,
  calibrationActionPair,
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  calibrationDirectedSameHandPairs,
  calibrationSameHandPairs,
  fallbackFingerSpeedFromSamples,
  fingerSpeedFromSamples,
  handDirection,
  loadPlaybackCalibration,
  PLAYBACK_CALIBRATION_STORAGE_KEY,
  savePlaybackCalibration,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
} from './calibration.ts';

const playing = (cursor = 0) => ({
  ...createPlaybackState(),
  cursor,
  playing: true,
});
const emptyStrokes = (length: number) => Array.from({ length }, () => ({ presses: [] })) as never[];
const timingAnalysis = (
  strokes: readonly any[],
  chainInterpretation?: ChainInterpretation,
) => {
  const normalized = strokes.map((source, index) => {
    const presses = (source.presses ?? []).map((raw: any) => {
      const keys = (raw.keys ?? []).map((key: any, keyIndex: number) => ({
        id: key.id ?? `k-${index}-${keyIndex}`,
        finger: raw.finger ?? 'LI',
        x: key.x ?? 0,
        y: key.y ?? key.row ?? 0,
        row: key.row ?? 0,
        col: key.col ?? keyIndex,
      }));
      return {
        finger: raw.finger ?? 'LI',
        keys,
        target: raw.target ?? {
          x: keys[0]?.x ?? 0,
          y: keys[0]?.y ?? 0,
        },
        gap: raw.gap ?? 1,
        distance: raw.distance ?? 0,
        sfb: raw.sfb ?? false,
      };
    });
    return {
      index,
      char: source.char ?? String(index),
      inputChar: source.inputChar ?? source.char ?? String(index),
      inputIndex: source.inputIndex ?? index,
      aggregationGroupId: source.aggregationGroupId ?? 'single',
      inputRole: source.inputRole ?? 'layer',
      classifications: source.classifications ?? [],
      triggerKeys: source.triggerKeys ?? [],
      pairedTriggerKeys: source.pairedTriggerKeys ?? [],
      participations: presses.map((press: any) => ({
        hand: press.finger.startsWith('L') ? 'left' : 'right',
        finger: press.finger,
        keys: press.keys,
        roles: ['output'],
      })),
      presses,
      distance: source.distance ?? 0,
      positions: source.positions ?? {},
    };
  });
  return analyzeStrokeStructure(normalized as never[], chainInterpretation);
};

const advancePlayback = (
  state: ReturnType<typeof createPlaybackState>,
  elapsedMs: number,
  strokes: readonly never[],
) => advancePlaybackAnalysis(state, elapsedMs, timingAnalysis(strokes));

const playbackRecentActionsPerSecond = (
  strokes: readonly never[],
  cursor: number,
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRecentActionsPerSecondAnalysis>[5],
  speedMultiplier?: number,
) => playbackRecentActionsPerSecondAnalysis(
  timingAnalysis(strokes),
  cursor,
  stepsPerSecond,
  sameFingerDelay,
  limit,
  calibration,
  speedMultiplier,
);

const playbackRecentKanaPerSecond = (
  strokes: readonly never[],
  cursor: number,
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRecentKanaPerSecondAnalysis>[5],
  speedMultiplier?: number,
) => playbackRecentKanaPerSecondAnalysis(
  timingAnalysis(strokes),
  cursor,
  stepsPerSecond,
  sameFingerDelay,
  limit,
  calibration,
  speedMultiplier,
);

const playbackRateChartData = (
  strokes: readonly never[],
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRateChartDataAnalysis>[4],
  speedMultiplier?: number,
) => playbackRateChartDataAnalysis(
  timingAnalysis(strokes),
  stepsPerSecond,
  sameFingerDelay,
  limit,
  calibration,
  speedMultiplier,
);

test('配列切替ではinputIndexと入力内の進捗から対応cursorを求める', () => {
  const previous = [
    { inputIndex: 0 },
    { inputIndex: 1 },
    { inputIndex: 1 },
    { inputIndex: 2 },
  ];
  const next = [
    { inputIndex: 0 },
    { inputIndex: 1 },
    { inputIndex: 1 },
    { inputIndex: 1 },
    { inputIndex: 2 },
  ];

  assert.equal(playbackCursorForEquivalentInputPosition(previous, next, 0), 0);
  assert.equal(playbackCursorForEquivalentInputPosition(previous, next, 1), 1);
  assert.equal(playbackCursorForEquivalentInputPosition(previous, next, 2), 2);
  assert.equal(playbackCursorForEquivalentInputPosition(previous, next, 4), 5);
});

test('配列切替先で現在inputIndexが打てない場合は次の入力位置へ進める', () => {
  const previous = [{ inputIndex: 0 }, { inputIndex: 1 }, { inputIndex: 2 }];
  const next = [{ inputIndex: 0 }, { inputIndex: 2 }];

  assert.equal(playbackCursorForEquivalentInputPosition(previous, next, 1), 1);
});

test('構造解析の再生成ではcursor/playingとStroke内進捗率を維持する', () => {
  const calibration = {
    actionsPerSecond: 4,
    actionsPerSecondByDirection: { 'L→R': 8 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  const previous = timingAnalysis([
    { presses: [{ finger: 'LI' }] },
    { presses: [{ finger: 'RI' }] },
  ]);
  const next = timingAnalysis([
    { presses: [{ finger: 'LI' }] },
    { presses: [{ finger: 'LM' }] },
  ]);
  const state = {
    ...createPlaybackState(4, false, calibration),
    cursor: 1,
    playing: true,
    elapsedMs: 62.5,
  };

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(
    state,
    state,
    previous,
    next,
  );

  assert.equal(refreshed.cursor, 1);
  assert.equal(refreshed.playing, true);
  assert.equal(refreshed.elapsedMs, 250);
});

test('配列切替では位置だけ引き継ぎTiming設定は新配列へ切り替える', () => {
  const previous = timingAnalysis([
    { presses: [] },
    { presses: [] },
  ]);
  const next = timingAnalysis([
    { presses: [] },
    { presses: [] },
  ]);
  const previousState = {
    ...createPlaybackState(4, false, undefined, 1),
    cursor: 1,
    playing: true,
    elapsedMs: 125,
  };
  const nextBaseState = createPlaybackState(8, true, undefined, 2);

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(
    previousState,
    nextBaseState,
    previous,
    next,
  );

  assert.equal(refreshed.cursor, 1);
  assert.equal(refreshed.playing, true);
  assert.equal(refreshed.stepsPerSecond, 8);
  assert.equal(refreshed.sameFingerDelay, true);
  assert.equal(refreshed.speedMultiplier, 2);
  assert.equal(refreshed.elapsedMs, 31.25);
});

test('構造解析の再生成後にcursorが末尾なら再生を停止する', () => {
  const previous = timingAnalysis([
    { presses: [{ finger: 'LI' }] },
    { presses: [{ finger: 'LM' }] },
  ]);
  const next = timingAnalysis([
    { presses: [{ finger: 'LI' }] },
  ]);
  const state = {
    ...createPlaybackState(),
    cursor: 2,
    playing: true,
    elapsedMs: 123,
  };

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(
    state,
    state,
    previous,
    next,
  );

  assert.equal(refreshed.cursor, 1);
  assert.equal(refreshed.playing, false);
  assert.equal(refreshed.elapsedMs, 0);
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
  assert.equal(playbackStrokeDurationMs(strokes[0], 2, false), 500);
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

test('速度の集計窓は数値表示とグラフで同じ直近Stroke数を使う', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ', presses: [] },
    { inputIndex: 1, inputChar: 'い', presses: [] },
    { inputIndex: 2, inputChar: 'う', presses: [] },
    { inputIndex: 3, inputChar: 'え', presses: [] },
  ] as never[];

  assert.equal(playbackRecentActionsPerSecond(strokes, 4, 2, true, 2), 2);
  assert.equal(playbackRecentKanaPerSecond(strokes, 4, 2, true, 2), 2);
  const points = playbackRateChartData(strokes, 2, true, 2);
  assert.equal(points[4].inputText, 'うえ');
  assert.equal(points[4].actionsPerSecond, 2);
  assert.equal(points[4].kanaPerSecond, 2);

  // 入力長より大きな窓でも、存在する完了Strokeだけを集計する。
  assert.equal(playbackRateChartData(strokes, 2, true, 50)[4].inputText, 'あいうえ');
});

test('EWMAは確定Timingの経過時間を半減期として使う', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ', presses: [] },
    { inputIndex: 1, inputChar: 'い', presses: [] },
  ] as never[];
  const analysis = timingAnalysis(strokes);
  const schedule = [
    { strokeIndex: 0, startMs: 0, endMs: 500 },
    { strokeIndex: 1, startMs: 500, endMs: 1500 },
  ];

  const actions = playbackRecentActionsPerSecondAnalysis(
    analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  // 1打目は2/s。そこから1秒経過で寄与が1/2になり、
  // 2打目の瞬時値1/sが残り1/2を占めるため1.5/s。
  assert.ok(actions !== undefined);
  assert.ok(Math.abs(actions - 1.5) < 1e-9);

  const kanaAtFirstStroke = playbackRecentKanaPerSecondAnalysis(
    analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  const actionsAtFirstStroke = playbackRecentActionsPerSecondAnalysis(
    analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  assert.equal(kanaAtFirstStroke, actionsAtFirstStroke);

  const kana = playbackRecentKanaPerSecondAnalysis(
    analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  assert.ok(kana !== undefined);
  // 1 Stroke = 1かなならinstantaneous系列が同じなのでEWMAも一致する。
  assert.ok(Math.abs(kana - actions) < 1e-9);

  const points = playbackRateChartDataAnalysis(
    analysis, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  assert.ok(Math.abs(points[2].actionsPerSecond! - actions) < 1e-9);
  assert.ok(Math.abs(points[2].kanaPerSecond! - kana) < 1e-9);
});

test('EWMAのかな速度は入力単位の完了時だけ文字数を加える', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'きょ', presses: [] },
    { inputIndex: 0, inputChar: 'きょ', presses: [] },
  ] as never[];
  const analysis = timingAnalysis(strokes);
  const schedule = [
    { strokeIndex: 0, startMs: 0, endMs: 500 },
    { strokeIndex: 1, startMs: 500, endMs: 1000 },
  ];

  assert.equal(
    playbackRecentKanaPerSecondAnalysis(
      analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
    ),
    undefined,
  );
  const completed = playbackRecentKanaPerSecondAnalysis(
    analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1,
  );
  assert.ok(completed !== undefined && completed > 0);
});

test('速度グラフのChain帯はAnalysis Chain所属を直接使う', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a', x: 1, y: 2, row: 2 }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 'q', x: 1, y: 1, row: 1 }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's', x: 2, y: 2, row: 2 }] }] },
  ] as never[];
  const policy = { ...DEFAULT_CHAIN_INTERPRETATION, breakOnSameFinger: false };
  const analysis = timingAnalysis(strokes, policy);
  const points = playbackRateChartDataAnalysis(analysis, 2);

  assert.deepEqual(
    points.slice(1).map((point) => point.chain),
    analysis.strokes.map((_, strokeIndex) =>
      analysis.chains.some((chain) =>
        strokeIndex >= chain.startStrokeIndex && strokeIndex < chain.endStrokeIndex)),
  );
});

test('速度グラフは適用済みChainInterpretationのAnalysis Chain所属に従う', () => {
  const strokes = [
    { presses: [{ finger: 'LP', keys: [{ id: 'a', x: 1, y: 2, row: 2 }] }] },
    { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 'q', x: 1, y: 1, row: 1 }] }] },
    { presses: [{ finger: 'LR', keys: [{ id: 's', x: 2, y: 2, row: 2 }] }] },
  ] as never[];

  const analysis = timingAnalysis(strokes, {
    ...DEFAULT_CHAIN_INTERPRETATION,
    breakOnSameFinger: false,
  });
  assert.equal(
    analysis.chains.some((chain) =>
      1 >= chain.startStrokeIndex && 1 < chain.endStrokeIndex),
    true,
  );
  assert.equal(playbackRateChartDataAnalysis(analysis, 2)[2].chain, true);
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

test('通常再生でも方向別Transition Calibrationを使う', () => {
  assert.equal(handDirection('LI', 'RI'), 'L→R');
  assert.equal(handDirection('RI', 'LI'), 'R→L');
  assert.equal(sameHandDirectedFingerPairKey('LM', 'LI'), 'LM>LI');
  const calibration = {
    actionsPerSecond: 5,
    actionsPerSecondByDirection: { 'L→R': 8, 'R→L': 7 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 6 },
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  const leftToRight = { presses: [{ finger: 'RI' }] } as never;
  const previous = { presses: [{ finger: 'LI' }] } as never;
  assert.equal(playbackStrokeDurationMs(leftToRight, 1, false, calibration, previous), 125);
  const sameHand = { presses: [{ finger: 'LI' }] } as never;
  const samePrevious = { presses: [{ finger: 'LM' }] } as never;
  assert.equal(playbackStrokeDurationMs(sameHand, 1, false, calibration, samePrevious), 1000 / 6);
});

test('方向別Transition CalibrationはArpeggio設定に依存せず再生へ反映する', () => {
  const calibration = {
    actionsPerSecond: 5,
    actionsPerSecondByDirection: { 'L→R': 20 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  const strokes = [
    { presses: [{ finger: 'LI' }] },
    { presses: [{ finger: 'RI' }] },
  ] as never[];
  const state = advancePlayback({
    ...createPlaybackState(5, false, calibration),
    cursor: 1,
    playing: true,
  }, 100, strokes);
  assert.equal(state.cursor, 2);
  assert.equal(state.elapsedMs, 0);
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
    removeItem: (key: string) => { data.delete(key); },
  };
  const calibration = {
    actionsPerSecond: 40,
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
  data.clear();
  data.set('keydist.playback-calibration.v2', JSON.stringify(oldV2));
  assert.equal(loadPlaybackCalibration(storage)?.actionsPerSecond, calibration.actionsPerSecond);
  assert.equal(loadPlaybackCalibration(storage)?.actionsPerSecondByDirection, undefined);
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, '{broken');
  assert.equal(loadPlaybackCalibration(storage), undefined);
  data.clear();
  data.set('keydist.playback-calibration.v1', JSON.stringify(calibration));
  assert.equal(loadPlaybackCalibration(storage), undefined);
});

test('キャリブレーションの保存値を新旧キーから削除できる', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => { data.delete(key); },
  };
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, '{}');
  data.set('keydist.playback-calibration.v2', '{}');

  clearPlaybackCalibration(storage);

  assert.equal(data.size, 0);
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

test('アルペジオ用の同手測定は全組合せを片方向組として作る', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationDirectedSameHandPairs(geometry);
  assert.equal(pairs.length, 24);
  assert.deepEqual(pairs.slice(0, 12), [
    ['a', 's'], ['s', 'a'], ['a', 'd'], ['d', 'a'], ['a', 'f'], ['f', 'a'],
    ['s', 'd'], ['d', 's'], ['s', 'f'], ['f', 's'], ['d', 'f'], ['f', 'd'],
  ]);
  assert.deepEqual(pairs.slice(12), [
    ['j', 'k'], ['k', 'j'], ['j', 'l'], ['l', 'j'], ['j', ';'], [';', 'j'],
    ['k', 'l'], ['l', 'k'], ['k', ';'], [';', 'k'], ['l', ';'], [';', 'l'],
  ]);
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
  const trace = generateTrace('なまえは', layout, buildGeometry('row-staggered'));

  assert.deepEqual(playbackCompletedInputs(trace.strokes, trace.strokes.length), ['な', 'ま', 'え']);
});

test('TK音直入力法のコンボは入力単位全体を現在文字と履歴に表示する', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('oonishi-custom-combo')!, kunrei());
  const trace = generateTrace('わがはいねこ', layout, buildGeometry('row-staggered'));

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
  const trace = generateTrace('きょうあ', layout, buildGeometry('row-staggered'));

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
  const trace = generateTrace('きょ', layout, buildGeometry('row-staggered'));

  assert.deepEqual(playbackRomajiPlan(trace.strokes, 2), { planned: 'kyo', typed: 'ky' });
});

test('予定ローマ字は未入力キーを順番付きの予定キーとして返す', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = generateTrace('け', layout, buildGeometry('row-staggered'));

  assert.equal(playbackRomajiPlannedKeys(trace.strokes, 1).get('e'), 1);
  assert.equal(playbackRomajiPlannedOrders(trace.strokes, 1).get('e'), 1);
  assert.equal(playbackRomajiPlannedKeys(trace.strokes, 1).has('k'), false);
  assert.equal(playbackOrderLabel(1), '①');
});

test('予定キーは先読み範囲の近いキーほど緑を濃く表示する', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = generateTrace('きょう', layout, buildGeometry('row-staggered'));
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
  const stroke = generateTrace('a', layout, geometry).strokes[0];
  const positions = playbackFingerPositionKeys(stroke, geometry);

  assert.equal(positions.get('a'), 'LP');
  assert.equal(positions.get('s'), 'LR');
  assert.equal(positions.get('f'), 'LI');
  assert.equal(positions.get('j'), 'RI');
});

test('レイヤー再生はシフトと出力キーの刻印を現在の面から引く', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const trace = generateTrace('ぬ', layout, buildGeometry('row-staggered'));
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

test('左右の同一レイヤーを畳み、明示presentation membershipの刻印も表示する', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const stroke = generateTrace('あ', layout, buildGeometry('row-staggered')).strokes[0];
  const display = playbackStrokeDisplay(layout, stroke);

  assert.equal(display.keyLabels.get('d'), '⇧');
  assert.equal(display.keyLabels.get('j'), 'あ');
  assert.equal(display.keyLabels.get('k'), 'れ');
  assert.equal(display.keyLabels.get('l'), 'お');
});

test('再生layer groupingはinputRoleではなくfaceLayerIdsをauthorityにする', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  assert.ok(layout.faces);
  assert.ok(layout.faceLayerIds);

  const kFace = layout.faces.find((face) => face.trigger.length === 1 && face.trigger[0] === 'k');
  const dFace = layout.faces.find((face) => face.trigger.length === 1 && face.trigger[0] === 'd');
  assert.ok(kFace);
  assert.ok(dFace);

  const layerId = layout.faceLayerIds.get(kFace);
  assert.ok(layerId);
  assert.equal(layout.faceLayerIds.get(dFace), layerId);

  const mismatchedKFace = { ...kFace, inputRole: 'composition' as const };
  const copiedDFace = { ...dFace };
  const presentationLayout = {
    ...layout,
    faces: [mismatchedKFace, copiedDFace],
    faceLayerIds: new Map([
      [mismatchedKFace, layerId],
      [copiedDFace, layerId],
    ]),
  };
  const stroke = generateTrace('あ', layout, buildGeometry('row-staggered')).strokes[0];
  const display = playbackStrokeDisplay(presentationLayout, stroke);

  assert.equal(display.keyLabels.get('a'), 'ほ');
  assert.equal(display.keyLabels.get('j'), 'あ');
});

test('Face再生でaggregation mappingが欠落していればerrorにする', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const stroke = generateTrace('あ', layout, buildGeometry('row-staggered')).strokes[0];
  assert.throws(
    () => playbackStrokeDisplay({ ...layout, faceLayerIds: undefined }, stroke),
    /faceLayerIdsの明示が必要/,
  );
});

test('combo再生はpresentation trigger alternativeで選択済み親指pathをFaceへ帰属する', () => {
  const face = {
    ...faceFromEntries(['thumb-r'], 'simultaneous', { j: 'あ' }),
    inputRole: 'composition' as const,
    triggerPersistence: 'single' as const,
    presentationTriggerAlternatives: [['thumb-r'], ['thumb-l']] as const,
  };
  const layout = withThumbShiftAlternatives(
    fromFaces('combo-thumb-presentation', 'combo-thumb-presentation', [face]),
    'thumb-r',
    ['thumb-r', 'thumb-l'],
  );
  const trace = generateTrace(
    'あ',
    layout,
    buildGeometry('row-staggered'),
    { windowSize: 3, sfbHomeCost: true, preferOppositeThumb: true },
  );
  const stroke = trace.strokes[0];

  assert.equal(stroke.aggregationGroupId, 'combo');
  assert.deepEqual(stroke.triggerKeys, ['thumb-l']);

  const display = playbackStrokeDisplay(layout, stroke);
  assert.equal(display.character, 'あ');
  assert.equal(display.keyLabels.get('thumb-l'), '⇧');
  assert.equal(display.keyLabels.get('j'), 'あ');
});

test('薙刀式の濁音はシフトと出力かなを同じステップで表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const stroke = generateTrace('が', layout, buildGeometry('row-staggered')).strokes[0];
  const display = playbackStrokeDisplay(layout, stroke);

  assert.equal(display.character, 'が');
  assert.equal(display.keyLabels.get('j'), '⇧');
  assert.equal(display.keyLabels.get('f'), 'が');
});

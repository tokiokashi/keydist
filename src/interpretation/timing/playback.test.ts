import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback as advancePlaybackAnalysis,
  clampPlaybackCursor,
  createPlaybackState,
  playbackCompletedInputs,
  playbackFingerPositionKeys,
  playbackInputPreview,
  PLAYBACK_COMPLETED_INPUT_LIMIT,
  playbackPlannedKeys,
  playbackPlannedOrders,
  playbackRecentActionsPerSecond as playbackRecentActionsPerSecondAnalysis,
  playbackRecentKanaPerSecond as playbackRecentKanaPerSecondAnalysis,
  playbackRateChartData as playbackRateChartDataAnalysis,
  playbackOrderLabel,
  playbackRomajiInputPreview,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackRomajiPlan,
  playbackStrokeDisplay,
  playbackStrokeAt,
  playbackStrokeDurationMs,
  playbackSameFingerKeyMotions,
  playbackTimeTotals,
  playbackTimingSchedule,
  reconcilePlaybackStateAfterAnalysisRefresh,
  playbackTrailKeys,
  playbackTrailOrders,
  stepPlayback,
} from './playback.ts';
import { assignmentWithHomeKeys, buildGeometry, DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { faceFromEntries, fromFaces, fromKana, LAYOUT_BY_ID, withRomaji, withThumbShiftAlternatives } from '#input/layouts/index.ts';
import { kunrei } from '#input/romaji/kunrei.ts';
import { analyzeStrokeStructure } from '../structure/aggregate.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from '../structure/chain.ts';
import {
  actionsPerSecondFromIntervals,
  calibrationActionPair,
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  calibrationDirectedSameHandPairs,
  calibrationSameHandPairs,
  fingerMeasurementFromIntervals,
  handDirection,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
} from './calibration.ts';

const playing = (cursor = 0) => ({
  ...createPlaybackState(),
  cursor,
  playing: true,
});
const withStepsPerSecond = <T extends object>(state: T, stepsPerSecond: number): T & { stepsPerSecond: number; elapsedMs: number } => ({
  ...state,
  stepsPerSecond,
  elapsedMs: 0,
});
const emptyStrokes = (length: number) => Array.from({ length }, () => ({ presses: [] })) as never[];
const timingAnalysis = (strokes: readonly any[], chainInterpretation?: ChainInterpretation) => {
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

const advancePlayback = (state: ReturnType<typeof createPlaybackState>, elapsedMs: number, strokes: readonly never[]) =>
  advancePlaybackAnalysis(state, elapsedMs, timingAnalysis(strokes));

const playbackRecentActionsPerSecond = (
  strokes: readonly never[],
  cursor: number,
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRecentActionsPerSecondAnalysis>[5],
  speedMultiplier?: number,
) => playbackRecentActionsPerSecondAnalysis(timingAnalysis(strokes), cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier);

const playbackRecentKanaPerSecond = (
  strokes: readonly never[],
  cursor: number,
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRecentKanaPerSecondAnalysis>[5],
  speedMultiplier?: number,
) => playbackRecentKanaPerSecondAnalysis(timingAnalysis(strokes), cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier);

const playbackRateChartData = (
  strokes: readonly never[],
  stepsPerSecond: number,
  sameFingerDelay = true,
  limit = 10,
  calibration?: Parameters<typeof playbackRateChartDataAnalysis>[4],
  speedMultiplier?: number,
) => playbackRateChartDataAnalysis(timingAnalysis(strokes), stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier);

test('構造解析の再生成ではcursor/playingとStroke内進捗率を維持する', () => {
  const calibration = {
    actionsPerSecond: 4,
    actionsPerSecondByDirection: { 'L→R': 8 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 1000 / 4,
    fallbackMoveMsPerUnit: 1000 / 10,
    measuredAt: 1,
  };
  const previous = timingAnalysis([{ presses: [{ finger: 'LI' }] }, { presses: [{ finger: 'RI' }] }]);
  const next = timingAnalysis([{ presses: [{ finger: 'LI' }] }, { presses: [{ finger: 'LM' }] }]);
  const state = {
    ...createPlaybackState(4, false, calibration),
    cursor: 1,
    playing: true,
    elapsedMs: 62.5,
  };

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(state, state, previous, next);

  assert.equal(refreshed.cursor, 1);
  assert.equal(refreshed.playing, true);
  assert.equal(refreshed.elapsedMs, 250);
});

test('配列切替では位置だけ引き継ぎTiming設定は新配列へ切り替える', () => {
  const previous = timingAnalysis([{ presses: [] }, { presses: [] }]);
  const next = timingAnalysis([{ presses: [] }, { presses: [] }]);
  const previousState = {
    ...createPlaybackState(4, false, undefined, 1),
    cursor: 1,
    playing: true,
    elapsedMs: 125,
  };
  const nextBaseState = createPlaybackState(8, true, undefined, 2);

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(previousState, nextBaseState, previous, next);

  assert.equal(refreshed.cursor, 1);
  assert.equal(refreshed.playing, true);
  assert.equal(refreshed.stepsPerSecond, 8);
  assert.equal(refreshed.sameFingerDelay, true);
  assert.equal(refreshed.speedMultiplier, 2);
  assert.equal(refreshed.elapsedMs, 31.25);
});

test('構造解析の再生成後にcursorが末尾なら再生を停止する', () => {
  const previous = timingAnalysis([{ presses: [{ finger: 'LI' }] }, { presses: [{ finger: 'LM' }] }]);
  const next = timingAnalysis([{ presses: [{ finger: 'LI' }] }]);
  const state = {
    ...createPlaybackState(),
    cursor: 2,
    playing: true,
    elapsedMs: 123,
  };

  const refreshed = reconcilePlaybackStateAfterAnalysisRefresh(state, state, previous, next);

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

  let fast = withStepsPerSecond(playing(), 5);
  fast = advancePlayback(fast, 100, strokes);
  fast = advancePlayback(fast, 100, strokes);
  assert.equal(fast.cursor, 1);
});

test('再生速度は固定候補に限らず任意のステップ毎秒を設定できる', () => {
  const strokes = emptyStrokes(3);
  let custom = withStepsPerSecond(playing(), 3.2);
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
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 1000 / 4,
    fallbackMoveMsPerUnit: 1000 / 10,
    measuredAt: 1,
  };
  assert.equal(playbackStrokeDurationMs(stroke, 1, false, calibration, undefined, 2), 125);
});

test('同指ディレイは移動距離に応じてステップ間隔を延ばす', () => {
  const strokes = [{ presses: [{ sfb: true, distance: 2 }] }, { presses: [] }] as never[];
  assert.equal(playbackStrokeDurationMs(strokes[0], 2, false), 500);
  assert.equal(playbackStrokeDurationMs(strokes[0], 2, true), 1000);

  let state = withStepsPerSecond({ ...playing(), sameFingerDelay: true }, 2);
  for (let i = 0; i < 9; i++) state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 0);
  state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 1);
  for (let i = 0; i < 4; i++) state = advancePlayback(state, 100, strokes);
  state = advancePlayback(state, 100, strokes);
  assert.equal(state.cursor, 2);
  assert.ok(Math.abs(playbackRecentActionsPerSecond(strokes, 2, 2, true)! - 4 / 3) < 1e-9);
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

test('待機を挿入したscheduleでも、SMAとEWMAは打鍵の時間だけで求める', () => {
  const strokes = [
    { inputIndex: 0, inputChar: 'あ', presses: [] },
    { inputIndex: 1, inputChar: 'い', presses: [] },
    { inputIndex: 2, inputChar: 'う', presses: [] },
  ] as never[];
  const analysis = timingAnalysis(strokes);
  const plain = [
    { strokeIndex: 0, startMs: 0, endMs: 500 },
    { strokeIndex: 1, startMs: 500, endMs: 1500 },
    { strokeIndex: 2, startMs: 1500, endMs: 2000 },
  ];
  // 2打目の前に300ms、3打目の前に700msの待機。各ステップの打鍵の時間は500・1000・500のまま
  const waited = [
    { strokeIndex: 0, startMs: 0, endMs: 500 },
    { strokeIndex: 1, startMs: 500, endMs: 1800, waitMs: 300 },
    { strokeIndex: 2, startMs: 1800, endMs: 3000, waitMs: 700 },
  ];
  for (const [average, halfLife] of [
    ['sma', 1],
    ['ewma', 1],
  ] as const) {
    for (const cursor of [1, 2, 3]) {
      assert.equal(
        playbackRecentActionsPerSecondAnalysis(analysis, cursor, 2, true, 10, undefined, 1, waited, average, halfLife),
        playbackRecentActionsPerSecondAnalysis(analysis, cursor, 2, true, 10, undefined, 1, plain, average, halfLife),
      );
      assert.equal(
        playbackRecentKanaPerSecondAnalysis(analysis, cursor, 2, true, 10, undefined, 1, waited, average, halfLife),
        playbackRecentKanaPerSecondAnalysis(analysis, cursor, 2, true, 10, undefined, 1, plain, average, halfLife),
      );
    }
  }
  assert.deepEqual(playbackTimeTotals(plain), { typingMs: 2000, totalMs: 2000 });
  assert.deepEqual(playbackTimeTotals(waited), { typingMs: 2000, totalMs: 3000 });
  // 最後のステップより後の待機は、総時間にだけ入る
  assert.deepEqual(playbackTimeTotals(waited, 400), { typingMs: 2000, totalMs: 3400 });
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

  const actions = playbackRecentActionsPerSecondAnalysis(analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
  // 1打目は2/s。そこから1秒経過で寄与が1/2になり、
  // 2打目の瞬時値1/sが残り1/2を占めるため1.5/s。
  assert.ok(actions !== undefined);
  assert.ok(Math.abs(actions - 1.5) < 1e-9);

  const kanaAtFirstStroke = playbackRecentKanaPerSecondAnalysis(analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
  const actionsAtFirstStroke = playbackRecentActionsPerSecondAnalysis(analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
  assert.equal(kanaAtFirstStroke, actionsAtFirstStroke);

  const kana = playbackRecentKanaPerSecondAnalysis(analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
  assert.ok(kana !== undefined);
  // 1 Stroke = 1かなならinstantaneous系列が同じなのでEWMAも一致する。
  assert.ok(Math.abs(kana - actions) < 1e-9);

  const points = playbackRateChartDataAnalysis(analysis, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
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

  assert.equal(playbackRecentKanaPerSecondAnalysis(analysis, 1, 2, true, 10, undefined, 1, schedule, 'ewma', 1), undefined);
  const completed = playbackRecentKanaPerSecondAnalysis(analysis, 2, 2, true, 10, undefined, 1, schedule, 'ewma', 1);
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
      analysis.chains.some((chain) => strokeIndex >= chain.startStrokeIndex && strokeIndex < chain.endStrokeIndex),
    ),
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
    analysis.chains.some((chain) => 1 >= chain.startStrokeIndex && 1 < chain.endStrokeIndex),
    true,
  );
  assert.equal(playbackRateChartDataAnalysis(analysis, 2)[2].chain, true);
});

test('個人キャリブレーションは通常打鍵と指移動を別々の速度として再生へ反映する', () => {
  const calibration = {
    actionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    fingerRepeatMs: { LI: 1000 / 4 },
    fingerMoveMsPerUnit: { LI: 1000 / 8 },
    fallbackRepeatMs: 1000 / 4,
    fallbackMoveMsPerUnit: 1000 / 12,
    measuredAt: 1,
  };
  const stroke = { presses: [{ finger: 'LI', sfb: true, distance: 3 }] } as never;
  assert.equal(playbackStrokeDurationMs(stroke, 1, false, calibration), 250);
  assert.equal(playbackStrokeDurationMs(stroke, 1, true, calibration), 625);
  const fallbackStroke = { presses: [{ finger: 'RP', sfb: true, distance: 3 }] } as never;
  assert.ok(Math.abs(playbackStrokeDurationMs(fallbackStroke, 1, true, calibration) - 500) < 1e-9);

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
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 1000 / 5,
    fallbackMoveMsPerUnit: 1000 / 10,
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
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 1000 / 5,
    fallbackMoveMsPerUnit: 1000 / 10,
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
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 1000 / 5,
    fallbackMoveMsPerUnit: 1000 / 10,
    measuredAt: 1,
  };
  const strokes = [{ presses: [{ finger: 'LI' }] }, { presses: [{ finger: 'RI' }] }] as never[];
  const state = advancePlayback(
    {
      ...createPlaybackState(5, false, calibration),
      cursor: 1,
      playing: true,
    },
    100,
    strokes,
  );
  assert.equal(state.cursor, 2);
  assert.equal(state.elapsedMs, 0);
});

test('キャリブレーションの中央値は外れ値を抑えて速度を求める', () => {
  assert.equal(actionsPerSecondFromIntervals([250, 250, 1000, 250]), 4);
  assert.deepEqual(fingerMeasurementFromIntervals([250, 250, 1000], [500, 500, 1000], 2), {
    repeatMs: 250,
    moveMsPerUnit: 125,
  });
  assert.equal(fingerMeasurementFromIntervals([250], [200], 2)?.moveMsPerUnit, 0);
  assert.equal(fingerMeasurementFromIntervals([], [200], 2), undefined);
  assert.equal(fingerMeasurementFromIntervals([250], [500], 0), undefined);
});

test('キャリブレーションの指ペアはホーム段と下段で揃える', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationKeyPairs(geometry);
  assert.equal(pairs.length, 8);
  assert.deepEqual(calibrationActionPair(geometry), ['f', 'j']);
  assert.equal(pairs.find((pair) => pair.finger === 'LI')?.fromKey, 'f');
  assert.equal(pairs.find((pair) => pair.finger === 'LI')?.toKey, 'v');
  assert.equal(
    pairs.every((pair) => geometry.keys.get(pair.toKey)?.row === 3),
    true,
  );
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
  assert.equal(
    pairs.every((pair) => eligibleKeyIds.has(pair.fromKey) && eligibleKeyIds.has(pair.toKey)),
    true,
  );
  assert.deepEqual(sameHandPairs.slice(6), [
    ['j', 'k'],
    ['j', 'l'],
    ['j', ';'],
    ['k', 'l'],
    ['k', ';'],
    ['l', ';'],
  ]);
});

test('同手の別指測定は隣接以外も含む全組合せのホームキーを使う', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationSameHandPairs(geometry);
  assert.equal(pairs.length, 12);
  assert.deepEqual(pairs.slice(0, 6), [
    ['a', 's'],
    ['a', 'd'],
    ['a', 'f'],
    ['s', 'd'],
    ['s', 'f'],
    ['d', 'f'],
  ]);
  assert.deepEqual(pairs.slice(6), [
    ['j', 'k'],
    ['j', 'l'],
    ['j', ';'],
    ['k', 'l'],
    ['k', ';'],
    ['l', ';'],
  ]);
});

test('アルペジオ用の同手測定は全組合せを片方向組として作る', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationDirectedSameHandPairs(geometry);
  assert.equal(pairs.length, 24);
  assert.deepEqual(pairs.slice(0, 12), [
    ['a', 's'],
    ['s', 'a'],
    ['a', 'd'],
    ['d', 'a'],
    ['a', 'f'],
    ['f', 'a'],
    ['s', 'd'],
    ['d', 's'],
    ['s', 'f'],
    ['f', 's'],
    ['d', 'f'],
    ['f', 'd'],
  ]);
  assert.deepEqual(pairs.slice(12), [
    ['j', 'k'],
    ['k', 'j'],
    ['j', 'l'],
    ['l', 'j'],
    ['j', ';'],
    [';', 'j'],
    ['k', 'l'],
    ['l', 'k'],
    ['k', ';'],
    [';', 'k'],
    ['l', ';'],
    [';', 'l'],
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
  const strokes = [{ presses: [{ finger: 'LP', keys: [{ id: 'a' }] }] }, { presses: [{ finger: 'LP', sfb: true, keys: [{ id: 's' }] }] }] as never[];
  assert.deepEqual(playbackSameFingerKeyMotions(strokes, 2), [
    {
      fromKey: 'a',
      toKeys: ['s'],
      finger: 'LP',
    },
  ]);
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
  const layout = withRomaji(LAYOUT_BY_ID.get('oonishi-custom')!, kunrei());
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

  // 先読みNは、現在の入力（きょ）の終わりから数えたかなの数
  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 0), [{ text: 'きょ', kind: 'current' }]);
  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 1), [
    { text: 'きょ', kind: 'current' },
    { text: 'う', kind: 'planned' },
  ]);
  assert.deepEqual(playbackInputPreview(trace.strokes, 2, 2), [
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
  // N=0: 現在の入力（k。きょの範囲）と範囲が重なる入力だけ。うは範囲の外
  const planned = playbackPlannedKeys(trace.strokes, 0, 0);

  assert.equal(planned.get('k'), 1);
  assert.equal(planned.get('y'), 2 / 3);
  assert.equal(planned.get('o'), 1 / 3);
  assert.equal(planned.has('u'), false);

  const orders = playbackPlannedOrders(trace.strokes, 0, 0);
  assert.equal(orders.get('k'), 1);
  assert.equal(orders.get('y'), 2);
  assert.equal(orders.get('o'), 3);
  assert.equal(orders.has('u'), false);

  // N=1: 次のかな（う）まで入る
  const wider = playbackPlannedKeys(trace.strokes, 0, 1);
  assert.equal(wider.get('k'), 1);
  assert.equal(wider.get('u'), 1 / 4);
  assert.equal(playbackPlannedOrders(trace.strokes, 0, 1).get('u'), 4);
});

test('予定キーは、今の入力の残りの打鍵と、範囲に入る入力のキーを出す', () => {
  // 前置シフトのかな配列: 「が」はシフトを押してから本体キーgを押す。シフトを押した後も、本体キーが予定に出る
  const trace = generateTrace('がぎ', LAYOUT_BY_ID.get('shin-jis-prefix')!, buildGeometry('row-staggered'));
  const first = trace.strokes.filter((stroke) => stroke.selectionIndex === trace.strokes[0].selectionIndex);
  assert.ok(first.length >= 2, 'がは複数の打鍵');
  const bodyKeys = first.slice(1).flatMap((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));
  const plannedAfterShift = playbackPlannedKeys(trace.strokes, 1, 0);
  for (const id of bodyKeys) assert.ok(plannedAfterShift.has(id), `${id}は今の入力の残りなのでN=0でも出る`);
  // 次のかな（ぎ）のキーは、N=0では範囲の外、N=1では範囲の中
  const next = trace.strokes.filter((stroke) => stroke.selectionIndex !== trace.strokes[0].selectionIndex);
  const nextOnly = next
    .flatMap((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)))
    .filter((id) => !plannedAfterShift.has(id));
  assert.ok(nextOnly.length > 0);
  const wider = playbackPlannedKeys(trace.strokes, 1, 1);
  for (const id of nextOnly) assert.ok(wider.has(id), `${id}はN=1で出る`);
});

test('予定キーの範囲は、読み飛ばした文字の分だけ狭くなる', () => {
  const layout = fromKana('plan-skip', 'plan-skip', { a: [['a']], s: [['s']], d: [['d']] });
  const geometry = buildGeometry('row-staggered');
  const plain = generateTrace('asd', layout, geometry);
  const skipped = generateTrace('as☆d', layout, geometry);
  // 現在の入力aから、dは2文字先と3文字先
  assert.equal(playbackPlannedKeys(plain.strokes, 1, 2).has('d'), true);
  assert.equal(playbackPlannedKeys(skipped.strokes, 1, 2).has('d'), false);
  assert.equal(playbackPlannedKeys(skipped.strokes, 1, 3).has('d'), true);
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

  const mismatchedKFace = { ...kFace, inputRole: 'composition' as const, compositionAggregation: 'combo' as const };
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
  const { faceLayerIds: _faceLayerIds, ...withoutFaceLayerIds } = layout;
  assert.throws(() => playbackStrokeDisplay(withoutFaceLayerIds, stroke), /faceLayerIdsの明示が必要/);
});

test('combo再生はpresentation trigger alternativeで選択済み親指pathをFaceへ帰属する', () => {
  const face = {
    ...faceFromEntries(['thumb-r'], 'simultaneous', { j: 'あ' }),
    inputRole: 'composition' as const,
    compositionAggregation: 'combo' as const,
    triggerPersistence: 'single' as const,
    presentationTriggerAlternatives: [['thumb-r'], ['thumb-l']] as const,
  };
  const layout = withThumbShiftAlternatives(fromFaces('combo-thumb-presentation', 'combo-thumb-presentation', [face]), 'thumb-r', ['thumb-r', 'thumb-l']);
  const trace = generateTrace('あ', layout, buildGeometry('row-staggered'), { windowSize: 3, sfbHomeCost: true, preferOppositeThumb: true });
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

test('入力プレビューの入力済みは、既定で20個まで返し、数を渡せばその数で切る', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = generateTrace('a'.repeat(40), layout, buildGeometry('row-staggered'));
  const completed = (limit?: number) => playbackInputPreview(trace.strokes, 30, 0, limit).filter((segment) => segment.kind === 'completed').length;

  assert.equal(PLAYBACK_COMPLETED_INPUT_LIMIT, 20);
  assert.equal(completed(), 20);
  assert.equal(completed(10), 10);
});

// 入力の行をローマ字で出す関数の検査。ストロークは、読まれる項目だけを持つ手作りの列にする。
type RomajiStrokeSource = {
  char: string;
  inputChar: string;
  inputIndex: number;
  /** 覆うテキストの最初と最後の文字の位置。省略すると`inputIndex`の1文字 */
  kana?: readonly [number, number];
  selectionIndex: number;
  /** 押すキー。triggerKeysに入れたキーは、文字を出力しないシフトとして扱われる */
  keys: string[];
  triggerKeys?: string[];
};
const romajiStrokes = (sources: readonly RomajiStrokeSource[]) =>
  sources.map((source, index) => ({
    index,
    char: source.char,
    inputChar: source.inputChar,
    inputIndex: source.inputIndex,
    kanaStart: source.kana?.[0] ?? source.inputIndex,
    kanaEnd: source.kana?.[1] ?? source.inputIndex,
    selectionIndex: source.selectionIndex,
    triggerKeys: source.triggerKeys ?? [],
    presses: [{ keys: source.keys.map((id) => ({ id })) }],
  })) as never[];
const unit = (segment: { kind: string; kana: string; romaji?: { typed: string; remaining: string } }) =>
  `${segment.kind}:${segment.romaji === undefined ? segment.kana : `${segment.romaji.typed}|${segment.romaji.remaining}`}`;

test('ローマ字の入力の行: 単位を出す文字は、選択ごとに1回ずつつないだcharになる', () => {
  // 「しゃ」(s,h,a)の後に、シフトを文字の前に置く「が」相当（シフト,g）、シフトを文字の後に置く「ぎ」相当（g,シフト）
  const strokes = romajiStrokes([
    { char: 's', inputChar: 'し', inputIndex: 0, kana: [0, 0], selectionIndex: 0, keys: ['s'] },
    { char: 'ya', inputChar: 'し', inputIndex: 0, kana: [0, 0], selectionIndex: 1, keys: ['y', 'a'] },
    { char: 'G', inputChar: 'が', inputIndex: 1, kana: [1, 1], selectionIndex: 2, keys: ['lshift'], triggerKeys: ['lshift'] },
    { char: 'G', inputChar: 'が', inputIndex: 1, kana: [1, 1], selectionIndex: 2, keys: ['g'] },
    { char: 'H', inputChar: 'ぎ', inputIndex: 2, kana: [2, 2], selectionIndex: 3, keys: ['h'] },
    { char: 'H', inputChar: 'ぎ', inputIndex: 2, kana: [2, 2], selectionIndex: 3, keys: ['rshift'], triggerKeys: ['rshift'] },
  ]);
  assert.deepEqual(playbackRomajiInputPreview(strokes, 0, 6).map(unit), ['planned:|sya', 'planned:|G', 'planned:|H']);
});

test('ローマ字の入力の行: 現在の単位の境目は、文字を出力するストロークを打った時に進み、シフトだけのステップでは進まない', () => {
  const strokes = romajiStrokes([
    { char: 'G', inputChar: 'が', inputIndex: 0, selectionIndex: 0, keys: ['lshift'], triggerKeys: ['lshift'] },
    { char: 'G', inputChar: 'が', inputIndex: 0, selectionIndex: 0, keys: ['g'] },
    { char: 'H', inputChar: 'ぎ', inputIndex: 1, selectionIndex: 1, keys: ['h'] },
    { char: 'H', inputChar: 'ぎ', inputIndex: 1, selectionIndex: 1, keys: ['rshift'], triggerKeys: ['rshift'] },
  ]);
  const current = (cursor: number) =>
    playbackRomajiInputPreview(strokes, cursor)
      .filter((s) => s.kind === 'current')
      .map(unit);
  // シフトが文字の前: シフトを打っても進まず、文字を打つと進む（単位の最後のステップなのでかなに戻る）
  assert.deepEqual(current(1), ['current:|G']);
  assert.deepEqual(current(2), ['current:が']);
  // シフトが文字の後: 文字を打つと進み、シフトを打っても変わらない（その後でかなに戻る）
  assert.deepEqual(current(3), ['current:H|']);
  assert.deepEqual(current(4), ['current:ぎ']);
});

test('ローマ字の入力の行: 1つの選択が複数の文字を持つ時、境目は文字の数だけまとめて進む', () => {
  // 「きょう」: kの後にコンボyouが1回で3文字を出力する形ではなく、kとyouの2つの選択
  const strokes = romajiStrokes([
    { char: 'k', inputChar: 'き', inputIndex: 0, kana: [0, 1], selectionIndex: 0, keys: ['k'] },
    { char: 'you', inputChar: 'き', inputIndex: 0, kana: [0, 2], selectionIndex: 1, keys: ['y', 'o', 'u'] },
  ]);
  const at = (cursor: number) => playbackRomajiInputPreview(strokes, cursor, 2).map(unit);
  assert.deepEqual(at(0), ['planned:|kyou']);
  assert.deepEqual(at(1), ['current:k|you']);
  assert.deepEqual(at(2), ['current:き']);
});

test('ローマ字の入力の行: 打ち終えた単位はかなで、最後のステップを打ち終えた現在の単位もかなで出る', () => {
  const strokes = romajiStrokes([
    { char: 'k', inputChar: 'か', inputIndex: 0, selectionIndex: 0, keys: ['k'] },
    { char: 'a', inputChar: 'か', inputIndex: 0, selectionIndex: 1, keys: ['a'] },
    { char: 'k', inputChar: 'き', inputIndex: 1, selectionIndex: 2, keys: ['k'] },
    { char: 'i', inputChar: 'き', inputIndex: 1, selectionIndex: 3, keys: ['i'] },
  ]);
  // カーソル0は現在の単位が無く、最初の単位がこの先の単位としてローマ字で出る
  assert.deepEqual(playbackRomajiInputPreview(strokes, 0, 4).map(unit), ['planned:|ka', 'planned:|ki']);
  assert.deepEqual(playbackRomajiInputPreview(strokes, 1, 4).map(unit), ['current:k|a', 'planned:|ki']);
  assert.deepEqual(playbackRomajiInputPreview(strokes, 2, 4).map(unit), ['current:か', 'planned:|ki']);
  assert.deepEqual(playbackRomajiInputPreview(strokes, 3, 4).map(unit), ['completed:か', 'current:k|i']);
  assert.deepEqual(playbackRomajiInputPreview(strokes, 4, 4).map(unit), ['completed:か', 'current:き']);
});

test('ローマ字の入力の行: 範囲の決め方は、かなの入力の行と同じ', () => {
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const trace = generateTrace('かきくけこ', layout, buildGeometry('row-staggered'));
  for (const cursor of [0, 1, 2, 5, 9]) {
    for (const lookahead of [0, 2, 4]) {
      for (const limit of [0, 1, 20]) {
        assert.deepEqual(
          playbackRomajiInputPreview(trace.strokes, cursor, lookahead, limit).map((s) => [s.kind, s.kana]),
          playbackInputPreview(trace.strokes, cursor, lookahead, limit).map((s) => [s.kind, s.text]),
          `${cursor}/${lookahead}/${limit}`,
        );
      }
    }
  }
});

test('ローマ字の入力の行: 実際の打鍵の列で、拗音と、コンボを含む単位は、単位ごとにまとめた綴りで出る', () => {
  const geometry = buildGeometry('row-staggered');
  const qwerty = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  const syu = generateTrace('しゅ', qwerty, geometry);
  assert.deepEqual(playbackRomajiInputPreview(syu.strokes, 0, 5).map(unit), ['planned:|syu']);
  assert.deepEqual(playbackRomajiInputPreview(syu.strokes, 2, 5).map(unit), ['current:sy|u']);
  // 「きょう」のkとコンボyouは同じ単位の別の選択。コンボの3文字は1回で進む
  const combo = withRomaji(LAYOUT_BY_ID.get('oonishi-custom')!, kunrei());
  const kyou = generateTrace('きょう', combo, geometry);
  assert.deepEqual(
    kyou.strokes.map((stroke) => stroke.char),
    ['k', 'you'],
  );
  assert.deepEqual(playbackRomajiInputPreview(kyou.strokes, 1).map(unit), ['current:k|you']);
  assert.deepEqual(playbackRomajiInputPreview(kyou.strokes, 2).map(unit), ['current:きょう']);
});

test('EWMAの速度グラフは、カーソルごとに先頭から畳み込んだ時の値と1ビットも違わない', () => {
  // 値は、カーソルごとに先頭から計算し直す実装で求めた値
  const layout = LAYOUT_BY_ID.get('asuka')!;
  const geometry = buildGeometry('row-staggered', assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, layout.homeKeys));
  const trace = generateTrace(
    'わがはいはねこである。なまえはまだない。どこでうまれたかとんとけんとうがつかぬ、なんでもうすぐらいじめじめしたところでにゃーにゃーないていたことだけはきおくしている。',
    layout,
    geometry,
    { windowSize: 3, sfbHomeCost: true },
  );
  const analysis = analyzeStrokeStructure(trace.strokes);
  const calibration = {
    actionsPerSecond: 6,
    actionsPerSecondByDirection: { 'L→R': 6.5, 'R→L': 5.5 },
    sameHandDifferentFingerActionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 6, 'RI:RM': 5.2, 'LR:LM': 4.4 },
    fingerRepeatMs: { LI: 150, RI: 140, LM: 160 },
    fingerMoveMsPerUnit: { LI: 40, RI: 35, LM: 50 },
    fallbackRepeatMs: 170,
    fallbackMoveMsPerUnit: 45,
    keystrokeOverheadMs: { other: 10, chain: -5, arpeggio: 3, repeat: 20, sfb: 15 },
    simultaneousOverheadMs: { 'both-hands': 8, 'one-hand': 12, thumb: 6 },
    measuredAt: 0,
  };
  const schedule = playbackTimingSchedule(analysis, 4, true, calibration, 1, { allFingerMovementDelay: true, geometry });
  const chart = playbackRateChartDataAnalysis(analysis, 4, true, 8, calibration, 1, schedule, 'ewma', 0.7);
  assert.equal(chart.length - 1, 83);
  const expected = [
    { cursor: 1, inputText: 'わ', rate: 5.474452554744526, chain: true, arpeggio: false },
    { cursor: 2, inputText: 'わが', rate: 5.4737012654331245, chain: true, arpeggio: false },
    { cursor: 5, inputText: 'わがはいは', rate: 5.387944290608676, chain: true, arpeggio: true },
    { cursor: 13, inputText: 'である。なま', rate: 5.4322670076555175, chain: true, arpeggio: false },
    { cursor: 30, inputText: 'まれたかとん', rate: 5.368970199810067, chain: true, arpeggio: true },
    { cursor: 47, inputText: 'んでもうすぐ', rate: 5.650028163372759, chain: true, arpeggio: false },
    { cursor: 83, inputText: 'くしている。', rate: 5.491430856085303, chain: true, arpeggio: false },
  ];
  for (const { cursor, rate, ...rest } of expected) {
    assert.deepEqual(chart[cursor], { cursor, ...rest, kanaPerSecond: rate, actionsPerSecond: rate });
  }
});

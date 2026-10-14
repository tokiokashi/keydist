import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlaybackCalibration, playbackCalibrationProblem, type PlaybackCalibration } from './calibration.ts';

const VALID: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2, 'LI>LM': 3.4 },
  fingerSpeedUnitsPerSecond: { LI: 8, RP: 6 },
  fallbackFingerSpeedUnitsPerSecond: 7,
  measuredAt: 1,
};

function without(key: keyof PlaybackCalibration): unknown {
  const copy: Record<string, unknown> = { ...VALID };
  delete copy[key];
  return copy;
}

test('保存できる個人速度は問題が無い', () => {
  assert.equal(playbackCalibrationProblem(VALID), undefined);
  assert.equal(isPlaybackCalibration(VALID), true);
});

test('任意の項目が無くても保存できる', () => {
  assert.equal(isPlaybackCalibration(without('actionsPerSecondByDirection')), true);
  assert.equal(isPlaybackCalibration(without('sameHandDifferentFingerActionsPerDirectedPair')), true);
});

test('必須の項目が欠けた個人速度は保存できない', () => {
  for (const key of [
    'actionsPerSecond',
    'sameHandDifferentFingerActionsPerSecond',
    'sameHandDifferentFingerActionsPerSecondByPair',
    'fingerSpeedUnitsPerSecond',
    'fallbackFingerSpeedUnitsPerSecond',
    'measuredAt',
  ] as const) {
    assert.notEqual(playbackCalibrationProblem(without(key)), undefined, key);
  }
});

test('範囲の境界は保存でき、外側は保存できない', () => {
  const edge = { ...VALID, actionsPerSecond: 0.1, fallbackFingerSpeedUnitsPerSecond: 100 };
  assert.equal(isPlaybackCalibration(edge), true);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: 0.09 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: 40.01 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackFingerSpeedUnitsPerSecond: 100.01 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerSpeedUnitsPerSecond: { LI: 0.05 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: Number.NaN }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: '5' }), false);
});

test('知らない指・方向・組のキーを持つ個人速度は保存できない', () => {
  assert.equal(isPlaybackCalibration({ ...VALID, fingerSpeedUnitsPerSecond: { XX: 5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecondByDirection: { up: 5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { 'LI:LM': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { LM: 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI:LR': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerDirectedPair: { 'LM:LI': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerDirectedPair: { 'LM>RM': 3 } }), false);
});

test('予約名のキーは保存できない', () => {
  const polluted = JSON.parse('{"__proto__": 5}') as Record<string, number>;
  assert.equal(isPlaybackCalibration({ ...VALID, fingerSpeedUnitsPerSecond: polluted }), false);
});

test('オブジェクトでない値は保存できない', () => {
  assert.notEqual(playbackCalibrationProblem(null), undefined);
  assert.notEqual(playbackCalibrationProblem([]), undefined);
  assert.notEqual(playbackCalibrationProblem('5'), undefined);
});

test('打鍵の上乗せは-1000から1000ミリ秒までの種類ごとの値で、持たなくても保存できる', () => {
  assert.equal(isPlaybackCalibration(without('keystrokeOverheadMs')), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { arpeggio: 0, chain: 1000, other: 80 } }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: {} }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { repeat: 0, sfb: 1000 } }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { other: -0.1, sfb: -1000, repeat: -126 } }), true);
  for (const bad of [{ other: -1000.1 }, { other: 1000.1 }, { other: Number.NaN }, { other: '5' }, { sfb: -1001 }, { repeat: 1001 }, { same: 5 }]) {
    assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: bad }), false);
  }
  assert.equal(playbackCalibrationProblem({ ...VALID, keystrokeOverheadMs: { other: 2000 } }), '打鍵の上乗せが正しくありません');
});

test('同じキーを続けて打つ速さは0.1から40アクション/秒までで、持たなくても保存できる', () => {
  assert.equal(isPlaybackCalibration(without('sameKeyActionsPerSecond')), true);
  assert.equal(isPlaybackCalibration({ ...VALID, sameKeyActionsPerSecond: 0.1 }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, sameKeyActionsPerSecond: 40 }), true);
  for (const bad of [0.09, 40.01, Number.NaN, '5']) {
    assert.equal(isPlaybackCalibration({ ...VALID, sameKeyActionsPerSecond: bad }), false);
  }
  assert.equal(playbackCalibrationProblem({ ...VALID, sameKeyActionsPerSecond: 50 }), '同じキーを続けて打つ速さが範囲外です');
});

test('かなの中・かなの境目の値は、分けない値を持たなくても、範囲の中なら保存できる', () => {
  const sides = {
    'arpeggio-within': -1000, 'arpeggio-boundary': 1000,
    'chain-within': 0, 'chain-boundary': 12.5,
    'other-within': 30, 'other-boundary': 90,
  };
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: sides }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { 'other-within': 30 } }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { ...sides, other: 80, repeat: 5, sfb: 7 } }), true);
});

test('かなの中・かなの境目の値が1つでも範囲の外・数でない値・知らない側なら保存できない', () => {
  for (const bad of [
    { 'other-within': 1000.1 },
    { 'other-boundary': -1000.1 },
    { 'chain-within': Number.NaN },
    { 'arpeggio-boundary': '5' },
    // 範囲の中の値があっても、1つでも範囲の外なら全体を保存できない。
    { other: 80, 'other-within': 30, 'other-boundary': 2000 },
    { 'repeat-within': 5 },
    { 'sfb-boundary': 5 },
    { 'other-middle': 5 },
    { 'within-other': 5 },
  ]) {
    assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: bad }), false, JSON.stringify(bad));
  }
  assert.equal(
    playbackCalibrationProblem({ ...VALID, keystrokeOverheadMs: { 'other-within': 2000 } }),
    '打鍵の上乗せが正しくありません',
  );
});

test('同時押しの上乗せは-1000から1000ミリ秒まで保存でき、外側と知らない分け方は保存できない', () => {
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: { 'both-hands': -1000, 'one-hand': 0, thumb: 1000 } }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: {} }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: { thumb: 1000.5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: { thumb: -1000.5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: { arpeggio: 10 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, simultaneousOverheadMs: 'x' }), false);
  assert.equal(playbackCalibrationProblem({ ...VALID, simultaneousOverheadMs: { thumb: 5000 } }), '同時押しの上乗せが正しくありません');
});

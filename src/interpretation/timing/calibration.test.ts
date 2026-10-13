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

test('連打との差は0から1000ミリ秒までの種類ごとの値で、持たなくても保存できる', () => {
  assert.equal(isPlaybackCalibration(without('keystrokeOverheadMs')), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: { arpeggio: 0, chain: 1000, other: 80 } }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: {} }), true);
  for (const bad of [{ other: -0.1 }, { other: 1000.1 }, { other: Number.NaN }, { other: '5' }, { sfb: 5 }]) {
    assert.equal(isPlaybackCalibration({ ...VALID, keystrokeOverheadMs: bad }), false);
  }
  assert.equal(playbackCalibrationProblem({ ...VALID, keystrokeOverheadMs: { other: 2000 } }), '連打との差が正しくありません');
});

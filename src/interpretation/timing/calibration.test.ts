import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentWithHomeKeys, buildGeometry, DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import {
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  fingerMeasurementFromIntervals,
  meanRepeatMs,
  medianIncludingZero,
  playbackCalibrationProblem,
  playbackMoveMsPerUnit,
  playbackRepeatMs,
  type PlaybackCalibration,
} from './calibration.ts';

/** 保存値として読める形か。 */
const isPlaybackCalibration = (value: unknown): boolean => playbackCalibrationProblem(value) === undefined;

const VALID: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2, 'LI>LM': 3.4 },
  fingerRepeatMs: { LI: 1000 / 5, RP: 1000 / 5 },
  fingerMoveMsPerUnit: { LI: 1000 / 8, RP: 1000 / 6 },
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 7,
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
    'fingerRepeatMs',
    'fingerMoveMsPerUnit',
    'fallbackRepeatMs',
    'fallbackMoveMsPerUnit',
    'measuredAt',
  ] as const) {
    assert.notEqual(playbackCalibrationProblem(without(key)), undefined, key);
  }
});

test('範囲の境界は保存でき、外側は保存できない', () => {
  const edge = { ...VALID, actionsPerSecond: 0.1, fallbackRepeatMs: 25, fallbackMoveMsPerUnit: 0 };
  assert.equal(isPlaybackCalibration(edge), true);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackRepeatMs: 10000, fallbackMoveMsPerUnit: 10000 }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: 0.09 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: 40.01 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackRepeatMs: 24.99 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackRepeatMs: 10000.1 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackMoveMsPerUnit: -0.1 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fallbackMoveMsPerUnit: 10000.1 }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: { LI: 24, RP: 1000 / 5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerMoveMsPerUnit: { LI: -1, RP: 1000 / 6 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: Number.NaN }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecond: '5' }), false);
});

test('知らない指・方向・組のキーを持つ個人速度は保存できない', () => {
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: { XX: 200 }, fingerMoveMsPerUnit: { XX: 50 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, actionsPerSecondByDirection: { up: 5 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { 'LI:LM': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { LM: 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI:LR': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerDirectedPair: { 'LM:LI': 3 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, sameHandDifferentFingerActionsPerDirectedPair: { 'LM>RM': 3 } }), false);
});

test('予約名のキーは保存できない', () => {
  const polluted = JSON.parse('{"__proto__": 5}') as Record<string, number>;
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: polluted, fingerMoveMsPerUnit: polluted }), false);
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

test('指ごとの同じキーを続けて打つ時間と移動の時間は、持つ指の組が同じ時だけ保存できる', () => {
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: {}, fingerMoveMsPerUnit: {} }), true);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: {} }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: {}, fingerMoveMsPerUnit: { LI: 50 } }), false);
  assert.equal(isPlaybackCalibration({ ...VALID, fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: { RI: 50 } }), false);
  assert.equal(
    playbackCalibrationProblem({ ...VALID, fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: {} }),
    '指ごとの同じキーを続けて打つ時間と移動の時間の指が揃っていません',
  );
});

test('旧い形の保存値（指ごとの移動速度と同じキーを続けて打つ速さ）は保存できない', () => {
  const old: Record<string, unknown> = { ...VALID };
  for (const key of ['fingerRepeatMs', 'fingerMoveMsPerUnit', 'fallbackRepeatMs', 'fallbackMoveMsPerUnit']) delete old[key];
  old.fingerSpeedUnitsPerSecond = { LI: 8 };
  old.fallbackFingerSpeedUnitsPerSecond = 7;
  old.sameKeyActionsPerSecond = 6;
  assert.equal(isPlaybackCalibration(old), false);
});

test('指ごとの測定項目の値は、移動の時間をmax(0, I − r)/距離で求める', () => {
  // r=150ms（9間隔の中央値）、I=210ms、距離1.118u。
  const measured = fingerMeasurementFromIntervals([140, 150, 160], [200, 210, 220], 1.118);
  assert.equal(measured?.repeatMs, 150);
  assert.equal(measured?.moveMsPerUnit, (210 - 150) / 1.118);
  // 測った組と同じ距離を再生した移動の時間r+距離×mは、測った間隔の中央値Iになる。
  assert.ok(Math.abs(150 + 1.118 * measured!.moveMsPerUnit - 210) < 1e-9);
});

test('交互に打つ間隔が続けて打つ間隔以下の指は、移動の時間が0で、測れなかった指にはならない', () => {
  assert.equal(fingerMeasurementFromIntervals([150], [150], 1)?.moveMsPerUnit, 0);
  assert.equal(fingerMeasurementFromIntervals([150], [120], 1)?.moveMsPerUnit, 0);
  assert.equal(fingerMeasurementFromIntervals([150], [120], 1)?.repeatMs, 150);
});

test('指ごとの測定項目は、どちらかの間隔が無い・距離が正でない時は値を作らない', () => {
  assert.equal(fingerMeasurementFromIntervals([], [200], 1), undefined);
  assert.equal(fingerMeasurementFromIntervals([150], [], 1), undefined);
  assert.equal(fingerMeasurementFromIntervals([150], [200], 0), undefined);
  assert.equal(fingerMeasurementFromIntervals([150], [200], Number.NaN), undefined);
});

test('代表値の中央値は、移動の時間が0の指も数える', () => {
  assert.equal(medianIncludingZero([0, 0, 40]), 0);
  assert.equal(medianIncludingZero([0, 40]), 20);
  assert.equal(medianIncludingZero([]), undefined);
});

test('指の値が無い指は代表値を使う', () => {
  assert.equal(playbackRepeatMs(VALID, 'LI'), 200);
  const measured: PlaybackCalibration = { ...VALID, fingerRepeatMs: { LI: 120 }, fingerMoveMsPerUnit: { LI: 40 } };
  assert.equal(playbackRepeatMs(measured, 'LI'), 120);
  assert.equal(playbackRepeatMs({ ...VALID, fallbackRepeatMs: 170 }, 'LP'), 170);
  assert.equal(playbackMoveMsPerUnit(VALID, 'LI'), 1000 / 8);
  assert.equal(playbackMoveMsPerUnit(VALID, 'LP'), VALID.fallbackMoveMsPerUnit);
  const zero: PlaybackCalibration = { ...VALID, fingerRepeatMs: { LP: 100 }, fingerMoveMsPerUnit: { LP: 0 } };
  assert.equal(playbackMoveMsPerUnit(zero, 'LP'), 0);
});

test('続け打ちの基準の平均は、親指を除く8本の指の値（測れなかった指は代表値）を平均する', () => {
  const repeat = { LP: 100, LR: 110, LM: 120, LI: 130, RI: 140, RM: 150, RR: 160, RP: 170 } as const;
  const complete = { ...VALID, fingerRepeatMs: repeat, fingerMoveMsPerUnit: { LP: 1, LR: 1, LM: 1, LI: 1, RI: 1, RM: 1, RR: 1, RP: 1 } };
  assert.equal(meanRepeatMs(complete), 135);
  // 2本が代表値（200）になる。
  const partial = {
    ...VALID,
    fingerRepeatMs: { LP: 100, LR: 110, LM: 120, LI: 130, RI: 140, RM: 150 },
    fingerMoveMsPerUnit: { LP: 1, LR: 1, LM: 1, LI: 1, RI: 1, RM: 1 },
    fallbackRepeatMs: 200,
  };
  assert.equal(meanRepeatMs(partial), (100 + 110 + 120 + 130 + 140 + 150 + 200 + 200) / 8);
  // 親指の値は平均に入らない。
  const withThumb: PlaybackCalibration = {
    ...complete,
    fingerRepeatMs: { ...repeat, RT: 10 },
    fingerMoveMsPerUnit: { ...complete.fingerMoveMsPerUnit, RT: 1 },
  };
  assert.equal(meanRepeatMs(withThumb), 135);
});

const FINGER_ORDER = ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'] as const;

test('測る下段のキーはホームと同じ列のキーで、ロウスタッガードの人差し指はF→VとJ→Mになり、8本とも1.118uになる', () => {
  const geometry = buildGeometry('row-staggered');
  const pairs = calibrationKeyPairs(geometry);
  assert.deepEqual(
    pairs.map((pair) => pair.finger),
    [...FINGER_ORDER],
  );
  const byFinger = new Map(pairs.map((pair) => [pair.finger, pair] as const));
  assert.deepEqual([byFinger.get('LI')?.fromKey, byFinger.get('LI')?.toKey], ['f', 'v']);
  assert.deepEqual([byFinger.get('RI')?.fromKey, byFinger.get('RI')?.toKey], ['j', 'm']);
  for (const pair of pairs) assert.ok(Math.abs(pair.distance - Math.sqrt(1.25)) < 1e-9, `${pair.finger} ${pair.distance}`);
  assert.ok(Math.abs(pairs[0]!.distance - 1.118) < 1e-3);
});

test('オーソリニアとカラムスタッガードの測る組は、8本とも1.0uになる', () => {
  for (const shape of ['ortholinear', 'column-staggered'] as const) {
    const pairs = calibrationKeyPairs(buildGeometry(shape));
    assert.equal(pairs.length, 8, shape);
    for (const pair of pairs) assert.ok(Math.abs(pair.distance - 1) < 1e-9, `${shape} ${pair.finger} ${pair.distance}`);
  }
});

test('ホームの下段のキーに刻印が無い指は、別の下段のキーで代わりにせず、組を作らない', () => {
  const geometry = buildGeometry('row-staggered');
  const eligible = new Set(calibrationEligibleKeyIds(geometry));
  eligible.delete('v');
  const pairs = calibrationKeyPairs(geometry, eligible);
  assert.deepEqual(
    pairs.map((pair) => pair.finger),
    FINGER_ORDER.filter((finger) => finger !== 'LI'),
  );
  // ホームキーに刻印が無い指も組を作らない。
  eligible.delete('j');
  assert.deepEqual(
    calibrationKeyPairs(geometry, eligible).map((pair) => pair.finger),
    FINGER_ORDER.filter((finger) => finger !== 'LI' && finger !== 'RI'),
  );
});

test('ホームと同じ列の下段のキーがほかの指の担当なら、その指は組を作らない', () => {
  const base = assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, undefined);
  // vを左の中指の担当にする。
  const assignment = { ...base, baseFinger: { ...base.baseFinger, v: 'LM' as const } };
  const geometry = buildGeometry('row-staggered', assignment);
  assert.equal(geometry.keys.get('v')?.finger, 'LM');
  assert.deepEqual(
    calibrationKeyPairs(geometry).map((pair) => pair.finger),
    FINGER_ORDER.filter((finger) => finger !== 'LI'),
  );
});

test('かなの中・かなの境目の値は、分けない値を持たなくても、範囲の中なら保存できる', () => {
  const sides = {
    'arpeggio-within': -1000,
    'arpeggio-boundary': 1000,
    'chain-within': 0,
    'chain-boundary': 12.5,
    'other-within': 30,
    'other-boundary': 90,
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
  assert.equal(playbackCalibrationProblem({ ...VALID, keystrokeOverheadMs: { 'other-within': 2000 } }), '打鍵の上乗せが正しくありません');
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

test('押下の照合は、event.keyの経路に加えて、Testerと同じ対応で引いたキーのidの経路でも一致する', () => {
  // 配列の文字（き）と合わず、event.codeの標準の表にも無い押下は、physicalKeyの経路だけで一致する
  assert.equal(calibrationKeyMatches({ key: '\\', code: 'IntlRo' }, 'caps-lock', 'き'), false);
  assert.equal(calibrationKeyMatches({ key: '\\', code: 'IntlRo', physicalKey: 'caps-lock' }, 'caps-lock', 'き'), true);
  assert.equal(calibrationKeyMatches({ key: '\\', code: 'IntlRo', physicalKey: 'r3c10' }, 'caps-lock', 'き'), false);
  // 今の経路は残る
  assert.equal(calibrationKeyMatches({ key: 'き', code: 'KeyA' }, 'caps-lock', 'き'), true);
  assert.equal(calibrationKeyMatches({ key: 'F', code: 'KeyF' }, 'f'), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_FINGERS,
  buildGeometry,
  type Finger,
  type Key,
  type Point,
} from '#input/shapes/geometry.ts';
import type { Press, Stroke } from '#trace/generate.ts';
import type { PlaybackCalibration } from './calibration.ts';
import {
  playbackKeystrokeOverheadMs,
  playbackNormalMs,
  playbackStepDurationMs,
  playbackTimingSchedule,
  type PlaybackTimingAnalysis,
} from './playback.ts';

const geometry = buildGeometry('row-staggered');

const at = (finger: Finger, dx = 0, dy = 0): Point => ({
  x: geometry.homes[finger].x + dx,
  y: geometry.homes[finger].y + dy,
});

const press = (finger: Finger, point: Point, sfb = false, distance = 0): Press => {
  const key: Key = { id: `k-${finger}`, finger, x: point.x, y: point.y, row: 2, col: 0 };
  return {
    finger,
    keys: [key],
    target: point,
    origin: { at: point, from: 'home' },
    gap: 1,
    distance,
    sfb,
  };
};

const stroke = (index: number, p: Press): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  selectionIndex: index,
  aggregationGroupId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [{
    hand: p.finger.startsWith('L') ? 'left' : 'right',
    finger: p.finger,
    keys: p.keys,
    roles: ['output'],
  }],
  presses: [p],
  distance: p.distance,
  positions: Object.fromEntries(
    ALL_FINGERS.map((finger) => [finger, finger === p.finger ? { ...p.target } : { ...geometry.homes[finger] }]),
  ) as Stroke['positions'],
});

const range = (startStrokeIndex: number, endStrokeIndex: number) => ({ startStrokeIndex, endStrokeIndex });

/** 左右の人差し指を交互に打つ列（すべて異手の遷移）。通常速度5/秒なら `normalMs` は200。 */
function alternating(
  count: number,
  chains: readonly ReturnType<typeof range>[] = [],
  arpeggioSpans: readonly ReturnType<typeof range>[] = [],
): PlaybackTimingAnalysis {
  const strokes = Array.from({ length: count }, (_, index) =>
    stroke(index, press(index % 2 === 0 ? 'LI' : 'RI', at(index % 2 === 0 ? 'LI' : 'RI'))));
  return { strokes, transitions: [], chains, arpeggioSpans } as unknown as PlaybackTimingAnalysis;
}

const BASE: PlaybackCalibration = {
  actionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerSpeedUnitsPerSecond: {},
  fallbackFingerSpeedUnitsPerSecond: 10,
  measuredAt: 1,
};

const withOverhead = (keystrokeOverheadMs: PlaybackCalibration['keystrokeOverheadMs']): PlaybackCalibration =>
  ({ ...BASE, keystrokeOverheadMs });

const durations = (analysis: PlaybackTimingAnalysis, calibration: PlaybackCalibration, sameFingerDelay = false, multiplier = 1) =>
  analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 1, sameFingerDelay, calibration, multiplier));

test('1打ごとの上乗せを持たない保存値は、上乗せの項目が無くても空でも時間が変わらない', () => {
  const analysis = alternating(5, [range(0, 5)], [range(1, 4)]);
  const expected = [200, 200, 200, 200, 200];
  assert.deepEqual(durations(analysis, BASE), expected);
  assert.deepEqual(durations(analysis, withOverhead(undefined)), expected);
  assert.deepEqual(durations(analysis, withOverhead({})), expected);
});

test('上乗せは遷移が属する構造の種類で選ぶ', () => {
  // 遷移0→1・1→2はChain、2→3・3→4はArpeggio、最初のステップと4→5はその他。
  const analysis = alternating(6, [range(0, 3)], [range(2, 5)]);
  const calibration = withOverhead({ arpeggio: 10, chain: 30, other: 70 });
  assert.deepEqual(durations(analysis, calibration), [270, 230, 230, 210, 210, 270]);
});

test('種類の値が無ければ「その他」の値を使い、「その他」も無ければ上乗せしない', () => {
  const analysis = alternating(6, [range(0, 3)], [range(2, 5)]);
  assert.deepEqual(durations(analysis, withOverhead({ other: 70 })), [270, 270, 270, 270, 270, 270]);
  assert.deepEqual(durations(analysis, withOverhead({ arpeggio: 10 })), [200, 200, 200, 210, 210, 200]);
});

test('同指連続を含まないステップは(normalMs + o) / multiplierになる', () => {
  const analysis = alternating(3);
  const calibration = withOverhead({ other: 30 });
  assert.deepEqual(durations(analysis, calibration, true, 2), [115, 115, 115]);
  assert.deepEqual(durations(analysis, calibration, false, 0.5), [460, 460, 460]);
});

function withSameFinger(distance: number): PlaybackTimingAnalysis {
  const first = stroke(0, press('LI', at('LI')));
  const second = stroke(1, press('LI', at('LI', 0, distance), true, distance));
  return { strokes: [first, second], transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
}

test('同指連続はmax(normalMs + o, movementMs) / multiplierで、移動が律速する時は上乗せの分だけ遅くならない', () => {
  // 移動速度10u/秒、距離3uならmovementMsは300で、normalMsにoを足した250より長い。
  const far = withSameFinger(3);
  const calibration = withOverhead({ other: 50 });
  assert.equal(playbackStepDurationMs(far, 1, 1, true, BASE, 2), 150);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 2), 150);
});

test('同指連続は、normalMsにoを足した値が移動の時間より長ければ上乗せが入る', () => {
  // 距離2uならmovementMsは200。上乗せ無しではnormalMs（200）と同じで、上乗せ50で250になる。
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, BASE, 2), 100);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50 }), 2), 125);
});

test('同指連続の移動を考慮しない設定でも、上乗せは(normalMs + o) / multiplierで入る', () => {
  const far = withSameFinger(3);
  assert.equal(playbackStepDurationMs(far, 1, 1, false, withOverhead({ other: 50 }), 2), 125);
});

test('全指の移動時間（§3.8のmove）には上乗せを足さない', () => {
  // 2打目は、1打目と同じ指が3u離れたキーへ動く。移動速度10u/秒なのでmoveは300。
  const strokes = [
    stroke(0, press('LI', at('LI'))),
    stroke(1, press('LI', at('LI', 3))),
  ];
  const analysis = { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  const options = { allFingerMovementDelay: true, geometry };
  const lengthOf = (calibration: PlaybackCalibration) => {
    const step = playbackTimingSchedule(analysis, 1, false, calibration, 1, options)[1];
    return step.endMs - step.startMs;
  };
  assert.equal(lengthOf(BASE), 300);
  // normalMsにoを足した250はmoveより短いので、2打目はmoveのまま。上乗せがmoveに入るなら350になる。
  assert.equal(lengthOf(withOverhead({ other: 50 })), 300);
  // normalMs + o = 350がmoveを超えると、基準の時間が律速する。
  assert.equal(lengthOf(withOverhead({ other: 150 })), 350);
});

test('上乗せを選ぶ関数と、上乗せを引く側のnormalMsは、上乗せの有無に影響されない', () => {
  const analysis = alternating(3, [range(0, 3)], []);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead({ chain: 12, other: 3 })), 12);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 0, withOverhead({ chain: 12, other: 3 })), 3);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, undefined), 0);
  assert.equal(playbackNormalMs(analysis, 1, BASE), 200);
  assert.equal(playbackNormalMs(analysis, 1, withOverhead({ other: 99 })), 200);
});

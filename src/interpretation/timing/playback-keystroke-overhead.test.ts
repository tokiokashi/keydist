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

test('連打との差を持たない保存値は、連打との差の項目が無くても空でも時間が変わらない', () => {
  const analysis = alternating(5, [range(0, 5)], [range(1, 4)]);
  const expected = [200, 200, 200, 200, 200];
  assert.deepEqual(durations(analysis, BASE), expected);
  assert.deepEqual(durations(analysis, withOverhead(undefined)), expected);
  assert.deepEqual(durations(analysis, withOverhead({})), expected);
});

test('連打との差は遷移が属する構造の種類で選ぶ', () => {
  // 遷移0→1・1→2はChain、2→3・3→4はArpeggio、最初のステップと4→5はその他。
  const analysis = alternating(6, [range(0, 3)], [range(2, 5)]);
  const calibration = withOverhead({ arpeggio: 10, chain: 30, other: 70 });
  assert.deepEqual(durations(analysis, calibration), [270, 230, 230, 210, 210, 270]);
});

test('種類の値が無ければ「その他」の値を使い、「その他」も無ければ連打との差を足さない', () => {
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
  const moved = press('LI', at('LI', 0, distance), true, distance);
  // 離れたキーなので、1打目とキーのidが違う。
  const second = stroke(1, { ...moved, keys: [{ ...moved.keys[0], id: 'k-LI-moved' }] });
  return { strokes: [first, second], transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
}

test('同指連続はmax(normalMs + o, movementMs) / multiplierで、移動が律速する時は連打との差の分だけ遅くならない', () => {
  // 移動速度10u/秒、距離3uならmovementMsは300で、normalMsにoを足した250より長い。
  const far = withSameFinger(3);
  const calibration = withOverhead({ other: 50 });
  assert.equal(playbackStepDurationMs(far, 1, 1, true, BASE, 2), 150);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 2), 150);
});

test('同指連続は、normalMsにoを足した値が移動の時間より長ければ連打との差が入る', () => {
  // 距離2uならmovementMsは200。連打との差が無ければnormalMs（200）と同じで、連打との差が50なら250になる。
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, BASE, 2), 100);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50 }), 2), 125);
});

test('同指連続の移動を考慮しない設定でも、連打との差は(normalMs + o) / multiplierで入る', () => {
  const far = withSameFinger(3);
  assert.equal(playbackStepDurationMs(far, 1, 1, false, withOverhead({ other: 50 }), 2), 125);
});

test('全指の移動時間（§3.8のmove）には連打との差を足さない', () => {
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
  // normalMsにoを足した250はmoveより短いので、2打目はmoveのまま。連打との差がmoveに入るなら350になる。
  assert.equal(lengthOf(withOverhead({ other: 50 })), 300);
  // normalMs + o = 350がmoveを超えると、基準の時間が律速する。
  assert.equal(lengthOf(withOverhead({ other: 150 })), 350);
});

test('連打との差を選ぶ関数と、連打との差を引く側のnormalMsは、連打との差の有無に影響されない', () => {
  const analysis = alternating(3, [range(0, 3)], []);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead({ chain: 12, other: 3 })), 12);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 0, withOverhead({ chain: 12, other: 3 })), 3);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, undefined), 0);
  assert.equal(playbackNormalMs(analysis, 1, BASE), 200);
  assert.equal(playbackNormalMs(analysis, 1, withOverhead({ other: 99 })), 200);
});

/** 同じ指で同じキーを続けて打つ列。最初のステップを除いて、すべて続け打ち。 */
function repeating(count: number, chains: readonly ReturnType<typeof range>[] = []): PlaybackTimingAnalysis {
  const strokes = Array.from({ length: count }, (_, index) => stroke(index, press('LI', at('LI'))));
  return { strokes, transitions: [], chains, arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
}

const withSameKey = (sameKeyActionsPerSecond: number, keystrokeOverheadMs?: PlaybackCalibration['keystrokeOverheadMs']): PlaybackCalibration =>
  ({ ...BASE, sameKeyActionsPerSecond, ...(keystrokeOverheadMs === undefined ? {} : { keystrokeOverheadMs }) });

test('続け打ちの基準は、同じキーを続けて打つ速さ。持たない保存値では通常速度', () => {
  const analysis = repeating(3);
  // 通常速度は5アクション/秒（200ms）、同じキーを続けて打つ速さは8アクション/秒（125ms）。最初のステップは遷移が無いので通常速度。
  assert.deepEqual(durations(analysis, withSameKey(8)), [200, 125, 125]);
  assert.deepEqual(durations(analysis, BASE), [200, 200, 200]);
  assert.equal(playbackNormalMs(analysis, 1, withSameKey(8)), 125);
  assert.equal(playbackNormalMs(analysis, 1, BASE), 200);
  // 倍率は最後に掛かる。
  assert.deepEqual(durations(analysis, withSameKey(8), false, 2), [100, 62.5, 62.5]);
});

test('個人速度が無い時は、同じキーを続けて打つ速さを持つ保存値でも基準速度で決まる', () => {
  const analysis = repeating(3);
  assert.deepEqual(analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 4, false, undefined, 1)), [250, 250, 250]);
});

test('異手・同手別指の遷移と、押下を複数持つストロークの同じ形の繰り返しは、同じキーを続けて打つ速さを使わない', () => {
  const calibration: PlaybackCalibration = {
    ...withSameKey(8),
    actionsPerSecondByDirection: { 'L→R': 10, 'R→L': 20 },
    sameHandDifferentFingerActionsPerSecond: 2.5,
  };
  // 異手の交互打鍵: L→Rは100ms、R→Lは50ms。
  assert.deepEqual(durations(alternating(3), calibration), [200, 100, 50].map((ms, index) => (index === 0 ? 200 : ms)));
  // 左右の人差し指を同時に押すストロークを続ける。押下を複数持つので続け打ちにならず、異手の判定のまま。
  const both = (index: number) => ({
    ...stroke(index, press('LI', at('LI'))),
    presses: [press('LI', at('LI')), press('RI', at('RI'))],
  });
  const chord = { strokes: [both(0), both(1), both(2)], transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  assert.equal(playbackStepDurationMs(chord, 1, 1, false, calibration, 1), 50);
  // 同じ指で別のキーを同指連続でなく打つ（キーのidが違う）ステップも、続け打ちにならず通常速度。
  const differentKey = (index: number) => {
    const base = stroke(index, press('LI', at('LI')));
    return { ...base, presses: [{ ...base.presses[0], keys: [{ ...base.presses[0].keys[0], id: `k-${index}` }] }] };
  };
  const other = { strokes: [differentKey(0), differentKey(1)], transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  assert.equal(playbackStepDurationMs(other, 1, 1, false, calibration, 1), 200);
});

test('続け打ちのステップのoは、続け打ちの値、無ければ0（同じキーを続けて打つ速さを持つ時）、どちらも無ければ構造の種類の値', () => {
  const analysis = repeating(4, [range(0, 4)]);
  const structure = { chain: 30, other: 70 } as const;
  // 続け打ちの値を持つ時は、その値（構造の種類の値は使わない）。
  assert.deepEqual(durations(analysis, withSameKey(8, { ...structure, repeat: 9 })), [270, 134, 134, 134]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withSameKey(8, { ...structure, repeat: 9 })), 9);
  // 続け打ちの値を持たず、同じキーを続けて打つ速さを持つ時は0。基準がその動きを測った値で、他の種類の差は別の基準から求めた差。
  assert.deepEqual(durations(analysis, withSameKey(8, structure)), [270, 125, 125, 125]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withSameKey(8, structure)), 0);
  // どちらも持たない時は、今と同じく構造の種類の値。遷移はChainに入る。
  assert.deepEqual(durations(analysis, withOverhead(structure)), [270, 230, 230, 230]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead(structure)), 30);
  // 続け打ちの値だけを持つ保存値で、同じキーを続けて打つ速さを持たなければ、基準は通常速度で、値が足される。
  assert.deepEqual(durations(analysis, withOverhead({ repeat: 9 })), [200, 209, 209, 209]);
});

test('続け打ちの値は、続け打ちのステップだけに足す', () => {
  // 左右の人差し指を交互に打ち、途中で右を2回続ける。続け打ちのステップは4だけ。
  const fingers: Finger[] = ['LI', 'RI', 'LI', 'RI', 'RI', 'LI'];
  const strokes = fingers.map((finger, index) => stroke(index, press(finger, at(finger))));
  const analysis = { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  assert.deepEqual(durations(analysis, withSameKey(8, { repeat: 9, other: 40 })), [240, 240, 240, 240, 134, 240]);
});

test('同指連続の値を持つ保存値は、max(normalMs, movementMs)+sを倍率で割る', () => {
  // 移動速度10u/秒、距離3uならmovementMsは300、距離2uなら200、距離1uなら100。normalMsは200。
  const far = withSameFinger(3);
  const near = withSameFinger(2);
  const short = withSameFinger(1);
  const calibration = withOverhead({ sfb: 40 });
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 1), 340);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, calibration, 1), 240);
  assert.equal(playbackStepDurationMs(short, 1, 1, true, calibration, 1), 240);
  // 倍率は足した後に掛かる。
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 2), 170);
  // 移動の時間が律速する同指連続にも、sが足される。
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ other: 50, sfb: 10 }), 1), 310);
  // 構造の種類の値はsfbのステップに足されない（sがあるので、normalMs側のoは使わない）。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50, sfb: 10 }), 1), 210);
});

test('同指連続の値を持たない保存値は、今のmax(normalMs + o, movementMs)のまま', () => {
  const far = withSameFinger(3);
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ other: 50, repeat: 5 }), 1), 300);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50, repeat: 5 }), 1), 250);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withSameKey(8, { other: 50 }), 1), 250);
});

test('sameFingerDelayが偽の時、同指連続のステップは構造の種類の値になり、同指連続の値は使わない', () => {
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(near, 1, 1, false, withOverhead({ other: 50, sfb: 10 }), 1), 250);
  assert.equal(playbackStepDurationMs(near, 1, 1, false, withOverhead({ sfb: 10 }), 1), 200);
});

test('個人速度が無い時は、同指連続の値があっても使わない', () => {
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, undefined, 1), 2000);
});

test('全指の移動時間（§3.8のmove）には同指連続の値も足さない', () => {
  const strokes = [
    stroke(0, press('LI', at('LI'))),
    stroke(1, press('LI', at('LI', 3), true, 3)),
  ];
  const analysis = { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  const options = { allFingerMovementDelay: true, geometry };
  const lengthOf = (calibration: PlaybackCalibration) => {
    const step = playbackTimingSchedule(analysis, 1, true, calibration, 1, options)[1];
    return step.endMs - step.startMs;
  };
  // 基準の時間はmax(200, 300) + s。moveは300なので、sが足されて基準の時間が長くなった分だけ長くなる。
  assert.equal(lengthOf(BASE), 300);
  assert.equal(lengthOf(withOverhead({ sfb: 40 })), 340);
});

test('同指連続の値と続け打ちの値を持たない保存値は、時間が変わらない', () => {
  // 構造の種類の3つの値だけを持つ保存値で、続け打ち・同指連続・押下を複数持つ列を含むテキストの時間が、
  // 同じ保存値から新しい項目を除いた時間と一致する。
  const legacy = withOverhead({ arpeggio: 10, chain: 30, other: 70 });
  const sequences = [alternating(6, [range(0, 3)], [range(2, 5)]), withSameFinger(2), withSameFinger(3), repeating(4, [range(0, 4)])];
  for (const analysis of sequences) {
    for (const sameFingerDelay of [true, false]) {
      const expected = analysis.strokes.map((_, index) => {
        const o = playbackKeystrokeOverheadMs(analysis, index, legacy);
        const normal = playbackNormalMs(analysis, index, legacy);
        const stroke = analysis.strokes[index];
        const movement = Math.max(0, ...stroke.presses.filter((p) => p.sfb).map((p) => (p.distance / 10) * 1000));
        return sameFingerDelay && stroke.presses.some((p) => p.sfb) ? Math.max(normal + o, movement) : normal + o;
      });
      assert.deepEqual(durations(analysis, legacy, sameFingerDelay), expected);
    }
  }
});

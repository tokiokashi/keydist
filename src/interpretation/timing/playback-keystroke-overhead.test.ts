import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_FINGERS,
  buildGeometry,
  type Finger,
  type Key,
  type Point,
} from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { generateTrace, type Press, type Stroke } from '#trace/generate.ts';
import type { PlaybackCalibration } from './calibration.ts';
import {
  playbackFingerMoveMs,
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
  kanaStart: index,
  kanaEnd: index,
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
  fingerRepeatMs: {},
  fingerMoveMsPerUnit: {},
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 10,
  measuredAt: 1,
};

const withOverhead = (keystrokeOverheadMs: PlaybackCalibration['keystrokeOverheadMs']): PlaybackCalibration =>
  ({ ...BASE, keystrokeOverheadMs });

const durations = (analysis: PlaybackTimingAnalysis, calibration: PlaybackCalibration, sameFingerDelay = false, multiplier = 1) =>
  analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 1, sameFingerDelay, calibration, multiplier));

test('打鍵の上乗せを持たない保存値は、打鍵の上乗せの項目が無くても空でも時間が変わらない', () => {
  const analysis = alternating(5, [range(0, 5)], [range(1, 4)]);
  const expected = [200, 200, 200, 200, 200];
  assert.deepEqual(durations(analysis, BASE), expected);
  assert.deepEqual(durations(analysis, withOverhead(undefined)), expected);
  assert.deepEqual(durations(analysis, withOverhead({})), expected);
});

test('打鍵の上乗せは遷移が属する構造の種類で選ぶ', () => {
  // 遷移0→1・1→2はChain、2→3・3→4はArpeggio、最初のステップと4→5はその他。
  const analysis = alternating(6, [range(0, 3)], [range(2, 5)]);
  const calibration = withOverhead({ arpeggio: 10, chain: 30, other: 70 });
  assert.deepEqual(durations(analysis, calibration), [270, 230, 230, 210, 210, 270]);
});

test('種類の値が無ければ「その他」の値を使い、「その他」も無ければ打鍵の上乗せを足さない', () => {
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

test('同指連続はmax(normalMs + o, movementMs) / multiplierで、移動が律速する時は打鍵の上乗せの分だけ遅くならない', () => {
  // 続け打ちの時間200ms・1uあたり100msなら、距離3uのmovementMsは500で、normalMsにoを足した250より長い。
  const far = withSameFinger(3);
  const calibration = withOverhead({ other: 50 });
  assert.equal(playbackStepDurationMs(far, 1, 1, true, BASE, 2), 250);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 2), 250);
});

test('同指連続は、normalMsにoを足した値が移動の時間より長ければ打鍵の上乗せが入る', () => {
  // 1uあたり10msなら距離2uのmovementMsは220。打鍵の上乗せが無ければ220、打鍵の上乗せが50ならnormalMsに足した250になる。
  const near = withSameFinger(2);
  const slight = { ...BASE, fallbackMoveMsPerUnit: 10 };
  assert.equal(playbackStepDurationMs(near, 1, 1, true, slight, 2), 110);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, { ...slight, keystrokeOverheadMs: { other: 50 } }, 2), 125);
});

test('同指連続の移動を考慮しない設定でも、打鍵の上乗せは(normalMs + o) / multiplierで入る', () => {
  const far = withSameFinger(3);
  assert.equal(playbackStepDurationMs(far, 1, 1, false, withOverhead({ other: 50 }), 2), 125);
});

test('全指の移動時間（§3.8のmove）には打鍵の上乗せを足さない', () => {
  // 2打目は、1打目と同じ指が3u離れたキーへ動く。1uあたり100msなのでmoveは300（続け打ちの時間は足さない）。
  const strokes = [
    stroke(0, press('LI', at('LI'))),
    // 別のキーを打つ（同じキーなら続け打ちになり、構造の種類の値を使わない）。
    stroke(1, (() => {
      const moved = press('LI', at('LI', 3));
      return { ...moved, keys: [{ ...moved.keys[0], id: 'k-LI-moved' }] };
    })()),
  ];
  const analysis = { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  const options = { allFingerMovementDelay: true, geometry };
  const lengthOf = (calibration: PlaybackCalibration) => {
    const step = playbackTimingSchedule(analysis, 1, false, calibration, 1, options)[1];
    return step.endMs - step.startMs;
  };
  assert.equal(lengthOf(BASE), 300);
  // normalMsにoを足した250はmoveより短いので、2打目はmoveのまま。打鍵の上乗せがmoveに入るなら350になる。
  assert.equal(lengthOf(withOverhead({ other: 50 })), 300);
  // normalMs + o = 350がmoveを超えると、ステップの時間が律速する。
  assert.equal(lengthOf(withOverhead({ other: 150 })), 350);
});

test('打鍵の上乗せを選ぶ関数と、打鍵の上乗せを引く側のnormalMsは、打鍵の上乗せの有無に影響されない', () => {
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

const withRepeat = (repeatMs: number, keystrokeOverheadMs?: PlaybackCalibration['keystrokeOverheadMs']): PlaybackCalibration =>
  ({
    ...BASE,
    fingerRepeatMs: { LI: repeatMs },
    fingerMoveMsPerUnit: { LI: 100 },
    ...(keystrokeOverheadMs === undefined ? {} : { keystrokeOverheadMs }),
  });

test('続け打ちの基準は、その指の続け打ちの時間。測っていない指は代表値', () => {
  const analysis = repeating(3);
  // 代表値は200ms、LIの続け打ちの時間は125ms。最初のステップは遷移が無いので通常速度。
  assert.deepEqual(durations(analysis, withRepeat(125)), [200, 125, 125]);
  assert.deepEqual(durations(analysis, BASE), [200, 200, 200]);
  assert.equal(playbackNormalMs(analysis, 1, withRepeat(125)), 125);
  assert.equal(playbackNormalMs(analysis, 1, BASE), 200);
  // 倍率は最後に掛かる。
  assert.deepEqual(durations(analysis, withRepeat(125), false, 2), [100, 62.5, 62.5]);
});

test('個人速度が無い時は、続け打ちの時間があっても基準速度で決まる', () => {
  const analysis = repeating(3);
  assert.deepEqual(analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 4, false, undefined, 1)), [250, 250, 250]);
});

test('異手・同手別指の遷移と、押下を複数持つストロークの同じ形の繰り返しは、続け打ちの時間を使わない', () => {
  const calibration: PlaybackCalibration = {
    ...withRepeat(125),
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

test('続け打ちのステップのoは、続け打ちの値、無ければ0で、構造の種類の値は使わない', () => {
  const analysis = repeating(4, [range(0, 4)]);
  const structure = { chain: 30, other: 70 } as const;
  // 続け打ちの値を持つ時は、その値。
  assert.deepEqual(durations(analysis, withRepeat(125, { ...structure, repeat: 9 })), [270, 134, 134, 134]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withRepeat(125, { ...structure, repeat: 9 })), 9);
  // 続け打ちの値を持たない時は0。基準がその動きを測った値で、他の種類の差は別の基準から求めた差。
  assert.deepEqual(durations(analysis, withRepeat(125, structure)), [270, 125, 125, 125]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withRepeat(125, structure)), 0);
  // 指ごとの続け打ちの時間を持たない保存値でも同じ。基準は代表値になる。
  assert.deepEqual(durations(analysis, withOverhead(structure)), [270, 200, 200, 200]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead(structure)), 0);
  assert.deepEqual(durations(analysis, withOverhead({ repeat: 9 })), [200, 209, 209, 209]);
});

test('続け打ちの値は、続け打ちのステップだけに足す', () => {
  // 左右の人差し指を交互に打ち、途中で右を2回続ける。続け打ちのステップは4だけ。
  const fingers: Finger[] = ['LI', 'RI', 'LI', 'RI', 'RI', 'LI'];
  const strokes = fingers.map((finger, index) => stroke(index, press(finger, at(finger))));
  const analysis = { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  const calibration = { ...BASE, fingerRepeatMs: { RI: 125 }, fingerMoveMsPerUnit: { RI: 100 }, keystrokeOverheadMs: { repeat: 9, other: 40 } };
  assert.deepEqual(durations(analysis, calibration), [240, 240, 240, 240, 134, 240]);
});

test('同指連続の値を持つ保存値は、max(normalMs, movementMs)+sを倍率で割る', () => {
  // 続け打ちの時間200ms・1uあたり100msなら、movementMsは距離3uで500、2uで400、1uで300。normalMsは200。
  const far = withSameFinger(3);
  const near = withSameFinger(2);
  const short = withSameFinger(1);
  const calibration = withOverhead({ sfb: 40 });
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 1), 540);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, calibration, 1), 440);
  assert.equal(playbackStepDurationMs(short, 1, 1, true, calibration, 1), 340);
  // 倍率は足した後に掛かる。
  assert.equal(playbackStepDurationMs(far, 1, 1, true, calibration, 2), 270);
  // 移動の時間が律速する同指連続にも、sが足される。
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ other: 50, sfb: 10 }), 1), 510);
  // 構造の種類の値はsfbのステップに足されない（sがあるので、normalMs側のoは使わない）。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50, sfb: 10 }), 1), 410);
});

test('同指連続の値を持たない保存値は、今のmax(normalMs + o, movementMs)のまま', () => {
  const far = withSameFinger(3);
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ other: 50, repeat: 5 }), 1), 500);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: 50, repeat: 5 }), 1), 400);
  // 1uあたり10msなら、距離2uの移動の時間は220で、normalMsにoを足した250が長い。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, { ...BASE, fallbackMoveMsPerUnit: 10, keystrokeOverheadMs: { other: 50 } }, 1), 250);
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
  // ステップの時間はmax(200, 500) + s。moveは300（続け打ちの時間を含まない）なので、ステップの時間が律速する。
  assert.equal(lengthOf(BASE), 500);
  assert.equal(lengthOf(withOverhead({ sfb: 40 })), 540);
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
        const movement = Math.max(0, ...stroke.presses.filter((p) => p.sfb).map((p) => 200 + p.distance * 100));
        return sameFingerDelay && stroke.presses.some((p) => p.sfb) ? Math.max(normal + o, movement) : normal + o;
      });
      assert.deepEqual(durations(analysis, legacy, sameFingerDelay), expected);
    }
  }
});

test('負の打鍵の上乗せを足した時間は、25ms（保存値が許す最も速い1打の時間）より短くならず、倍率で割る前に当たる', () => {
  // normalMsは200。
  const analysis = alternating(3);
  assert.deepEqual(durations(analysis, withOverhead({ other: -100 })), [100, 100, 100]);
  assert.deepEqual(durations(analysis, withOverhead({ other: -175 })), [25, 25, 25]);
  assert.deepEqual(durations(analysis, withOverhead({ other: -190 })), [25, 25, 25]);
  assert.deepEqual(durations(analysis, withOverhead({ other: -1000 })), [25, 25, 25]);
  // 倍率で割る前に下限を当てるので、倍率2なら12.5ms、0.5なら50ms。
  assert.deepEqual(durations(analysis, withOverhead({ other: -190 }), false, 2), [12.5, 12.5, 12.5]);
  assert.deepEqual(durations(analysis, withOverhead({ other: -190 }), false, 0.5), [50, 50, 50]);
});

test('同指連続の式でも、上乗せを足した時間は25msより短くならない', () => {
  const far = withSameFinger(3);
  const near = withSameFinger(2);
  // sを持たない式: max(normalMs + o, movementMs)。normalMs + oが25msに当たっても、移動の時間が長ければ移動の時間になる。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ other: -190 }), 1), 400);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ other: -190 }), 1), 500);
  // sを持つ式: max(normalMs, movementMs) + s。movementMsは距離2uで400、3uで500。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ sfb: -100 }), 1), 300);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ sfb: -400 }), 1), 25);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ sfb: -500 }), 1), 25);
  assert.equal(playbackStepDurationMs(far, 1, 1, true, withOverhead({ sfb: -1000 }), 2), 12.5);
  // 移動を考慮しない設定の同指連続のステップは、構造の種類の式。
  assert.equal(playbackStepDurationMs(near, 1, 1, false, withOverhead({ other: -190 }), 1), 25);
});

test('上乗せが全て0以上の保存値は、下限があっても時間が変わらない', () => {
  const analysis = alternating(3);
  assert.deepEqual(durations(analysis, withOverhead({ other: 0 })), [200, 200, 200]);
  assert.deepEqual(durations(analysis, withOverhead({ other: 1000 })), [1200, 1200, 1200]);
  const near = withSameFinger(2);
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ sfb: 0 }), 1), 400);
});

/** 入力単位を付け替えた解析結果。構造と指はそのまま。 */
function withInputIndex(analysis: PlaybackTimingAnalysis, inputIndexOf: (index: number) => number): PlaybackTimingAnalysis {
  return { ...analysis, strokes: analysis.strokes.map((item, index) => ({ ...item, inputIndex: inputIndexOf(index) })) };
}

/** 2打ずつが1つの入力単位。奇数番のステップがかなの中、偶数番のステップがかなの境目。 */
const pairedUnits = (analysis: PlaybackTimingAnalysis) => withInputIndex(analysis, (index) => Math.floor(index / 2));

test('かなの中・かなの境目の値は、ステップが前と同じ入力単位を打つかで選び、最初のステップはかなの境目になる', () => {
  // 全てその他。ステップ0は直前が無いのでかなの境目、1・3・5はかなの中、2・4はかなの境目。
  const analysis = pairedUnits(alternating(6));
  const calibration = withOverhead({ 'other-within': 10, 'other-boundary': 70 });
  assert.deepEqual(durations(analysis, calibration), [270, 210, 270, 210, 270, 210]);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 0, calibration), 70);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, calibration), 10);
});

test('値が無い時は、同じ側のその他、その種類の分けない値、その他の分けない値、0の順に使う', () => {
  // ステップ1,2はChain（1はかなの中、2はかなの境目）、ステップ3,4はArpeggio（3はかなの中、4はかなの境目）。
  const analysis = pairedUnits(alternating(5, [range(0, 3)], [range(2, 5)]));
  const overheadAt = (index: number, values: NonNullable<PlaybackCalibration['keystrokeOverheadMs']>) =>
    playbackKeystrokeOverheadMs(analysis, index, withOverhead(values));
  const all = {
    'chain-within': 1, 'chain-boundary': 2, 'other-within': 3, 'other-boundary': 4,
    chain: 5, arpeggio: 6, other: 7,
  };
  // 同じ側のその種類の値が最優先。
  assert.equal(overheadAt(1, all), 1);
  assert.equal(overheadAt(2, all), 2);
  // その種類の同じ側の値が無ければ、同じ側のその他の値。
  const { 'chain-within': _within, 'chain-boundary': _boundary, ...noChainSides } = all;
  assert.equal(overheadAt(1, noChainSides), 3);
  assert.equal(overheadAt(2, noChainSides), 4);
  // 同じ側のどれも無ければ、その種類の分けない値。反対側の値は使わない。
  const onlyOtherSides = { 'other-boundary': 4, chain: 5, arpeggio: 6, other: 7 };
  assert.equal(overheadAt(1, onlyOtherSides), 5);
  assert.equal(overheadAt(2, onlyOtherSides), 4);
  assert.equal(overheadAt(3, onlyOtherSides), 6);
  // その種類の分けない値も無ければ、その他の分けない値。
  assert.equal(overheadAt(1, { 'other-boundary': 4, other: 7 }), 7);
  assert.equal(overheadAt(4, { arpeggio: 6, 'other-within': 3 }), 6);
  // どれも無ければ0。
  assert.equal(overheadAt(1, { 'other-boundary': 4, 'chain-boundary': 2 }), 0);
  assert.equal(overheadAt(1, {}), 0);
});

test('分けない値を持たず、かなの中・かなの境目の値だけを持つ保存値も、再生の時間が決まる', () => {
  const analysis = pairedUnits(alternating(4));
  assert.deepEqual(durations(analysis, withOverhead({ 'other-within': 10, 'other-boundary': 70 })), [270, 210, 270, 210]);
  assert.deepEqual(durations(analysis, withOverhead({ 'other-within': 10 })), [200, 210, 200, 210]);
});

test('かなの中・かなの境目の値を持たない保存値の時間は、入力単位の分け方によらず変わらない', () => {
  const calibration = withOverhead({ arpeggio: 10, chain: 30, other: 70 });
  const plain = alternating(6, [range(0, 3)], [range(2, 5)]);
  const expected = [270, 230, 230, 210, 210, 270];
  assert.deepEqual(durations(plain, calibration), expected);
  assert.deepEqual(durations(pairedUnits(plain), calibration), expected);
  assert.deepEqual(durations(withInputIndex(plain, () => 0), calibration), expected);
});

test('続け打ちのステップは、かなの中・かなの境目の値も使わず、続け打ちの値か0になる', () => {
  // 全て続け打ちで、遷移はChainに入る。ステップ1はかなの中、ステップ2はかなの境目。
  const analysis = pairedUnits(repeating(4, [range(0, 4)]));
  const values = { 'chain-within': 11, 'chain-boundary': 22, 'other-within': 33, chain: 44 };
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead(values)), 0);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 2, withOverhead(values)), 0);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withOverhead({ ...values, repeat: 9 })), 9);
  assert.equal(playbackKeystrokeOverheadMs(analysis, 1, withRepeat(125, values)), 0);
});

test('同指連続のステップが構造の種類の値を使う時も、かなの中・かなの境目の値を選ぶ', () => {
  // 距離0の同指連続なら、移動の時間は続け打ちの時間と同じ200。
  const near = withInputIndex(withSameFinger(0), () => 0);
  // sfbの値が無く、同指連続の移動を考慮する設定。ステップ1は直前と同じ入力単位なのでかなの中。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ 'other-within': 50, 'other-boundary': 10 }), 1), 250);
  assert.equal(playbackStepDurationMs(withSameFinger(0), 1, 1, true, withOverhead({ 'other-within': 50, 'other-boundary': 10 }), 1), 210);
  // sfbの値があれば、それを使う。
  assert.equal(playbackStepDurationMs(near, 1, 1, true, withOverhead({ 'other-within': 50, sfb: 10 }), 1), 210);
});

test('句読点を打つステップとその直後のステップにも、かなの中・かなの境目の値を足す', () => {
  // 測定が外すのは句読点の前後の間隔で、再生は外さない。入力単位は2打ずつ。
  const base = pairedUnits(alternating(4));
  const punctuated = { ...base, strokes: base.strokes.map((item, index) => ({ ...item, inputChar: index < 2 ? '、' : 'あ' })) } as PlaybackTimingAnalysis;
  const calibration = withOverhead({ 'other-within': 10, 'other-boundary': 70 });
  assert.deepEqual(durations(punctuated, calibration), durations(base, calibration));
  assert.deepEqual(durations(punctuated, calibration), [270, 210, 270, 210]);
});

test('配列に無い文字を読み飛ばした所の前後のステップは、かなの境目になる', () => {
  // 「か」と「な」の間の1文字は配列に無く、読み飛ばす。「か」「な」は2打ずつで、それぞれの2打目がかなの中。
  const layout = LAYOUT_BY_ID.get('qwerty');
  assert.ok(layout);
  const trace = generateTrace('か漢な', layout, geometry, { windowSize: 3, sfbHomeCost: true });
  assert.equal(trace.skipped, 1);
  const analysis = { strokes: trace.strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
  const calibration = withOverhead({ 'other-within': 10, 'other-boundary': 70 });
  assert.deepEqual(trace.strokes.map((_, index) => playbackKeystrokeOverheadMs(analysis, index, calibration)), [70, 10, 70, 10]);
});

test('同指連続の再生時間は、測った往復の間隔I(f)になる（s・o・cが0、倍率1）', () => {
  // 続け打ちの時間r=200ms、往復の間隔I=450ms、距離2uの指のm = (450 - 200) / 2 = 125 ms/u。
  const calibration: PlaybackCalibration = { ...BASE, fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: { LI: 125 } };
  assert.equal(playbackStepDurationMs(withSameFinger(2), 1, 1, true, calibration, 1), 450);
  // 距離0なら続け打ちの時間、距離が倍なら移動の分だけ延びる。
  assert.equal(playbackStepDurationMs(withSameFinger(0), 1, 1, true, calibration, 1), 200);
  assert.equal(playbackStepDurationMs(withSameFinger(4), 1, 1, true, calibration, 1), 700);
});

test('全指の移動時間（§3.8のmove）は距離 × 1uあたりの時間で、続け打ちの時間を含まず、距離0なら0', () => {
  const calibration: PlaybackCalibration = { ...BASE, fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: { LI: 125 } };
  const move = (finger: Finger, distance: number, multiplier = 1) =>
    playbackFingerMoveMs(at(finger), at(finger, 0, distance), finger, 5, calibration, multiplier);
  assert.equal(move('LI', 2), 250);
  assert.equal(move('LI', 0), 0);
  assert.equal(move('LI', 2, 2), 125);
  // 測っていない指は代表値の100ms/u。
  assert.equal(move('RP', 3), 300);
});

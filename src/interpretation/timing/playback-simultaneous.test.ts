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
import { SIMULTANEOUS_KINDS, median, type PlaybackCalibration, type SimultaneousKind } from './calibration.ts';
import {
  playbackNormalMs,
  playbackSimultaneousBaseMs,
  playbackSimultaneousOverheadMs,
  playbackStepDurationMs,
  playbackTimingSchedule,
  PLAYBACK_MIN_STEP_MS,
  type PlaybackTimingAnalysis,
} from './playback.ts';
import { measureSentence, type SentenceTap } from './sentence-measurement.ts';
import { strokeSimultaneousKind } from './stroke-structure.ts';

const geometry = buildGeometry('row-staggered');

const home = (finger: Finger, dx = 0, dy = 0): Point => ({
  x: geometry.homes[finger].x + dx,
  y: geometry.homes[finger].y + dy,
});

function press(finger: Finger, point: Point = home(finger), sfb = false, distance = 0): Press {
  const key: Key = { id: `k-${finger}`, finger, x: point.x, y: point.y, row: 2, col: 0 };
  return { finger, keys: [key], target: point, origin: { at: point, from: 'home' }, gap: 1, distance, sfb };
}

/** 押下を複数持つストローク。押下の順は引数の順。 */
function stroke(index: number, presses: readonly Press[], roles: readonly ('output' | 'trigger' | 'held-trigger')[] = []): Stroke {
  return {
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
    participations: presses.map((p, at) => ({
      hand: p.finger.startsWith('L') ? 'left' : 'right',
      finger: p.finger,
      keys: p.keys,
      roles: [roles[at] ?? 'output'],
    })),
    presses: [...presses],
    distance: presses.reduce((sum, p) => sum + p.distance, 0),
    positions: Object.fromEntries(
      ALL_FINGERS.map((finger) => [finger, presses.find((p) => p.finger === finger)?.target ?? home(finger)]),
    ) as Stroke['positions'],
  };
}

const single = (index: number, finger: Finger) => stroke(index, [press(finger)]);
const chord = (index: number, ...fingers: Finger[]) => stroke(index, fingers.map((finger) => press(finger)));

function analysisOf(strokes: readonly Stroke[]): PlaybackTimingAnalysis {
  return { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
}

/** 基準は全部5/秒（`normalMs`は200）。 */
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

const withSimultaneous = (
  simultaneousOverheadMs: PlaybackCalibration['simultaneousOverheadMs'],
  more: Partial<PlaybackCalibration> = {},
): PlaybackCalibration => ({ ...BASE, ...more, simultaneousOverheadMs });

const durations = (analysis: PlaybackTimingAnalysis, calibration: PlaybackCalibration, sameFingerDelay = false, multiplier = 1) =>
  analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 1, sameFingerDelay, calibration, multiplier));

/** 単打と、3つの分け方の同時押しを並べた列。 */
const MIXED = analysisOf([
  single(0, 'LI'),
  chord(1, 'LI', 'RI'), // 両手
  single(2, 'RI'),
  chord(3, 'RI', 'RM'), // 片手
  chord(4, 'RT', 'RI'), // 親指
  single(5, 'LI'),
]);

test('同時押しのストロークの分け方は、押下の指に親指を含むか、左右の手にまたがるかで決まる', () => {
  assert.equal(strokeSimultaneousKind(single(0, 'LI')), undefined);
  assert.equal(strokeSimultaneousKind(chord(0, 'LI', 'RI')), 'both-hands');
  assert.equal(strokeSimultaneousKind(chord(0, 'RI', 'RM')), 'one-hand');
  assert.equal(strokeSimultaneousKind(chord(0, 'RT', 'RI')), 'thumb');
  assert.equal(strokeSimultaneousKind(chord(0, 'LT', 'RI')), 'thumb');
  assert.equal(strokeSimultaneousKind(chord(0, 'LT', 'LI', 'RI')), 'thumb');
});

test('保持を始めるストロークは層キーと文字キーが別の指なら同時押し、保持を続けるストロークの層キーは押下に入らない', () => {
  // 保持を始めるストローク: 層キー（親指）と文字キーが押下に入る。
  const start = stroke(0, [press('LT'), press('RI')], ['held-trigger', 'output']);
  assert.equal(strokeSimultaneousKind(start), 'thumb');
  // 保持を続けるストローク: 押し続けている層キーは押下に入らず、文字キーの押下だけを持つ。
  const keep = stroke(1, [press('RI')]);
  assert.equal(strokeSimultaneousKind(keep), undefined);
});

test('1本の指で2つのキーを押すストロークは、押下の指が1つなので同時押しに入れない', () => {
  const doubled = single(0, 'RI');
  const extraKey: Key = { id: 'k-RI-2', finger: 'RI', x: 0, y: 0, row: 2, col: 1 };
  doubled.presses[0] = { ...doubled.presses[0], keys: [...doubled.presses[0].keys, extraKey] };
  assert.equal(doubled.presses[0].keys.length, 2);
  assert.equal(strokeSimultaneousKind(doubled), undefined);
});

test('同時押しの上乗せは、同時押しのストロークそのもののステップに、分け方の値で足す', () => {
  const calibration = withSimultaneous({ 'both-hands': 30, 'one-hand': 40, thumb: 50 });
  assert.deepEqual(durations(MIXED, calibration), [200, 230, 200, 240, 250, 200]);
});

test('同時押しの上乗せが保存されていない保存値は、今と同じ時間になる', () => {
  const expected = [200, 200, 200, 200, 200, 200];
  assert.deepEqual(durations(MIXED, BASE), expected);
  assert.deepEqual(durations(MIXED, withSimultaneous(undefined)), expected);
  assert.deepEqual(durations(MIXED, withSimultaneous({})), expected);
  // 持たない分け方には、別の分け方の値を使わない。
  assert.deepEqual(durations(MIXED, withSimultaneous({ thumb: 50 })), [200, 200, 200, 200, 250, 200]);
});

test('個人速度が無い時は、同時押しの上乗せを足さない', () => {
  assert.equal(playbackSimultaneousOverheadMs(MIXED.strokes[1], undefined), 0);
  assert.equal(playbackStepDurationMs(MIXED, 1, 5, false, undefined, 1), 200);
});

test('同時押しの上乗せは打鍵の上乗せと同じ場所（normalMsの側）に足し、再生倍率が掛かる', () => {
  const calibration = withSimultaneous({ 'both-hands': 30 }, { keystrokeOverheadMs: { other: 10 } });
  // (200 + 10 + 30) / 2
  assert.equal(playbackStepDurationMs(MIXED, 1, 1, false, calibration, 2), 120);
  // 同時押しでないステップは(200 + 10) / 2
  assert.equal(playbackStepDurationMs(MIXED, 0, 1, false, calibration, 2), 105);
});

test('同時押しの上乗せが負の時も、足した時間は下限に当たる', () => {
  const calibration = withSimultaneous({ 'both-hands': -190 });
  assert.equal(playbackStepDurationMs(MIXED, 1, 1, false, calibration, 1), PLAYBACK_MIN_STEP_MS);
  assert.equal(playbackStepDurationMs(MIXED, 1, 1, false, withSimultaneous({ 'both-hands': -100 }), 1), 100);
  // 倍率で割る前に下限を当てる。
  assert.equal(playbackStepDurationMs(MIXED, 1, 1, false, calibration, 2), PLAYBACK_MIN_STEP_MS / 2);
});

test('同指連続の押下を含む同時押しは、sを持つ時はmaxの外にsとcを足し、持たない時はnormalMsの側にoとcを足す', () => {
  const first = chord(0, 'LI', 'RI');
  const still = analysisOf([first, stroke(1, [press('LI', home('LI'), true, 0), press('RI')])]);
  // 距離0なら移動の時間はr（200）で、基準の時間（200）と同じ。
  assert.equal(playbackStepDurationMs(still, 1, 1, true, withSimultaneous({ 'both-hands': 30 }), 1), 230);
  assert.equal(
    playbackStepDurationMs(still, 1, 1, true, withSimultaneous({ 'both-hands': 30 }, { keystrokeOverheadMs: { sfb: 20 } }), 1),
    250,
  );
  // 移動の時間が律速する時、cは移動の時間に足さない（sを持たない式）。移動の時間は200 + 2 × 200。
  const moved = analysisOf([first, stroke(1, [press('LI', home('LI', 0, 2), true, 2), press('RI')])]);
  assert.equal(playbackStepDurationMs(moved, 1, 1, true, withSimultaneous({ 'both-hands': 30 }, { fallbackMoveMsPerUnit: 200 }), 1), 600);
});

test('同時押しの上乗せは§3.8の指の移動時間に足さない', () => {
  const options = { allFingerMovementDelay: true, geometry };
  const stepMs = (analysis: PlaybackTimingAnalysis, calibration: PlaybackCalibration) => {
    const step = playbackTimingSchedule(analysis, 1, false, calibration, 1, options)[1];
    return step.endMs - step.startMs;
  };
  // 右の人差し指が遠いキーへ動く同時押し。移動に400ミリ秒かかり、基準の時間（200 + c）より長い。
  const far = analysisOf([chord(0, 'LI', 'RI'), stroke(1, [press('LI'), press('RI', home('RI', 0, 4), false, 4)])]);
  // 移動の時間が律速するので、cの有無で変わらない（cを移動の時間に足さず、基準の時間と足し合わせもしない）。
  assert.equal(stepMs(far, BASE), 400);
  assert.equal(stepMs(far, withSimultaneous({ 'both-hands': 50 })), 400);
  // 移動が基準の時間に収まる時は、cの分だけ長くなる。
  const near = analysisOf([chord(0, 'LI', 'RI'), chord(1, 'LI', 'RI')]);
  assert.equal(stepMs(near, BASE), 200);
  assert.equal(stepMs(near, withSimultaneous({ 'both-hands': 50 })), 250);
});

test('同時押しのストロークを持たない列は、同時押しの上乗せがあっても時間が変わらない', () => {
  const singles = analysisOf([single(0, 'LI'), single(1, 'RI'), single(2, 'RM'), single(3, 'RI')]);
  const all = withSimultaneous({ 'both-hands': 90, 'one-hand': 80, thumb: 70 });
  assert.deepEqual(durations(singles, all, true), durations(singles, BASE, true));
});

test('親指を含む同じ手の組の基準は、同手・別指の代表値になる', () => {
  // 通常速度5/秒（200ミリ秒）、同手・別指の代表値4/秒（250ミリ秒）。
  const calibration: PlaybackCalibration = { ...BASE, sameHandDifferentFingerActionsPerSecond: 4 };
  const normalMsAt = (strokes: readonly Stroke[], index: number, withCalibration = calibration) =>
    playbackNormalMs(analysisOf(strokes), index, withCalibration);
  // 親指→人差し指
  assert.equal(normalMsAt([single(0, 'RT'), single(1, 'RI')], 1), 250);
  // 人差し指→親指
  assert.equal(normalMsAt([single(0, 'RI'), single(1, 'RT')], 1), 250);
  // 親指を含む同時押しを続ける
  assert.equal(normalMsAt([chord(0, 'RT', 'RI'), chord(1, 'RT', 'RI')], 1), 250);
  // 左手の親指と左手の別の指
  assert.equal(normalMsAt([single(0, 'LT'), single(1, 'LM')], 1), 250);
  // 異手は親指を含んでも異手の基準（通常速度）
  assert.equal(normalMsAt([single(0, 'LT'), single(1, 'RI')], 1), 200);
  // 親指どうしの同じ指は、同手・別指ではない。
  assert.equal(normalMsAt([single(0, 'RT'), single(1, 'RT')], 1), 200);
});

test('指の組の識別子を作れる組があれば、親指を含む組より先にその組の値を使う', () => {
  const calibration: PlaybackCalibration = {
    ...BASE,
    sameHandDifferentFingerActionsPerSecond: 4,
    sameHandDifferentFingerActionsPerDirectedPair: { 'RI>RM': 2.5 },
  };
  // 直前の押下を順に取る。親指と他の指の組は識別子を作れず、右手の人差し指から中指の組が見つかる。
  const analysis = analysisOf([chord(0, 'RT', 'RI'), chord(1, 'RM', 'RT')]);
  assert.equal(playbackNormalMs(analysis, 1, calibration), 400);
});

test('同時押しの基準の時間は、押下の指の並びを持つストロークを続けて打つステップのnormalMsになる', () => {
  const calibration: PlaybackCalibration = {
    ...BASE,
    actionsPerSecondByDirection: { 'L→R': 8, 'R→L': 4 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'RI:RM': 3 },
    sameHandDifferentFingerActionsPerDirectedPair: { 'RI>RM': 2.5, 'RM>RI': 1 },
  };
  // 両手: 左手の人差し指、右手の人差し指の並びの向きはR→L
  assert.equal(playbackSimultaneousBaseMs('both-hands', calibration), 250);
  // 片手: 右手の人差し指から中指の方向別の値
  assert.equal(playbackSimultaneousBaseMs('one-hand', calibration), 400);
  // 親指: 同手・別指の代表値
  assert.equal(playbackSimultaneousBaseMs('thumb', calibration), 500);
  // 方向別の値が無ければ、順序なしの組の値、代表値、通常速度の順に落ちる。
  const withoutDirected = { ...calibration, sameHandDifferentFingerActionsPerDirectedPair: undefined, actionsPerSecondByDirection: undefined };
  assert.equal(playbackSimultaneousBaseMs('both-hands', withoutDirected), 200);
  assert.equal(playbackSimultaneousBaseMs('one-hand', withoutDirected), 1000 / 3);
  const withoutPair = { ...withoutDirected, sameHandDifferentFingerActionsPerSecondByPair: {} };
  assert.equal(playbackSimultaneousBaseMs('one-hand', withoutPair), 500);
});

test('基準の時間は、再生がステップのnormalMsを求める関数と同じ値になる', () => {
  const calibration: PlaybackCalibration = {
    ...BASE,
    actionsPerSecondByDirection: { 'L→R': 8, 'R→L': 4 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerDirectedPair: { 'RI>RM': 2.5 },
  };
  const fingers: Readonly<Record<SimultaneousKind, readonly Finger[]>> = {
    'both-hands': ['LI', 'RI'],
    'one-hand': ['RI', 'RM'],
    thumb: ['RT', 'RI'],
  };
  for (const kind of SIMULTANEOUS_KINDS) {
    const analysis = analysisOf([chord(0, ...fingers[kind]), chord(1, ...fingers[kind])]);
    assert.equal(playbackSimultaneousBaseMs(kind, calibration), playbackNormalMs(analysis, 1, calibration), kind);
  }
});

test('打鍵の上乗せが0・倍率1で、指の移動で延びず下限に当たらない時、同じ同時押しを続けて打った再生の時間は、測った間隔の中央値と一致する', () => {
  const calibration: PlaybackCalibration = {
    ...BASE,
    actionsPerSecondByDirection: { 'L→R': 8, 'R→L': 4 },
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerDirectedPair: { 'RI>RM': 2.5 },
  };
  const intervals = [280, 300, 290, 310, 305, 295, 285, 300, 320];
  const middle = median(intervals);
  assert.equal(middle, 300);
  const fingers: Readonly<Record<SimultaneousKind, readonly Finger[]>> = {
    'both-hands': ['LI', 'RI'],
    'one-hand': ['RI', 'RM'],
    thumb: ['RT', 'RI'],
  };
  for (const kind of SIMULTANEOUS_KINDS) {
    const overhead: number = (middle ?? 0) - playbackSimultaneousBaseMs(kind, calibration);
    const measured: PlaybackCalibration = { ...calibration, simultaneousOverheadMs: { [kind]: overhead } };
    const analysis = analysisOf(Array.from({ length: 6 }, (_, index) => chord(index, ...fingers[kind])));
    for (let index = 1; index < 6; index++) {
      assert.ok(Math.abs(playbackStepDurationMs(analysis, index, 1, true, measured, 1) - (middle ?? 0)) < 1e-9, `${kind} ${index}`);
    }
    // 全指の移動時間で律速する再生でも、同じ位置を押す同時押しは移動で延びないので、一致する。
    const schedule = playbackTimingSchedule(analysis, 1, true, measured, 1, { allFingerMovementDelay: true, geometry });
    for (let index = 1; index < 6; index++) {
      assert.ok(Math.abs((schedule[index].endMs - schedule[index].startMs) - (middle ?? 0)) < 1e-9, `${kind} schedule ${index}`);
    }
  }
});

test('文章を打つ測定の基準の時間は、同時押しのストロークのステップで同時押しの上乗せを含む', () => {
  // 左右の人差し指の単打と、両手の同時押しを並べる。通常速度5/秒（200ミリ秒）。
  const strokes = [single(0, 'LI'), single(1, 'RI'), chord(2, 'LI', 'RI'), single(3, 'LI')];
  const analysis = analysisOf(strokes);
  // 間隔は全部300ミリ秒。
  const taps: SentenceTap[] = strokes.map((_, index) => ({ atMs: index * 300, clean: true }));
  const without = measureSentence([{ sentence: 0, analysis, taps }], BASE);
  const withC = measureSentence([{ sentence: 0, analysis, taps }], withSimultaneous({ 'both-hands': 60 }));
  // 3つのステップの差の合計: 同時押しのステップだけ、差が60小さくなる。
  const sumOf = (measurement: typeof without) => measurement.kinds.other.differenceMs! * measurement.counts.other;
  assert.equal(without.counts.other, 3);
  assert.equal(withC.counts.other, 3);
  assert.ok(Math.abs(sumOf(without) - 3 * 100) < 1e-9);
  assert.ok(Math.abs(sumOf(withC) - (3 * 100 - 60)) < 1e-9);
  // 基準の時間の平均も、同時押しのステップの分だけ増える。
  assert.ok(Math.abs(withC.kinds.other.baseMs! * 3 - (3 * 200 + 60)) < 1e-9);
});

test('同時押しの上乗せを持つ保存値でも、同時押しでないステップだけの測定は変わらない', () => {
  const strokes = [single(0, 'LI'), single(1, 'RI'), single(2, 'LI'), single(3, 'RI')];
  const analysis = analysisOf(strokes);
  const taps: SentenceTap[] = strokes.map((_, index) => ({ atMs: index * 300, clean: true }));
  assert.deepEqual(
    measureSentence([{ sentence: 0, analysis, taps }], withSimultaneous({ 'both-hands': 60, thumb: 10 })),
    measureSentence([{ sentence: 0, analysis, taps }], BASE),
  );
});

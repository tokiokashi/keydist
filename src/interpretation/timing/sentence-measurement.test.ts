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
import type { PlaybackTimingAnalysis } from './playback.ts';
import {
  SENTENCE_MIN_SAMPLES,
  applySentenceMeasurement as applyWithCurrent,
  measureSentence,
  type SentenceTap,
} from './sentence-measurement.ts';

const geometry = buildGeometry('row-staggered');

const home = (finger: Finger): Point => ({ ...geometry.homes[finger] });

function press(finger: Finger, sfb = false): Press {
  const point = home(finger);
  const key: Key = { id: `k-${finger}`, finger, x: point.x, y: point.y, row: 2, col: 0 };
  return { finger, keys: [key], target: point, origin: { at: point, from: 'home' }, gap: 1, distance: 0, sfb };
}

function stroke(index: number, p: Press): Stroke {
  return {
    index,
    char: String(index),
    inputChar: String(index),
    inputIndex: index,
    selectionIndex: index,
    aggregationGroupId: 'single',
    classifications: [],
    triggerKeys: [],
    pairedTriggerKeys: [],
    participations: [{ hand: p.finger.startsWith('L') ? 'left' : 'right', finger: p.finger, keys: p.keys, roles: ['output'] }],
    presses: [p],
    distance: 0,
    positions: Object.fromEntries(ALL_FINGERS.map((finger) => [finger, home(finger)])) as Stroke['positions'],
  };
}

const range = (startStrokeIndex: number, endStrokeIndex: number) => ({ startStrokeIndex, endStrokeIndex });

/** 左右の人差し指を交互に打つ列（すべて異手の遷移）。通常速度5/秒なら `normalMs` は200。 */
function alternating(count: number, chains: ReturnType<typeof range>[] = [], arpeggioSpans: ReturnType<typeof range>[] = [], sfbAt: readonly number[] = []): PlaybackTimingAnalysis {
  const strokes = Array.from({ length: count }, (_, index) =>
    stroke(index, press(index % 2 === 0 ? 'LI' : 'RI', sfbAt.includes(index))));
  return { strokes, transitions: [], chains, arpeggioSpans } as unknown as PlaybackTimingAnalysis;
}

/** 保存の時の保存値が、測定を始めた時の保存値と同じ場合。 */
function applySentenceMeasurement(base: PlaybackCalibration | undefined, analysis: PlaybackTimingAnalysis, taps: readonly SentenceTap[], nowMs: number) {
  return applyWithCurrent(base, analysis, taps, nowMs, base);
}

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerSpeedUnitsPerSecond: {},
  fallbackFingerSpeedUnitsPerSecond: 10,
  measuredAt: 1,
};

/** ストローク `i` の直前からの間隔を `intervalOf(i)` にした記録。最初のストロークは時刻0。 */
function tapsFor(count: number, intervalOf: (index: number) => number, cleanAt: (index: number) => boolean = () => true): SentenceTap[] {
  const taps: SentenceTap[] = [];
  let atMs = 0;
  for (let index = 0; index < count; index++) {
    if (index > 0) atMs += intervalOf(index);
    taps.push({ atMs, clean: cleanAt(index) });
  }
  return taps;
}

test('間隔からnormalMsを引いた差の中央値を、その他の上乗せにする', () => {
  const analysis = alternating(20);
  const taps = tapsFor(20, () => 260);
  const { counts, overheadMs } = measureSentence(analysis, SAVED, taps);
  assert.deepEqual(counts, { arpeggio: 0, chain: 0, other: 19 });
  assert.deepEqual(overheadMs, { other: 60 });
});

test('構造の種類ごとに別の上乗せを求める', () => {
  // 遷移1〜13はArpeggio、15〜27はChain、0・14・28〜39はその他。
  const analysis = alternating(40, [range(14, 28)], [range(0, 14)]);
  const interval = (index: number) => (index <= 13 ? 230 : index >= 15 && index <= 27 ? 250 : 300);
  const { counts, overheadMs } = measureSentence(analysis, SAVED, tapsFor(40, interval));
  assert.deepEqual(counts, { arpeggio: 13, chain: 13, other: 13 });
  assert.deepEqual(overheadMs, { arpeggio: 30, chain: 50, other: 100 });
});

test('文節の切れ目のような長い間は、中央値で外れる', () => {
  const analysis = alternating(30);
  const { overheadMs } = measureSentence(analysis, SAVED, tapsFor(30, (index) => (index % 10 === 0 ? 3000 : 250)));
  assert.deepEqual(overheadMs, { other: 50 });
});

test('間隔がnormalMsより短くて中央値が負なら0にする', () => {
  const { overheadMs } = measureSentence(alternating(20), SAVED, tapsFor(20, () => 150));
  assert.deepEqual(overheadMs, { other: 0 });
});

test('normalMsは測定の時点の保存値で求める', () => {
  const slower = { ...SAVED, actionsPerSecond: 4 };
  const { overheadMs } = measureSentence(alternating(20), slower, tapsFor(20, () => 300));
  assert.deepEqual(overheadMs, { other: 50 });
});

test('数えたストロークが10未満の種類は上乗せを持たない', () => {
  const analysis = alternating(30, [], [range(0, 10)]);
  const { counts, overheadMs } = measureSentence(analysis, SAVED, tapsFor(30, () => 250));
  assert.equal(counts.arpeggio, 9);
  assert.equal(counts.other, 20);
  assert.equal(SENTENCE_MIN_SAMPLES, 10);
  assert.deepEqual(overheadMs, { other: 50 });
});

test('最初のストローク、違うキーを押したストローク、同指連続を含むストロークは数えない', () => {
  const analysis = alternating(30, [], [], [5, 6]);
  const taps = tapsFor(30, () => 250, (index) => index !== 10 && index !== 11);
  const { counts } = measureSentence(analysis, SAVED, taps);
  // 29の遷移から、同指連続の2つと、違うキーを押した2つを除く。
  assert.equal(counts.other, 25);
});

test('違うキーを押したストロークの間隔は、中央値に影響しない', () => {
  const analysis = alternating(30);
  const taps = tapsFor(30, (index) => (index === 12 ? 5000 : 250), (index) => index !== 12);
  assert.deepEqual(measureSentence(analysis, SAVED, taps).overheadMs, { other: 50 });
});

test('反映は1打ごとの上乗せだけを置き換え、他の項目と、持たない種類の古い値は残さない', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { chain: 5, other: 5 } };
  const analysis = alternating(20);
  const result = applySentenceMeasurement(base, analysis, tapsFor(20, () => 260), 99);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration, { ...SAVED, keystrokeOverheadMs: { other: 60 }, measuredAt: 99 });
});

test('保存の時の保存値が、測定を始めた時の保存値と違えば、保存せずに測り直させる', () => {
  const analysis = alternating(20);
  const taps = tapsFor(20, () => 260);
  const same = applyWithCurrent(SAVED, analysis, taps, 1, { ...SAVED });
  assert.ok(same.ok);
  for (const current of [
    { ...SAVED, actionsPerSecond: 6 },
    { ...SAVED, fingerSpeedUnitsPerSecond: { LI: 9 } },
    { ...SAVED, keystrokeOverheadMs: { other: 1 } },
    undefined,
  ]) {
    assert.deepEqual(applyWithCurrent(SAVED, analysis, taps, 1, current), { ok: false, reason: 'changed' });
  }
});

test('保存値が無い時は反映できない', () => {
  const result = applySentenceMeasurement(undefined, alternating(20), tapsFor(20, () => 260), 1);
  assert.deepEqual(result, { ok: false, reason: 'no-saved-value' });
});

test('どの種類も10未満なら、保存せずに測り直させる', () => {
  const result = applySentenceMeasurement(SAVED, alternating(8), tapsFor(8, () => 260), 1);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'too-few');
  assert.equal(!result.ok && result.reason === 'too-few' && result.measurement.counts.other, 7);
});

test('上乗せが範囲を外れたら、保存せずに測り直させる', () => {
  const result = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 1300), 1);
  assert.equal(!result.ok && result.reason, 'out-of-range');
  // 1000ミリ秒ちょうどは保存できる
  const edge = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 1200), 1);
  assert.ok(edge.ok);
  assert.deepEqual(edge.calibration.keystrokeOverheadMs, { other: 1000 });
});
